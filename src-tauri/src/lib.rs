mod codex;
mod commands;
mod db;
mod models;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

use codex::CodexManager;
use commands::{
    automation_delete, automation_list, automation_save, cli_doctor, cloud_list, codex_request,
    codex_respond, codex_start, codex_stop, git_status, project_add, project_list, project_remove,
    worktree_create, worktree_remove,
};
use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let database = tauri::async_runtime::block_on(Database::open(&app.handle()))?;
            app.manage(database);
            app.manage(CodexManager::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            codex_start,
            codex_stop,
            codex_request,
            codex_respond,
            project_list,
            project_add,
            project_remove,
            automation_list,
            automation_save,
            automation_delete,
            cli_doctor,
            cloud_list,
            git_status,
            worktree_create,
            worktree_remove
        ])
        .run(tauri::generate_context!())
        .expect("ForgeDesk 启动失败");
}
