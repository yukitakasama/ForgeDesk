use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
    time::timeout,
};

use crate::models::CliRuntime;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

struct CodexProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    runtime: CliRuntime,
}

pub struct CodexManager {
    process: Mutex<Option<CodexProcess>>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
    next_id: AtomicU64,
}

impl Default for CodexManager {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
        }
    }
}

impl CodexManager {
    pub async fn start(
        &self,
        app: &AppHandle,
        cli_path: Option<String>,
        experimental_api: bool,
    ) -> Result<CliRuntime> {
        self.stop().await?;
        let path = resolve_cli(cli_path.as_deref())?;
        let version = run_cli_text(&path, &["--version"]).await?;
        let mut command = cli_command(&path);
        command
            .args(["app-server", "--stdio"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        configure_background_process(&mut command);

        let mut child = command
            .spawn()
            .with_context(|| format!("无法启动 Codex app-server：{}", path.to_string_lossy()))?;
        let stdin = child.stdin.take().context("Codex app-server 没有 stdin")?;
        let stdout = child
            .stdout
            .take()
            .context("Codex app-server 没有 stdout")?;
        let stderr = child
            .stderr
            .take()
            .context("Codex app-server 没有 stderr")?;
        let stdin = Arc::new(Mutex::new(stdin));
        let pending = Arc::clone(&self.pending);
        let event_app = app.clone();

        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        let parsed = serde_json::from_str::<Value>(&line);
                        match parsed {
                            Ok(message) => {
                                let is_response = message.get("method").is_none()
                                    && (message.get("result").is_some()
                                        || message.get("error").is_some());
                                if is_response {
                                    if let Some(key) = message.get("id").map(id_key) {
                                        if let Some(sender) = pending.lock().await.remove(&key) {
                                            let _ = sender.send(message.clone());
                                            continue;
                                        }
                                    }
                                }
                                let _ = event_app.emit("codex://message", message);
                            }
                            Err(error) => {
                                let _ = event_app.emit(
                                    "codex://message",
                                    json!({
                                        "method": "forgedesk/protocolError",
                                        "params": {
                                            "message": error.to_string(),
                                            "linePreview": redact_line(&line)
                                        }
                                    }),
                                );
                            }
                        }
                    }
                    Ok(None) => {
                        let _ = event_app.emit(
                            "codex://message",
                            json!({
                                "method": "forgedesk/disconnected",
                                "params": { "reason": "Codex app-server 已结束输出" }
                            }),
                        );
                        break;
                    }
                    Err(error) => {
                        let _ = event_app.emit(
                            "codex://message",
                            json!({
                                "method": "forgedesk/disconnected",
                                "params": { "reason": error.to_string() }
                            }),
                        );
                        break;
                    }
                }
            }
        });

        let stderr_app = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = stderr_app.emit(
                    "codex://message",
                    json!({
                        "method": "forgedesk/diagnostic",
                        "params": { "message": redact_line(&line) }
                    }),
                );
            }
        });

        let runtime = CliRuntime {
            path: path.to_string_lossy().to_string(),
            version: version.trim().to_string(),
            bundled: false,
            experimental_api,
            codex_home: None,
            platform_os: None,
        };
        *self.process.lock().await = Some(CodexProcess {
            child,
            stdin,
            runtime: runtime.clone(),
        });

        let initialized = self
            .request(
                "initialize",
                json!({
                    "clientInfo": {
                        "name": "forgedesk",
                        "title": "ForgeDesk",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "capabilities": {
                        "experimentalApi": experimental_api,
                        "requestAttestation": false,
                        "mcpServerOpenaiFormElicitation": true,
                        "optOutNotificationMethods": []
                    }
                }),
            )
            .await?;
        self.notify("initialized", None).await?;

        let mut process = self.process.lock().await;
        let active = process
            .as_mut()
            .context("Codex app-server 在初始化后意外退出")?;
        active.runtime.codex_home = initialized
            .get("codexHome")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        active.runtime.platform_os = initialized
            .get("platformOs")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        tracing::info!(
            cli_path = %active.runtime.path,
            cli_version = %active.runtime.version,
            codex_home = ?active.runtime.codex_home,
            experimental_api = active.runtime.experimental_api,
            "Codex app-server 初始化成功"
        );
        Ok(active.runtime.clone())
    }

    pub async fn stop(&self) -> Result<()> {
        if let Some(mut process) = self.process.lock().await.take() {
            let _ = process.child.kill().await;
            let _ = process.child.wait().await;
        }
        self.pending.lock().await.clear();
        Ok(())
    }

    pub async fn runtime(&self) -> Option<CliRuntime> {
        self.process
            .lock()
            .await
            .as_ref()
            .map(|process| process.runtime.clone())
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let key = id.to_string();
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(key.clone(), sender);
        let payload = json!({
            "id": id,
            "method": method,
            "params": params
        });
        if let Err(error) = self.write_message(&payload).await {
            self.pending.lock().await.remove(&key);
            return Err(error);
        }
        let response = timeout(REQUEST_TIMEOUT, receiver)
            .await
            .context("Codex 请求超时")?
            .context("Codex 请求通道已关闭")?;
        if let Some(error) = response.get("error") {
            return Err(anyhow!("Codex 请求失败：{error}"));
        }
        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }

    pub async fn notify(&self, method: &str, params: Option<Value>) -> Result<()> {
        let mut payload = json!({ "method": method });
        if let Some(params) = params {
            payload["params"] = params;
        }
        self.write_message(&payload).await
    }

    pub async fn respond(&self, id: Value, result: Value) -> Result<()> {
        self.write_message(&json!({ "id": id, "result": result }))
            .await
    }

    async fn write_message(&self, payload: &Value) -> Result<()> {
        let stdin = {
            let process = self.process.lock().await;
            process
                .as_ref()
                .map(|process| Arc::clone(&process.stdin))
                .context("Codex app-server 尚未启动")?
        };
        let mut writer = stdin.lock().await;
        let mut encoded = serde_json::to_vec(payload)?;
        encoded.push(b'\n');
        writer.write_all(&encoded).await?;
        writer.flush().await?;
        Ok(())
    }
}

pub async fn run_cli_json(path: &Path, args: &[&str]) -> Result<Value> {
    let text = run_cli_text(path, args).await?;
    serde_json::from_str(&text)
        .with_context(|| format!("CLI 没有返回有效 JSON：{}", redact_line(&text)))
}

pub async fn run_cli_text(path: &Path, args: &[&str]) -> Result<String> {
    let mut command = cli_command(path);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_background_process(&mut command);
    let output = command.output().await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("{}", redact_line(&stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn resolve_cli(override_path: Option<&str>) -> Result<PathBuf> {
    if let Some(path) = override_path.filter(|path| !path.trim().is_empty()) {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
        anyhow::bail!("指定的 Codex CLI 不存在：{}", path.to_string_lossy());
    }
    if let Ok(path) = std::env::var("CODEX_CLI_PATH") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }
    let candidates: &[&str] = if cfg!(windows) {
        &["codex.cmd", "codex.exe", "codex"]
    } else {
        &["codex"]
    };
    for candidate in candidates {
        if let Ok(path) = which::which(candidate) {
            let extension = path
                .extension()
                .and_then(|extension| extension.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if extension != "ps1" {
                return Ok(path);
            }
        }
    }
    anyhow::bail!("未找到 Codex CLI。请安装 Codex CLI 或在设置中选择其路径。")
}

fn cli_command(path: &Path) -> Command {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if cfg!(windows) && matches!(extension.as_str(), "cmd" | "bat") {
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/C"]).arg(path);
        command
    } else {
        Command::new(path)
    }
}

fn id_key(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        _ => value.to_string(),
    }
}

fn redact_line(line: &str) -> String {
    let mut redacted = line.trim().replace('\0', "");
    for marker in ["sk-", "Bearer ", "OPENAI_API_KEY=", "CODEX_ACCESS_TOKEN="] {
        if let Some(index) = redacted.find(marker) {
            redacted.truncate(index);
            redacted.push_str("[已脱敏]");
        }
    }
    redacted.chars().take(2000).collect()
}

fn configure_background_process(command: &mut Command) {
    #[cfg(windows)]
    {
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    }
}

#[cfg(test)]
mod tests {
    use super::{id_key, redact_line};
    use serde_json::json;

    #[test]
    fn request_ids_are_stable_keys() {
        assert_eq!(id_key(&json!(42)), "42");
        assert_eq!(id_key(&json!("approval-7")), "approval-7");
    }

    #[test]
    fn diagnostics_redact_known_secret_markers() {
        let line = "request failed OPENAI_API_KEY=secret-value";
        let redacted = redact_line(line);
        assert_eq!(redacted, "request failed [已脱敏]");
        assert!(!redacted.contains("secret-value"));
    }

    #[test]
    fn diagnostics_are_bounded() {
        let line = "x".repeat(5000);
        assert_eq!(redact_line(&line).chars().count(), 2000);
    }
}
