use std::{fs, path::Path};

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::{sqlite::SqliteConnectOptions, ConnectOptions, SqlitePool};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::models::{AutomationInput, AutomationSpec, Project};

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn open(app: &AppHandle) -> Result<Self> {
        let data_dir = app.path().app_data_dir().context("无法确定应用数据目录")?;
        fs::create_dir_all(&data_dir).context("无法创建应用数据目录")?;
        let database_path = data_dir.join("forgedesk.sqlite3");
        let options = SqliteConnectOptions::new()
            .filename(database_path)
            .create_if_missing(true)
            .disable_statement_logging();
        let pool = SqlitePool::connect_with(options)
            .await
            .context("无法打开 ForgeDesk 数据库")?;
        let database = Self { pool };
        database.migrate().await?;
        Ok(database)
    }

    async fn migrate(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                root TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                last_opened_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS automations (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                project_id TEXT NOT NULL,
                rrule TEXT NOT NULL,
                timezone TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                execution_environment TEXT NOT NULL DEFAULT 'worktree',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS automation_runs (
                id TEXT PRIMARY KEY NOT NULL,
                automation_id TEXT NOT NULL,
                thread_id TEXT,
                status TEXT NOT NULL,
                output_preview TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                FOREIGN KEY(automation_id) REFERENCES automations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS inbox_items (
                id TEXT PRIMARY KEY NOT NULL,
                kind TEXT NOT NULL,
                source_id TEXT,
                title TEXT NOT NULL,
                body TEXT,
                unread INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            "#,
        )
        .execute(&self.pool)
        .await
        .context("数据库迁移失败")?;
        Ok(())
    }

    pub async fn list_projects(&self) -> Result<Vec<Project>> {
        let projects = sqlx::query_as::<_, Project>(
            "SELECT id, name, root, created_at, last_opened_at FROM projects ORDER BY last_opened_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(projects)
    }

    pub async fn add_project(&self, root: &str) -> Result<Project> {
        let canonical = fs::canonicalize(root).context("项目目录不存在或无法访问")?;
        if !canonical.is_dir() {
            anyhow::bail!("选择的路径不是目录");
        }
        let root = canonical.to_string_lossy().to_string();
        let name = Path::new(&root)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or(&root)
            .to_string();
        let now = Utc::now().to_rfc3339();

        if let Some(existing) = sqlx::query_as::<_, Project>(
            "SELECT id, name, root, created_at, last_opened_at FROM projects WHERE root = ?",
        )
        .bind(&root)
        .fetch_optional(&self.pool)
        .await?
        {
            sqlx::query("UPDATE projects SET last_opened_at = ? WHERE id = ?")
                .bind(&now)
                .bind(&existing.id)
                .execute(&self.pool)
                .await?;
            return Ok(Project {
                last_opened_at: now,
                ..existing
            });
        }

        let project = Project {
            id: Uuid::new_v4().to_string(),
            name,
            root,
            created_at: now.clone(),
            last_opened_at: now,
        };
        sqlx::query(
            "INSERT INTO projects (id, name, root, created_at, last_opened_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.root)
        .bind(&project.created_at)
        .bind(&project.last_opened_at)
        .execute(&self.pool)
        .await?;
        Ok(project)
    }

    pub async fn remove_project(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_automations(&self) -> Result<Vec<AutomationSpec>> {
        let automations = sqlx::query_as::<_, AutomationSpec>(
            r#"
            SELECT id, name, prompt, project_id, rrule, timezone, enabled,
                   execution_environment, created_at, updated_at
            FROM automations
            ORDER BY updated_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(automations)
    }

    pub async fn save_automation(&self, input: AutomationInput) -> Result<AutomationSpec> {
        let now = Utc::now().to_rfc3339();
        let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let created_at: Option<String> =
            sqlx::query_scalar("SELECT created_at FROM automations WHERE id = ?")
                .bind(&id)
                .fetch_optional(&self.pool)
                .await?;
        let automation = AutomationSpec {
            id,
            name: input.name,
            prompt: input.prompt,
            project_id: input.project_id,
            rrule: input.rrule,
            timezone: input.timezone,
            enabled: input.enabled,
            execution_environment: input.execution_environment,
            created_at: created_at.unwrap_or_else(|| now.clone()),
            updated_at: now,
        };
        sqlx::query(
            r#"
            INSERT INTO automations (
                id, name, prompt, project_id, rrule, timezone, enabled,
                execution_environment, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                prompt = excluded.prompt,
                project_id = excluded.project_id,
                rrule = excluded.rrule,
                timezone = excluded.timezone,
                enabled = excluded.enabled,
                execution_environment = excluded.execution_environment,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&automation.id)
        .bind(&automation.name)
        .bind(&automation.prompt)
        .bind(&automation.project_id)
        .bind(&automation.rrule)
        .bind(&automation.timezone)
        .bind(automation.enabled)
        .bind(&automation.execution_environment)
        .bind(&automation.created_at)
        .bind(&automation.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(automation)
    }

    pub async fn delete_automation(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM automations WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
