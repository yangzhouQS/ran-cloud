// modules/sql-studio/storage/service.rs — 基于 rusqlite 的本地持久化存储
// 使用 SQLite 文件存储连接配置（JSON 格式）和查询历史

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::shared::error::AppError;
use super::models::QueryHistory;
use super::super::connection::models::ConnectionConfig;

/// SQL Studio 本地存储服务
/// 使用 rusqlite 管理一个 SQLite 文件用于持久化
pub struct StorageService {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
}

impl StorageService {
    /// 创建并初始化存储服务
    /// `data_dir`: 存储目录（不含文件名）
    pub fn new(data_dir: PathBuf) -> Result<Self, AppError> {
        // 确保目录存在
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::Storage(format!("创建数据目录失败: {}", e)))?;

        let db_path = data_dir.join("sql_studio.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::Storage(format!("打开存储数据库失败: {}", e)))?;

        // 启用 WAL 模式提升并发性能
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::Storage(format!("设置 WAL 模式失败: {}", e)))?;

        // 创建表结构
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS saved_connections (
                id TEXT PRIMARY KEY,
                config_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS query_history (
                id TEXT PRIMARY KEY,
                connection_id TEXT NOT NULL,
                database TEXT,
                sql TEXT NOT NULL,
                executed_at TEXT NOT NULL,
                execution_time_ms INTEGER,
                row_count INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_query_history_conn_time
                ON query_history(connection_id, executed_at DESC);
            "
        ).map_err(|e| AppError::Storage(format!("初始化存储表失败: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
            data_dir,
        })
    }

    // ========== 连接配置 ==========

    /// 加载所有已保存的连接配置
    pub fn list_connection_configs(&self) -> Result<Vec<ConnectionConfig>, AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let mut stmt = conn.prepare(
            "SELECT config_json FROM saved_connections ORDER BY updated_at ASC"
        ).map_err(|e| AppError::Storage(format!("准备查询失败: {}", e)))?;

        let json_strings: Vec<String> = stmt.query_map([], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| AppError::Storage(format!("查询连接配置失败: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

        let configs: Vec<ConnectionConfig> = json_strings
            .into_iter()
            .filter_map(|json| serde_json::from_str::<ConnectionConfig>(&json).ok())
            .collect();

        Ok(configs)
    }

    /// 保存连接配置（INSERT OR REPLACE）
    pub fn save_connection_config(&self, config: &ConnectionConfig) -> Result<(), AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let config_json = serde_json::to_string(config)?;
        let updated_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO saved_connections (id, config_json, updated_at) VALUES (?1, ?2, ?3)",
            params![config.id, config_json, updated_at],
        ).map_err(|e| AppError::Storage(format!("保存连接配置失败: {}", e)))?;

        log::info!("[StorageService] 连接配置已保存: {} ({})", config.name, config.id);
        Ok(())
    }

    /// 删除连接配置
    pub fn delete_connection_config(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        conn.execute("DELETE FROM saved_connections WHERE id = ?1", params![id])
            .map_err(|e| AppError::Storage(format!("删除连接配置失败: {}", e)))?;

        log::info!("[StorageService] 连接配置已删除: {}", id);
        Ok(())
    }

    // ========== 查询历史 ==========

    /// 保存查询历史记录
    pub fn save_query_history(&self, history: &QueryHistory) -> Result<(), AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        conn.execute(
            "INSERT OR REPLACE INTO query_history
                (id, connection_id, database, sql, executed_at, execution_time_ms, row_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                history.id,
                history.connection_id,
                history.database,
                history.sql,
                history.executed_at,
                history.execution_time_ms,
                history.row_count,
            ],
        ).map_err(|e| AppError::Storage(format!("保存查询历史失败: {}", e)))?;

        Ok(())
    }

    /// 查询历史记录列表
    pub fn list_query_history(
        &self,
        connection_id: &str,
        limit: u32,
    ) -> Result<Vec<QueryHistory>, AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let mut stmt = conn.prepare(
            "SELECT id, connection_id, database, sql, executed_at, execution_time_ms, row_count
             FROM query_history
             WHERE connection_id = ?1
             ORDER BY executed_at DESC
             LIMIT ?2"
        ).map_err(|e| AppError::Storage(format!("准备查询失败: {}", e)))?;

        let rows = stmt.query_map(params![connection_id, limit], |row| {
            Ok(QueryHistory {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                database: row.get(2)?,
                sql: row.get(3)?,
                executed_at: row.get(4)?,
                execution_time_ms: row.get(5)?,
                row_count: row.get(6)?,
            })
        }).map_err(|e| AppError::Storage(format!("查询历史记录失败: {}", e)))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| AppError::Storage(format!("读取行失败: {}", e)))?);
        }
        Ok(result)
    }

    /// 清理过期的查询历史（保留最近 N 条）
    pub fn cleanup_query_history(&self, keep_count: u32) -> Result<u64, AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let affected = conn.execute(
            "DELETE FROM query_history WHERE id NOT IN (
                SELECT id FROM query_history ORDER BY executed_at DESC LIMIT ?1
            )",
            params![keep_count],
        ).map_err(|e| AppError::Storage(format!("清理查询历史失败: {}", e)))?;

        Ok(affected as u64)
    }

    // ========== SQL 草稿文件持久化 ==========

    /// 保存 SQL 草稿到文件
    /// 路径: {data_dir}/sql_drafts/{connection_id}/draft.sql
    pub fn save_draft_sql(&self, connection_id: &str, sql: &str) -> Result<(), AppError> {
        let draft_dir = self.data_dir.join("sql_drafts").join(connection_id);
        std::fs::create_dir_all(&draft_dir)
            .map_err(|e| AppError::Storage(format!("创建草稿目录失败: {}", e)))?;

        let draft_path = draft_dir.join("draft.sql");
        std::fs::write(&draft_path, sql)
            .map_err(|e| AppError::Storage(format!("保存草稿文件失败: {}", e)))?;

        Ok(())
    }

    /// 加载 SQL 草稿文件
    /// 文件不存在时返回 None
    pub fn load_draft_sql(&self, connection_id: &str) -> Result<Option<String>, AppError> {
        let draft_path = self.data_dir.join("sql_drafts").join(connection_id).join("draft.sql");

        if !draft_path.exists() {
            return Ok(None);
        }

        let content = std::fs::read_to_string(&draft_path)
            .map_err(|e| AppError::Storage(format!("读取草稿文件失败: {}", e)))?;

        Ok(Some(content))
    }

    /// 删除连接的草稿目录
    pub fn delete_draft_sql(&self, connection_id: &str) -> Result<(), AppError> {
        let draft_dir = self.data_dir.join("sql_drafts").join(connection_id);

        if draft_dir.exists() {
            std::fs::remove_dir_all(&draft_dir)
                .map_err(|e| AppError::Storage(format!("删除草稿目录失败: {}", e)))?;
        }

        Ok(())
    }
}
