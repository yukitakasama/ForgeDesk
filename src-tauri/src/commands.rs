use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::PathBuf,
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::{
    codex::{resolve_cli, run_cli_json, run_cli_text, CodexManager, CodexProviderOverride},
    db::Database,
    models::{AutomationInput, AutomationSpec, CliRuntime, CloudTask, Project, WorktreeInfo},
    router::{
        api_key_status, save_api_key, RouterConfig, RouterKeyStatus, RouterManager,
        RouterTestResult,
    },
};

type CommandResult<T> = Result<T, String>;

fn command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
pub async fn codex_start(
    app: AppHandle,
    manager: State<'_, CodexManager>,
    cli_path: Option<String>,
    experimental_api: bool,
    router_config: Option<RouterConfig>,
) -> CommandResult<CliRuntime> {
    let router = app.state::<RouterManager>();
    let provider = match router_config.filter(|config| config.enabled) {
        Some(config) => {
            let runtime = router.ensure_started(config).await.map_err(command_error)?;
            Some(CodexProviderOverride {
                base_url: runtime.base_url,
                model: runtime.model,
                token: runtime.token,
            })
        }
        None => {
            router.stop().await;
            None
        }
    };
    let result = manager
        .start(&app, cli_path, experimental_api, provider)
        .await;
    if let Err(error) = &result {
        tracing::error!(error = %error, "Codex app-server 启动失败");
    }
    result.map_err(command_error)
}

#[tauri::command]
pub fn router_save_key(api_key: String) -> CommandResult<()> {
    save_api_key(&api_key).map_err(command_error)
}

#[tauri::command]
pub fn router_key_status() -> CommandResult<RouterKeyStatus> {
    api_key_status().map_err(command_error)
}

#[tauri::command]
pub async fn router_test(
    manager: State<'_, RouterManager>,
    config: RouterConfig,
) -> CommandResult<RouterTestResult> {
    manager.test(config).await.map_err(command_error)
}

#[tauri::command]
pub async fn codex_stop(manager: State<'_, CodexManager>) -> CommandResult<()> {
    manager.stop().await.map_err(command_error)
}

#[tauri::command]
pub async fn codex_request(
    manager: State<'_, CodexManager>,
    method: String,
    params: Option<Value>,
) -> CommandResult<Value> {
    manager
        .request(&method, params.unwrap_or_else(|| json!({})))
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn codex_respond(
    manager: State<'_, CodexManager>,
    id: Value,
    result: Value,
) -> CommandResult<()> {
    manager.respond(id, result).await.map_err(command_error)
}

#[tauri::command]
pub async fn project_list(database: State<'_, Database>) -> CommandResult<Vec<Project>> {
    database.list_projects().await.map_err(command_error)
}

#[tauri::command]
pub async fn project_add(database: State<'_, Database>, root: String) -> CommandResult<Project> {
    database.add_project(&root).await.map_err(command_error)
}

#[tauri::command]
pub async fn project_remove(database: State<'_, Database>, id: String) -> CommandResult<()> {
    database.remove_project(&id).await.map_err(command_error)
}

#[tauri::command]
pub async fn automation_list(database: State<'_, Database>) -> CommandResult<Vec<AutomationSpec>> {
    database.list_automations().await.map_err(command_error)
}

#[tauri::command]
pub async fn automation_save(
    database: State<'_, Database>,
    input: AutomationInput,
) -> CommandResult<AutomationSpec> {
    database.save_automation(input).await.map_err(command_error)
}

#[tauri::command]
pub async fn automation_delete(database: State<'_, Database>, id: String) -> CommandResult<()> {
    database.delete_automation(&id).await.map_err(command_error)
}

#[tauri::command]
pub async fn cli_doctor(manager: State<'_, CodexManager>) -> CommandResult<Value> {
    let path = if let Some(runtime) = manager.runtime().await {
        PathBuf::from(runtime.path)
    } else {
        resolve_cli(None).map_err(command_error)?
    };
    run_cli_json(&path, &["doctor", "--json"])
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn cloud_list(manager: State<'_, CodexManager>) -> CommandResult<Vec<CloudTask>> {
    let path = if let Some(runtime) = manager.runtime().await {
        PathBuf::from(runtime.path)
    } else {
        resolve_cli(None).map_err(command_error)?
    };
    let value = run_cli_json(&path, &["cloud", "list", "--json", "--limit", "20"])
        .await
        .map_err(command_error)?;
    let rows = value
        .as_array()
        .or_else(|| value.get("data").and_then(Value::as_array))
        .cloned()
        .unwrap_or_default();
    Ok(rows
        .into_iter()
        .filter_map(|raw| {
            let id = raw
                .get("id")
                .or_else(|| raw.get("task_id"))
                .and_then(Value::as_str)?
                .to_string();
            Some(CloudTask {
                id,
                title: raw
                    .get("title")
                    .or_else(|| raw.get("prompt"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                status: raw
                    .get("status")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                environment_id: raw
                    .get("environment_id")
                    .or_else(|| raw.get("environmentId"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                updated_at: raw
                    .get("updated_at")
                    .or_else(|| raw.get("updatedAt"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                raw,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn git_status(root: String) -> CommandResult<Value> {
    let git = which::which("git").map_err(command_error)?;
    let output = run_cli_text(
        &git,
        &[
            "-C",
            &root,
            "status",
            "--short",
            "--branch",
            "--porcelain=v2",
        ],
    )
    .await
    .map_err(command_error)?;
    Ok(json!({
        "isRepository": true,
        "output": output,
    }))
}

#[tauri::command]
pub async fn worktree_create(
    app: AppHandle,
    root: String,
    thread_id: String,
) -> CommandResult<WorktreeInfo> {
    let git = which::which("git").map_err(command_error)?;
    let canonical_root = fs::canonicalize(&root).map_err(command_error)?;
    let repository_root = run_cli_text(
        &git,
        &[
            "-C",
            &canonical_root.to_string_lossy(),
            "rev-parse",
            "--show-toplevel",
        ],
    )
    .await
    .map_err(command_error)?;
    let repository_root = fs::canonicalize(repository_root.trim()).map_err(command_error)?;

    let mut hasher = DefaultHasher::new();
    repository_root.hash(&mut hasher);
    let project_key = format!("{:016x}", hasher.finish());
    let safe_thread_id = safe_component(&thread_id);
    let base = app
        .path()
        .app_data_dir()
        .map_err(command_error)?
        .join("worktrees")
        .join(project_key);
    fs::create_dir_all(&base).map_err(command_error)?;
    let target = base.join(&safe_thread_id);
    if target.exists() {
        return Ok(WorktreeInfo {
            root: repository_root.to_string_lossy().to_string(),
            path: target.to_string_lossy().to_string(),
            thread_id,
        });
    }

    run_cli_text(
        &git,
        &[
            "-C",
            &repository_root.to_string_lossy(),
            "worktree",
            "add",
            "--detach",
            &target.to_string_lossy(),
            "HEAD",
        ],
    )
    .await
    .map_err(command_error)?;

    Ok(WorktreeInfo {
        root: repository_root.to_string_lossy().to_string(),
        path: target.to_string_lossy().to_string(),
        thread_id,
    })
}

#[tauri::command]
pub async fn worktree_remove(app: AppHandle, root: String, path: String) -> CommandResult<()> {
    let git = which::which("git").map_err(command_error)?;
    let base = app
        .path()
        .app_data_dir()
        .map_err(command_error)?
        .join("worktrees");
    let target = PathBuf::from(&path);
    let canonical_base = fs::canonicalize(&base).map_err(command_error)?;
    let canonical_target = fs::canonicalize(&target).map_err(command_error)?;
    if !canonical_target.starts_with(&canonical_base) {
        return Err("拒绝移除 ForgeDesk 工作树目录之外的路径".to_string());
    }
    run_cli_text(
        &git,
        &[
            "-C",
            &root,
            "worktree",
            "remove",
            "--force",
            &canonical_target.to_string_lossy(),
        ],
    )
    .await
    .map_err(command_error)?;
    Ok(())
}

fn safe_component(value: &str) -> String {
    let value: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect();
    if value.is_empty() {
        "thread".to_string()
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::safe_component;

    #[test]
    fn worktree_component_removes_path_separators() {
        assert_eq!(safe_component("../thread\\name"), ".._thread_name");
    }

    #[test]
    fn worktree_component_has_non_empty_fallback() {
        assert_eq!(safe_component(""), "thread");
    }
}
