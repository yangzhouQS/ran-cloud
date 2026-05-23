// modules/sql_studio/plugin/store.rs — 插件数据持久化存储
// 使用独立 SQLite 文件存储插件的 key-value 数据和启用状态

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::shared::error::AppError;

/// 插件数据存储
/// 使用独立的 plugin_store.db（与 sql_studio.db 分离）
pub struct PluginDataStore {
    conn: Mutex<Connection>,
}

impl PluginDataStore {
    /// 创建并初始化插件数据存储
    /// `data_dir`: 存储目录（将创建 plugin_store.db 文件）
    pub fn new(data_dir: PathBuf) -> Result<Self, AppError> {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::Storage(format!("创建插件数据目录失败: {}", e)))?;

        let db_path = data_dir.join("plugin_store.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::Storage(format!("打开插件存储数据库失败: {}", e)))?;

        // 启用 WAL 模式
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| AppError::Storage(format!("设置 WAL 模式失败: {}", e)))?;

        // 创建表
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS plugin_data (
                plugin_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (plugin_id, key)
            );
            CREATE TABLE IF NOT EXISTS plugin_settings (
                plugin_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            );"
        ).map_err(|e| AppError::Storage(format!("初始化插件存储表失败: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // ========== 插件 Key-Value 数据 ==========

    /// 获取插件数据
    pub fn get_data(&self, plugin_id: &str, key: &str) -> Result<Option<serde_json::Value>, AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let mut stmt = conn.prepare(
            "SELECT value FROM plugin_data WHERE plugin_id = ?1 AND key = ?2"
        ).map_err(|e| AppError::Storage(format!("准备查询失败: {}", e)))?;

        let result = stmt.query_row(params![plugin_id, key], |row| {
            row.get::<_, String>(0)
        });

        match result {
            Ok(json_str) => {
                let value: serde_json::Value = serde_json::from_str(&json_str)?;
                Ok(Some(value))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Storage(format!("查询插件数据失败: {}", e))),
        }
    }

    /// 设置插件数据
    pub fn set_data(&self, plugin_id: &str, key: &str, value: &serde_json::Value) -> Result<(), AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let json_str = serde_json::to_string(value)?;
        let updated_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO plugin_data (plugin_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![plugin_id, key, json_str, updated_at],
        ).map_err(|e| AppError::Storage(format!("保存插件数据失败: {}", e)))?;

        Ok(())
    }

    /// 列出插件所有数据键
    pub fn list_keys(&self, plugin_id: &str) -> Result<Vec<String>, AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let mut stmt = conn.prepare(
            "SELECT key FROM plugin_data WHERE plugin_id = ?1 ORDER BY key"
        ).map_err(|e| AppError::Storage(format!("准备查询失败: {}", e)))?;

        let keys: Vec<String> = stmt.query_map(params![plugin_id], |row| {
            row.get(0)
        })
        .map_err(|e| AppError::Storage(format!("查询插件键列表失败: {}", e)))?
        .filter_map(|r| r.ok())
        .collect();

        Ok(keys)
    }

    // ========== 插件启用状态 ==========

    /// 获取插件是否启用
    pub fn is_enabled(&self, plugin_id: &str) -> Result<bool, AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let mut stmt = conn.prepare(
            "SELECT enabled FROM plugin_settings WHERE plugin_id = ?1"
        ).map_err(|e| AppError::Storage(format!("准备查询失败: {}", e)))?;

        let result = stmt.query_row(params![plugin_id], |row| {
            row.get::<_, i32>(0)
        });

        match result {
            Ok(enabled) => Ok(enabled != 0),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(true), // 默认启用
            Err(e) => Err(AppError::Storage(format!("查询插件状态失败: {}", e))),
        }
    }

    /// 设置插件启用/禁用
    pub fn set_enabled(&self, plugin_id: &str, enabled: bool) -> Result<(), AppError> {
        let conn = self.conn.lock()
            .map_err(|e| AppError::Storage(format!("获取数据库锁失败: {}", e)))?;

        let updated_at = chrono::Utc::now().to_rfc3339();
        let enabled_int = if enabled { 1 } else { 0 };

        conn.execute(
            "INSERT OR REPLACE INTO plugin_settings (plugin_id, enabled, updated_at) VALUES (?1, ?2, ?3)",
            params![plugin_id, enabled_int, updated_at],
        ).map_err(|e| AppError::Storage(format!("保存插件状态失败: {}", e)))?;

        Ok(())
    }
}
