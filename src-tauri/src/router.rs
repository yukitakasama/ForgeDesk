use std::{
    collections::BTreeMap,
    convert::Infallible,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{anyhow, bail, Context, Result};
use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tokio::{net::TcpListener, sync::Mutex, task::JoinHandle};
use uuid::Uuid;

const CREDENTIAL_TARGET: &str = "ForgeDesk/RouterApiKey";
const MAX_UPSTREAM_ERROR_LENGTH: usize = 4000;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RouterConfig {
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    #[serde(alias = "upstream_format")]
    pub upstream_format: UpstreamFormat,
    pub endpoint: String,
    pub model: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpstreamFormat {
    OpenaiChat,
    AnthropicMessages,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterKeyStatus {
    pub saved: bool,
    pub supported: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterTestResult {
    pub ok: bool,
    pub status: u16,
    pub latency_ms: u128,
}

#[derive(Clone, Debug)]
pub struct RouterRuntime {
    pub base_url: String,
    pub model: String,
    pub token: String,
}

struct RunningRouter {
    config: RouterConfig,
    runtime: RouterRuntime,
    task: JoinHandle<()>,
}

pub struct RouterManager {
    running: Mutex<Option<RunningRouter>>,
    client: Client,
}

impl Default for RouterManager {
    fn default() -> Self {
        Self {
            running: Mutex::new(None),
            client: Client::builder()
                .connect_timeout(Duration::from_secs(15))
                .build()
                .expect("HTTP 客户端初始化不应失败"),
        }
    }
}

impl Drop for RouterManager {
    fn drop(&mut self) {
        if let Ok(mut running) = self.running.try_lock() {
            if let Some(running) = running.take() {
                running.task.abort();
            }
        }
    }
}

impl RouterManager {
    pub async fn ensure_started(&self, config: RouterConfig) -> Result<RouterRuntime> {
        validate_config(&config)?;
        read_api_key().context("无法读取上游 API Key")?;

        let mut running = self.running.lock().await;
        if let Some(active) = running.as_ref() {
            if active.config == config && !active.task.is_finished() {
                return Ok(active.runtime.clone());
            }
        }

        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .context("无法绑定 ForgeDesk 本地路由端口")?;
        let address = listener
            .local_addr()
            .context("无法读取 ForgeDesk 本地路由地址")?;
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let state = Arc::new(RouteState {
            config: config.clone(),
            token: token.clone(),
            client: self.client.clone(),
        });
        let app = Router::new()
            .route("/v1/responses", post(responses_handler))
            .with_state(state);
        let task = tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, app).await {
                tracing::error!(error = %error, "ForgeDesk 本地路由异常结束");
            }
        });
        let runtime = RouterRuntime {
            base_url: format!("http://{address}"),
            model: config.model.clone(),
            token,
        };

        if let Some(previous) = running.replace(RunningRouter {
            config,
            runtime: runtime.clone(),
            task,
        }) {
            previous.task.abort();
        }
        tracing::info!(address = %address, "ForgeDesk 本地路由已启动");
        Ok(runtime)
    }

    pub async fn test(&self, config: RouterConfig) -> Result<RouterTestResult> {
        validate_config(&config)?;
        let api_key = read_api_key().context("无法读取上游 API Key")?;
        let request = json!({
            "input": "Reply with OK.",
            "max_output_tokens": 1,
            "stream": false
        });
        let body = match config.upstream_format {
            UpstreamFormat::OpenaiChat => responses_to_chat(&request, &config.model)?,
            UpstreamFormat::AnthropicMessages => responses_to_anthropic(&request, &config.model)?,
        };
        let started = Instant::now();
        let response = upstream_request(&self.client, &config, &api_key, body)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .context("无法连接上游 API")?;
        let status = response.status();
        if !status.is_success() {
            let message = upstream_error_message(response).await;
            bail!("上游 API 返回 {}：{}", status.as_u16(), message);
        }
        Ok(RouterTestResult {
            ok: true,
            status: status.as_u16(),
            latency_ms: started.elapsed().as_millis(),
        })
    }

    pub async fn stop(&self) {
        if let Some(running) = self.running.lock().await.take() {
            running.task.abort();
            tracing::info!("ForgeDesk 本地路由已停止");
        }
    }
}

struct RouteState {
    config: RouterConfig,
    token: String,
    client: Client,
}

async fn responses_handler(
    State(state): State<Arc<RouteState>>,
    headers: HeaderMap,
    Json(request): Json<Value>,
) -> Response {
    if !authorized(&headers, &state.token) {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "本地路由 Bearer token 无效",
            "authentication_error",
            "invalid_router_token",
        );
    }
    if request.get("stream").and_then(Value::as_bool) == Some(false) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "ForgeDesk 本地路由仅支持 stream=true",
            "invalid_request_error",
            "stream_required",
        );
    }
    let api_key = match read_api_key() {
        Ok(api_key) => api_key,
        Err(error) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &error.to_string(),
                "router_error",
                "credential_unavailable",
            )
        }
    };
    let body = match state.config.upstream_format {
        UpstreamFormat::OpenaiChat => responses_to_chat(&request, &state.config.model),
        UpstreamFormat::AnthropicMessages => responses_to_anthropic(&request, &state.config.model),
    };
    let body = match body {
        Ok(body) => body,
        Err(error) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &error.to_string(),
                "invalid_request_error",
                "invalid_responses_request",
            )
        }
    };
    let response = match upstream_request(&state.client, &state.config, &api_key, body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                &format!("无法连接上游 API：{error}"),
                "upstream_error",
                "upstream_connection_error",
            )
        }
    };
    if !response.status().is_success() {
        let status = response.status();
        let message = upstream_error_message(response).await;
        return json_error(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            &format!("上游 API 返回 {}：{message}", status.as_u16()),
            "upstream_error",
            "upstream_http_error",
        );
    }

    streaming_response(response, state.config.upstream_format, &state.config.model)
}

fn upstream_request(
    client: &Client,
    config: &RouterConfig,
    api_key: &str,
    body: Value,
) -> reqwest::RequestBuilder {
    let request = client.post(upstream_url(config)).json(&body);
    match config.upstream_format {
        UpstreamFormat::OpenaiChat => request.bearer_auth(api_key),
        UpstreamFormat::AnthropicMessages => request
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
    }
}

fn streaming_response(
    response: reqwest::Response,
    format: UpstreamFormat,
    model: &str,
) -> Response {
    let model = model.to_string();
    let stream = async_stream::stream! {
        let mut upstream = response.bytes_stream();
        let mut decoder = SseDecoder::default();
        let mut accumulator = ResponseAccumulator::new(model);
        while let Some(chunk) = upstream.next().await {
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(error) => {
                    let failed = accumulator.failed_event(&format!("读取上游响应失败：{error}"));
                    yield Ok::<Bytes, Infallible>(Bytes::from(encode_sse(&failed)));
                    return;
                }
            };
            for data in decoder.push(&chunk) {
                if data == "[DONE]" {
                    break;
                }
                let event = match serde_json::from_str::<Value>(&data) {
                    Ok(event) => event,
                    Err(_) => continue,
                };
                if let Some(error) = upstream_stream_error(&event) {
                    let failed = accumulator.failed_event(&error);
                    yield Ok::<Bytes, Infallible>(Bytes::from(encode_sse(&failed)));
                    return;
                }
                let translated = match format {
                    UpstreamFormat::OpenaiChat => accumulator.ingest_openai(&event),
                    UpstreamFormat::AnthropicMessages => accumulator.ingest_anthropic(&event),
                };
                for translated_event in translated {
                    yield Ok::<Bytes, Infallible>(Bytes::from(encode_sse(&translated_event)));
                }
            }
        }
        for event in accumulator.final_events() {
            yield Ok::<Bytes, Infallible>(Bytes::from(encode_sse(&event)));
        }
    };
    let mut response = Response::new(Body::from_stream(stream));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/event-stream; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    response
}

pub(crate) fn responses_to_chat(request: &Value, model: &str) -> Result<Value> {
    let mut messages = Vec::new();
    if let Some(instructions) = request.get("instructions").and_then(Value::as_str) {
        messages.push(json!({ "role": "system", "content": instructions }));
    }
    append_chat_input(&mut messages, request.get("input"))?;
    if messages.is_empty() {
        bail!("Responses 请求缺少 input");
    }

    let mut result = Map::new();
    result.insert("model".into(), json!(model));
    result.insert("messages".into(), Value::Array(messages));
    result.insert("stream".into(), Value::Bool(true));
    if let Some(tools) = request.get("tools").and_then(Value::as_array) {
        result.insert(
            "tools".into(),
            Value::Array(tools.iter().filter_map(chat_tool).collect()),
        );
    }
    if let Some(choice) = request.get("tool_choice") {
        result.insert("tool_choice".into(), chat_tool_choice(choice));
    }
    copy_field(request, &mut result, "temperature", "temperature");
    copy_field(request, &mut result, "top_p", "top_p");
    copy_field(
        request,
        &mut result,
        "max_output_tokens",
        "max_completion_tokens",
    );
    copy_field(
        request,
        &mut result,
        "parallel_tool_calls",
        "parallel_tool_calls",
    );
    Ok(Value::Object(result))
}

fn append_chat_input(messages: &mut Vec<Value>, input: Option<&Value>) -> Result<()> {
    match input {
        Some(Value::String(text)) => messages.push(json!({ "role": "user", "content": text })),
        Some(Value::Array(items)) => {
            for item in items {
                let item_type = item
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("message");
                match item_type {
                    "message" => {
                        let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
                        let content = chat_content(item.get("content"));
                        messages.push(json!({ "role": role, "content": content }));
                    }
                    "function_call" => {
                        let call_id = string_field(item, "call_id", "call");
                        let name = string_field(item, "name", "tool");
                        let arguments = string_value(item.get("arguments"));
                        messages.push(json!({
                            "role": "assistant",
                            "tool_calls": [{
                                "id": call_id,
                                "type": "function",
                                "function": { "name": name, "arguments": arguments }
                            }]
                        }));
                    }
                    "function_call_output" => messages.push(json!({
                        "role": "tool",
                        "tool_call_id": string_field(item, "call_id", "call"),
                        "content": string_value(item.get("output"))
                    })),
                    _ => {}
                }
            }
        }
        Some(_) => bail!("Responses input 必须是字符串或数组"),
        None => {}
    }
    Ok(())
}

fn chat_content(content: Option<&Value>) -> Value {
    match content {
        Some(Value::String(text)) => json!(text),
        Some(Value::Array(parts)) => Value::Array(
            parts
                .iter()
                .filter_map(|part| match part.get("type").and_then(Value::as_str) {
                    Some("input_text" | "output_text" | "text") => Some(json!({
                        "type": "text",
                        "text": part.get("text").and_then(Value::as_str).unwrap_or_default()
                    })),
                    Some("input_image") => part.get("image_url").map(|url| {
                        json!({
                            "type": "image_url",
                            "image_url": { "url": url }
                        })
                    }),
                    _ => None,
                })
                .collect(),
        ),
        _ => json!(""),
    }
}

fn chat_tool(tool: &Value) -> Option<Value> {
    if tool.get("type").and_then(Value::as_str) != Some("function") {
        return None;
    }
    let mut function = Map::new();
    for field in ["name", "description", "parameters", "strict"] {
        if let Some(value) = tool.get(field) {
            function.insert(field.to_string(), value.clone());
        }
    }
    Some(json!({ "type": "function", "function": function }))
}

fn chat_tool_choice(choice: &Value) -> Value {
    if choice.get("type").and_then(Value::as_str) == Some("function") {
        json!({
            "type": "function",
            "function": { "name": choice.get("name").cloned().unwrap_or(Value::Null) }
        })
    } else {
        choice.clone()
    }
}

pub(crate) fn responses_to_anthropic(request: &Value, model: &str) -> Result<Value> {
    let mut messages = Vec::new();
    let mut system = request
        .get("instructions")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    append_anthropic_input(&mut messages, &mut system, request.get("input"))?;
    if messages.is_empty() {
        bail!("Responses 请求缺少 input");
    }

    let mut result = Map::new();
    result.insert("model".into(), json!(model));
    result.insert("messages".into(), Value::Array(messages));
    result.insert("stream".into(), Value::Bool(true));
    result.insert(
        "max_tokens".into(),
        request
            .get("max_output_tokens")
            .cloned()
            .unwrap_or_else(|| json!(4096)),
    );
    if !system.is_empty() {
        result.insert("system".into(), json!(system));
    }
    if let Some(tools) = request.get("tools").and_then(Value::as_array) {
        result.insert(
            "tools".into(),
            Value::Array(tools.iter().filter_map(anthropic_tool).collect()),
        );
    }
    if let Some(choice) = request.get("tool_choice") {
        result.insert("tool_choice".into(), anthropic_tool_choice(choice));
    }
    copy_field(request, &mut result, "temperature", "temperature");
    copy_field(request, &mut result, "top_p", "top_p");
    Ok(Value::Object(result))
}

fn append_anthropic_input(
    messages: &mut Vec<Value>,
    system: &mut String,
    input: Option<&Value>,
) -> Result<()> {
    match input {
        Some(Value::String(text)) => messages.push(json!({ "role": "user", "content": text })),
        Some(Value::Array(items)) => {
            for item in items {
                let item_type = item
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("message");
                match item_type {
                    "message" => {
                        let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
                        let content = anthropic_content(item.get("content"));
                        if matches!(role, "system" | "developer") {
                            let text = content
                                .iter()
                                .filter_map(|part| part.get("text").and_then(Value::as_str))
                                .collect::<Vec<_>>()
                                .join("\n");
                            if !system.is_empty() && !text.is_empty() {
                                system.push_str("\n\n");
                            }
                            system.push_str(&text);
                        } else {
                            messages.push(json!({ "role": role, "content": content }));
                        }
                    }
                    "function_call" => messages.push(json!({
                        "role": "assistant",
                        "content": [{
                            "type": "tool_use",
                            "id": string_field(item, "call_id", "call"),
                            "name": string_field(item, "name", "tool"),
                            "input": parsed_arguments(item.get("arguments"))
                        }]
                    })),
                    "function_call_output" => messages.push(json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": string_field(item, "call_id", "call"),
                            "content": string_value(item.get("output"))
                        }]
                    })),
                    _ => {}
                }
            }
        }
        Some(_) => bail!("Responses input 必须是字符串或数组"),
        None => {}
    }
    Ok(())
}

fn anthropic_content(content: Option<&Value>) -> Vec<Value> {
    match content {
        Some(Value::String(text)) => vec![json!({ "type": "text", "text": text })],
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| match part.get("type").and_then(Value::as_str) {
                Some("input_text" | "output_text" | "text") => Some(json!({
                    "type": "text",
                    "text": part.get("text").and_then(Value::as_str).unwrap_or_default()
                })),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn anthropic_tool(tool: &Value) -> Option<Value> {
    if tool.get("type").and_then(Value::as_str) != Some("function") {
        return None;
    }
    Some(json!({
        "name": tool.get("name")?,
        "description": tool.get("description").cloned().unwrap_or_else(|| json!("")),
        "input_schema": tool.get("parameters").cloned().unwrap_or_else(|| json!({ "type": "object" }))
    }))
}

fn anthropic_tool_choice(choice: &Value) -> Value {
    match choice.as_str() {
        Some("auto") => json!({ "type": "auto" }),
        Some("required") => json!({ "type": "any" }),
        Some("none") => json!({ "type": "none" }),
        _ if choice.get("type").and_then(Value::as_str) == Some("function") => json!({
            "type": "tool",
            "name": choice.get("name").cloned().unwrap_or(Value::Null)
        }),
        _ => choice.clone(),
    }
}

#[derive(Default)]
struct SseDecoder {
    buffer: Vec<u8>,
}

impl SseDecoder {
    fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();
        while let Some((end, delimiter_length)) = find_sse_boundary(&self.buffer) {
            let frame = self.buffer.drain(..end).collect::<Vec<_>>();
            self.buffer.drain(..delimiter_length);
            let frame = String::from_utf8_lossy(&frame);
            let data = frame
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(str::trim_start)
                .collect::<Vec<_>>()
                .join("\n");
            if !data.is_empty() {
                events.push(data);
            }
        }
        events
    }
}

fn find_sse_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|window| window == b"\n\n");
    let crlf = buffer.windows(4).position(|window| window == b"\r\n\r\n");
    match (lf, crlf) {
        (Some(left), Some(right)) if left <= right => Some((left, 2)),
        (Some(_), Some(right)) => Some((right, 4)),
        (Some(left), None) => Some((left, 2)),
        (None, Some(right)) => Some((right, 4)),
        (None, None) => None,
    }
}

#[derive(Default)]
struct ToolCall {
    id: String,
    name: String,
    arguments: String,
}

struct ResponseAccumulator {
    response_id: String,
    message_id: String,
    model: String,
    text: String,
    tools: BTreeMap<usize, ToolCall>,
    input_tokens: u64,
    output_tokens: u64,
    sequence: u64,
}

impl ResponseAccumulator {
    fn new(model: String) -> Self {
        let suffix = Uuid::new_v4().simple().to_string();
        Self {
            response_id: format!("resp_{}", &suffix[..24]),
            message_id: format!("msg_{}", &suffix[..24]),
            model,
            text: String::new(),
            tools: BTreeMap::new(),
            input_tokens: 0,
            output_tokens: 0,
            sequence: 0,
        }
    }

    fn ingest_openai(&mut self, event: &Value) -> Vec<Value> {
        if let Some(usage) = event.get("usage") {
            self.input_tokens = usage
                .get("prompt_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(self.input_tokens);
            self.output_tokens = usage
                .get("completion_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(self.output_tokens);
        }
        let Some(delta) = event
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("delta"))
        else {
            return Vec::new();
        };
        let mut translated = Vec::new();
        if let Some(text) = delta.get("content").and_then(Value::as_str) {
            self.text.push_str(text);
            translated.push(self.text_delta(text));
        }
        if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
            for call in calls {
                let index = call.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                let target = self.tools.entry(index).or_default();
                if let Some(id) = call.get("id").and_then(Value::as_str) {
                    target.id = id.to_string();
                }
                if let Some(function) = call.get("function") {
                    if let Some(name) = function.get("name").and_then(Value::as_str) {
                        target.name.push_str(name);
                    }
                    if let Some(arguments) = function.get("arguments").and_then(Value::as_str) {
                        target.arguments.push_str(arguments);
                    }
                }
            }
        }
        translated
    }

    fn ingest_anthropic(&mut self, event: &Value) -> Vec<Value> {
        match event.get("type").and_then(Value::as_str) {
            Some("message_start") => {
                self.input_tokens = event
                    .pointer("/message/usage/input_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
            }
            Some("content_block_start") => {
                let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                if event.pointer("/content_block/type").and_then(Value::as_str) == Some("tool_use")
                {
                    let target = self.tools.entry(index).or_default();
                    target.id = event
                        .pointer("/content_block/id")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    target.name = event
                        .pointer("/content_block/name")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    if let Some(input) = event.pointer("/content_block/input") {
                        if input.as_object().is_some_and(|input| !input.is_empty()) {
                            target.arguments = input.to_string();
                        }
                    }
                }
            }
            Some("content_block_delta") => {
                let delta_type = event.pointer("/delta/type").and_then(Value::as_str);
                if delta_type == Some("text_delta") {
                    if let Some(text) = event.pointer("/delta/text").and_then(Value::as_str) {
                        self.text.push_str(text);
                        return vec![self.text_delta(text)];
                    }
                } else if delta_type == Some("input_json_delta") {
                    let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                    if let Some(arguments) =
                        event.pointer("/delta/partial_json").and_then(Value::as_str)
                    {
                        self.tools
                            .entry(index)
                            .or_default()
                            .arguments
                            .push_str(arguments);
                    }
                }
            }
            Some("message_delta") => {
                self.output_tokens = event
                    .pointer("/usage/output_tokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(self.output_tokens);
            }
            _ => {}
        }
        Vec::new()
    }

    fn text_delta(&mut self, delta: &str) -> Value {
        self.sequence += 1;
        json!({
            "type": "response.output_text.delta",
            "sequence_number": self.sequence,
            "item_id": self.message_id,
            "output_index": 0,
            "content_index": 0,
            "delta": delta
        })
    }

    fn final_events(mut self) -> Vec<Value> {
        let mut events = Vec::new();
        let mut output = Vec::new();
        let mut output_index = 0;
        if !self.text.is_empty() || self.tools.is_empty() {
            let item = json!({
                "id": self.message_id,
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{
                    "type": "output_text",
                    "text": self.text,
                    "annotations": []
                }]
            });
            self.sequence += 1;
            events.push(json!({
                "type": "response.output_item.done",
                "sequence_number": self.sequence,
                "output_index": output_index,
                "item": item.clone()
            }));
            output.push(item);
            output_index += 1;
        }
        for (_, tool) in self.tools {
            let call_id = if tool.id.is_empty() {
                format!("call_{}", Uuid::new_v4().simple())
            } else {
                tool.id
            };
            let item = json!({
                "id": format!("fc_{}", Uuid::new_v4().simple()),
                "type": "function_call",
                "status": "completed",
                "call_id": call_id,
                "name": tool.name,
                "arguments": tool.arguments
            });
            self.sequence += 1;
            events.push(json!({
                "type": "response.output_item.done",
                "sequence_number": self.sequence,
                "output_index": output_index,
                "item": item.clone()
            }));
            output.push(item);
            output_index += 1;
        }
        self.sequence += 1;
        events.push(json!({
            "type": "response.completed",
            "sequence_number": self.sequence,
            "response": {
                "id": self.response_id,
                "object": "response",
                "status": "completed",
                "model": self.model,
                "output": output,
                "usage": {
                    "input_tokens": self.input_tokens,
                    "output_tokens": self.output_tokens,
                    "total_tokens": self.input_tokens + self.output_tokens
                }
            }
        }));
        events
    }

    fn failed_event(&mut self, message: &str) -> Value {
        self.sequence += 1;
        json!({
            "type": "response.failed",
            "sequence_number": self.sequence,
            "response": {
                "id": self.response_id,
                "object": "response",
                "status": "failed",
                "error": { "code": "upstream_stream_error", "message": message }
            }
        })
    }
}

fn encode_sse(event: &Value) -> String {
    let event_type = event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("message");
    format!("event: {event_type}\ndata: {event}\n\n")
}

fn authorized(headers: &HeaderMap, token: &str) -> bool {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        == Some(token)
}

fn json_error(status: StatusCode, message: &str, error_type: &str, code: &str) -> Response {
    (
        status,
        Json(json!({
            "error": { "message": message, "type": error_type, "code": code }
        })),
    )
        .into_response()
}

fn validate_config(config: &RouterConfig) -> Result<()> {
    if config.endpoint.trim().is_empty() {
        bail!("上游 endpoint 不能为空");
    }
    if config.model.trim().is_empty() {
        bail!("上游 model 不能为空");
    }
    let endpoint = reqwest::Url::parse(config.endpoint.trim()).context("上游 endpoint 无效")?;
    if !matches!(endpoint.scheme(), "http" | "https") {
        bail!("上游 endpoint 仅支持 http 或 https");
    }
    if endpoint.scheme() == "http"
        && !matches!(endpoint.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
    {
        bail!("远程上游必须使用 HTTPS；HTTP 仅允许本机回环地址");
    }
    Ok(())
}

fn upstream_url(config: &RouterConfig) -> String {
    let endpoint = config.endpoint.trim().trim_end_matches('/');
    let mut parsed = reqwest::Url::parse(endpoint).expect("已验证的上游 endpoint 应可再次解析");
    let path = parsed.path().trim_end_matches('/').to_string();
    let suffix = match config.upstream_format {
        UpstreamFormat::OpenaiChat => "chat/completions",
        UpstreamFormat::AnthropicMessages => "messages",
    };
    if path.ends_with(suffix) {
        endpoint.to_string()
    } else {
        let base = if path.is_empty() { "/v1" } else { &path };
        parsed.set_path(&format!("{base}/{suffix}"));
        parsed.to_string()
    }
}

async fn upstream_error_message(response: reqwest::Response) -> String {
    let bytes = response.bytes().await.unwrap_or_default();
    let text = String::from_utf8_lossy(&bytes);
    let message = serde_json::from_slice::<Value>(&bytes)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .or_else(|| value.get("message"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| text.trim().to_string());
    message.chars().take(MAX_UPSTREAM_ERROR_LENGTH).collect()
}

fn upstream_stream_error(event: &Value) -> Option<String> {
    if event.get("type").and_then(Value::as_str) == Some("error") || event.get("error").is_some() {
        return event
            .pointer("/error/message")
            .or_else(|| event.get("message"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .or_else(|| Some("上游流返回错误".to_string()));
    }
    None
}

fn copy_field(source: &Value, target: &mut Map<String, Value>, from: &str, to: &str) {
    if let Some(value) = source.get(from) {
        target.insert(to.to_string(), value.clone());
    }
}

fn string_field(value: &Value, field: &str, fallback: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn string_value(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(value) => value.to_string(),
        None => String::new(),
    }
}

fn parsed_arguments(value: Option<&Value>) -> Value {
    match value {
        Some(Value::String(arguments)) => {
            serde_json::from_str(arguments).unwrap_or_else(|_| json!({}))
        }
        Some(value) => value.clone(),
        None => json!({}),
    }
}

const fn enabled_by_default() -> bool {
    true
}

#[cfg(windows)]
pub fn save_api_key(api_key: &str) -> Result<()> {
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    if api_key.trim().is_empty() {
        bail!("API Key 不能为空");
    }
    let mut target = wide_string(CREDENTIAL_TARGET);
    let mut username = wide_string("ForgeDesk");
    let mut blob = api_key.as_bytes().to_vec();
    let blob_size = u32::try_from(blob.len()).context("API Key 长度超出系统限制")?;
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        CredentialBlobSize: blob_size,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: username.as_mut_ptr(),
        ..Default::default()
    };
    let written = unsafe { CredWriteW(&credential, 0) };
    if written == 0 {
        return Err(anyhow!(
            "Windows Credential Manager 保存失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn save_api_key(_api_key: &str) -> Result<()> {
    bail!("当前平台不支持 API Key 存储；ForgeDesk 路由仅支持 Windows Credential Manager")
}

#[cfg(windows)]
pub fn read_api_key() -> Result<String> {
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    let target = wide_string(CREDENTIAL_TARGET);
    let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
    let read = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
    if read == 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(1168) {
            bail!("尚未保存上游 API Key");
        }
        return Err(anyhow!("Windows Credential Manager 读取失败：{error}"));
    }
    let bytes = unsafe {
        let credential_ref = &*credential;
        std::slice::from_raw_parts(
            credential_ref.CredentialBlob,
            credential_ref.CredentialBlobSize as usize,
        )
        .to_vec()
    };
    unsafe { CredFree(credential.cast()) };
    String::from_utf8(bytes).context("Windows Credential Manager 中的 API Key 不是有效 UTF-8")
}

#[cfg(not(windows))]
pub fn read_api_key() -> Result<String> {
    bail!("当前平台不支持 API Key 读取；ForgeDesk 路由仅支持 Windows Credential Manager")
}

pub fn api_key_status() -> Result<RouterKeyStatus> {
    #[cfg(windows)]
    {
        match read_api_key() {
            Ok(_) => Ok(RouterKeyStatus {
                saved: true,
                supported: true,
            }),
            Err(error) if error.to_string() == "尚未保存上游 API Key" => {
                Ok(RouterKeyStatus {
                    saved: false,
                    supported: true,
                })
            }
            Err(error) => Err(error),
        }
    }
    #[cfg(not(windows))]
    {
        Ok(RouterKeyStatus {
            saved: false,
            supported: false,
        })
    }
}

#[cfg(windows)]
fn wide_string(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::{
        encode_sse, responses_to_anthropic, responses_to_chat, upstream_url, validate_config,
        ResponseAccumulator, RouterConfig, SseDecoder, UpstreamFormat,
    };
    use serde_json::{json, Value};

    fn responses_request() -> Value {
        json!({
            "instructions": "Be concise",
            "input": [
                { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "hello" }] },
                { "type": "function_call", "call_id": "call_old", "name": "lookup", "arguments": "{\"q\":\"x\"}" },
                { "type": "function_call_output", "call_id": "call_old", "output": "found" }
            ],
            "tools": [{ "type": "function", "name": "lookup", "description": "Lookup", "parameters": { "type": "object" } }],
            "max_output_tokens": 321
        })
    }

    #[test]
    fn maps_responses_request_to_openai_chat() {
        let mapped = responses_to_chat(&responses_request(), "gpt-test").unwrap();
        assert_eq!(mapped["model"], "gpt-test");
        assert_eq!(mapped["messages"][0]["role"], "system");
        assert_eq!(mapped["messages"][1]["content"][0]["text"], "hello");
        assert_eq!(mapped["messages"][2]["tool_calls"][0]["id"], "call_old");
        assert_eq!(mapped["messages"][3]["role"], "tool");
        assert_eq!(mapped["tools"][0]["function"]["name"], "lookup");
        assert_eq!(mapped["max_completion_tokens"], 321);
        assert_eq!(mapped["stream"], true);
    }

    #[test]
    fn maps_responses_request_to_anthropic_messages() {
        let mapped = responses_to_anthropic(&responses_request(), "claude-test").unwrap();
        assert_eq!(mapped["model"], "claude-test");
        assert_eq!(mapped["system"], "Be concise");
        assert_eq!(mapped["messages"][0]["content"][0]["text"], "hello");
        assert_eq!(mapped["messages"][1]["content"][0]["type"], "tool_use");
        assert_eq!(mapped["messages"][2]["content"][0]["type"], "tool_result");
        assert_eq!(mapped["tools"][0]["input_schema"]["type"], "object");
        assert_eq!(mapped["max_tokens"], 321);
        assert_eq!(mapped["stream"], true);
    }

    #[test]
    fn builds_upstream_urls_from_root_or_complete_endpoint() {
        let mut config = RouterConfig {
            enabled: true,
            upstream_format: UpstreamFormat::OpenaiChat,
            endpoint: "https://example.com/openai/v1".to_string(),
            model: "model".to_string(),
        };
        assert_eq!(
            upstream_url(&config),
            "https://example.com/openai/v1/chat/completions"
        );
        config.endpoint = "https://example.com/v1/chat/completions".to_string();
        assert_eq!(upstream_url(&config), config.endpoint);
        config.upstream_format = UpstreamFormat::AnthropicMessages;
        config.endpoint = "https://api.anthropic.com".to_string();
        assert_eq!(
            upstream_url(&config),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[test]
    fn rejects_plain_http_for_remote_upstreams() {
        let config = RouterConfig {
            enabled: true,
            upstream_format: UpstreamFormat::OpenaiChat,
            endpoint: "http://example.com/v1".to_string(),
            model: "model".to_string(),
        };
        assert!(validate_config(&config).is_err());
    }

    #[test]
    fn openai_stream_emits_complete_final_items() {
        let mut accumulator = ResponseAccumulator::new("gpt-test".to_string());
        let delta = accumulator.ingest_openai(&json!({
            "choices": [{ "delta": {
                "content": "hello",
                "tool_calls": [{ "index": 0, "id": "call_1", "function": { "name": "look", "arguments": "{\"q\":" } }]
            }}]
        }));
        accumulator.ingest_openai(&json!({
            "choices": [{ "delta": {
                "tool_calls": [{ "index": 0, "function": { "name": "up", "arguments": "\"x\"}" } }]
            }}],
            "usage": { "prompt_tokens": 2, "completion_tokens": 3 }
        }));
        assert_eq!(delta[0]["type"], "response.output_text.delta");
        let events = accumulator.final_events();
        assert_eq!(events[0]["item"]["type"], "message");
        assert_eq!(events[0]["item"]["content"][0]["text"], "hello");
        assert_eq!(events[1]["item"]["type"], "function_call");
        assert_eq!(events[1]["item"]["name"], "lookup");
        assert_eq!(events[1]["item"]["arguments"], "{\"q\":\"x\"}");
        assert_eq!(events[2]["type"], "response.completed");
        assert_eq!(events[2]["response"]["output"].as_array().unwrap().len(), 2);
        assert_eq!(events[2]["response"]["usage"]["total_tokens"], 5);
        assert!(encode_sse(&events[2]).starts_with("event: response.completed\n"));
    }

    #[test]
    fn anthropic_stream_emits_complete_final_items() {
        let mut accumulator = ResponseAccumulator::new("claude-test".to_string());
        accumulator.ingest_anthropic(&json!({
            "type": "content_block_start", "index": 1,
            "content_block": { "type": "tool_use", "id": "toolu_1", "name": "lookup", "input": {} }
        }));
        accumulator.ingest_anthropic(&json!({
            "type": "content_block_delta", "index": 0,
            "delta": { "type": "text_delta", "text": "answer" }
        }));
        accumulator.ingest_anthropic(&json!({
            "type": "content_block_delta", "index": 1,
            "delta": { "type": "input_json_delta", "partial_json": "{\"q\":\"x\"}" }
        }));
        let events = accumulator.final_events();
        assert_eq!(events[0]["item"]["content"][0]["text"], "answer");
        assert_eq!(events[1]["item"]["call_id"], "toolu_1");
        assert_eq!(events[2]["type"], "response.completed");
    }

    #[test]
    fn sse_decoder_keeps_frames_split_across_chunks() {
        let mut decoder = SseDecoder::default();
        assert!(decoder.push(b"data: {\"text\":\"").is_empty());
        let events = decoder.push("你好\"}\r\n\r\n".as_bytes());
        assert_eq!(events, vec!["{\"text\":\"你好\"}"]);
    }
}
