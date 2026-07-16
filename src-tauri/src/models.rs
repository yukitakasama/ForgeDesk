use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRuntime {
    pub path: String,
    pub version: String,
    pub bundled: bool,
    pub experimental_api: bool,
    pub codex_home: Option<String>,
    pub platform_os: Option<String>,
}

#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root: String,
    pub created_at: String,
    pub last_opened_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSpec {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub project_id: String,
    pub rrule: String,
    pub timezone: String,
    pub enabled: bool,
    pub execution_environment: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudTask {
    pub id: String,
    pub title: Option<String>,
    pub status: Option<String>,
    pub environment_id: Option<String>,
    pub updated_at: Option<String>,
    pub raw: Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub root: String,
    pub path: String,
    pub thread_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationInput {
    pub id: Option<String>,
    pub name: String,
    pub prompt: String,
    pub project_id: String,
    pub rrule: String,
    pub timezone: String,
    pub enabled: bool,
    pub execution_environment: String,
}
