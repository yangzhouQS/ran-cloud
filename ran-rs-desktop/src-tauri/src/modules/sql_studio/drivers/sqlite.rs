// modules/sql-studio/drivers/sqlite.rs — SQLite 数据库驱动
// 使用 rusqlite (bundled) 实现

use std::sync::Mutex;

use async_trait::async_trait;
use rusqlite::Connection as SqliteConnection;

use crate::shared::error::AppError;
use super::basic_database_client::{BasicDatabaseClient, ColumnInfo, DatabaseInfo, SupportedFeatures, TableInfo};
use super::super::connection::models::ConnectionConfig;

/// SQLite 驱动实现
pub struct SqliteClient {
    conn: Mutex<Option<SqliteConnection>>,
}

impl SqliteClient {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }
}

#[async_trait]
impl BasicDatabaseClient for SqliteClient {
    async fn connect(&self, config: &ConnectionConfig) -> Result<(), AppError> {
        let path = config.database.as_deref().unwrap_or(":memory:");
        let conn = SqliteConnection::open(path)
            .map_err(|e| AppError::Connection(format!("SQLite 连接失败: {}", e)))?;
        let mut guard = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        *guard = Some(conn);
        Ok(())
    }

    async fn disconnect(&self) -> Result<(), AppError> {
        let mut guard = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        *guard = None;
        Ok(())
    }

    async fn ping(&self) -> Result<bool, AppError> {
        let guard = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        if guard.is_none() {
            return Ok(false);
        }
        // 使用 query_row 执行简单查询验证连接
        guard.as_ref().unwrap()
            .query_row("SELECT 1", [], |_| Ok(()))
            .map_err(|e| AppError::Connection(format!("SQLite ping 失败: {}", e)))?;
        Ok(true)
    }

    fn supported_features(&self) -> SupportedFeatures {
        SupportedFeatures {
            list_tables: true,
            list_columns: true,
            list_routines: false,
            list_indexes: true,
            list_triggers: true,
            list_partitions: false,
            create_table: true,
            alter_table: true,
            drop_table: true,
            export_data: true,
            import_data: true,
            backup: true,
        }
    }

    async fn list_tables(&self, _schema: Option<&str>) -> Result<Vec<TableInfo>, AppError> {
        let guard = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let conn = guard.as_ref().ok_or_else(|| AppError::Connection("SQLite 未连接".to_string()))?;

        let mut stmt = conn.prepare(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).map_err(|e| AppError::Connection(format!("SQLite 查询表列表失败: {}", e)))?;

        let tables = stmt.query_map([], |row| {
            let name: String = row.get(0)?;
            let table_type: String = row.get(1)?;
            Ok(TableInfo {
                name,
                schema: None,
                table_type,
                row_count: None,
                comment: None,
            })
        }).map_err(|e| AppError::Connection(format!("SQLite 查询表列表失败: {}", e)))?
        .filter_map(|t| t.ok())
        .collect();

        Ok(tables)
    }

    async fn list_columns(&self, table: &str, _schema: Option<&str>) -> Result<Vec<ColumnInfo>, AppError> {
        let guard = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let conn = guard.as_ref().ok_or_else(|| AppError::Connection("SQLite 未连接".to_string()))?;

        // 转义表名中的双引号以防止 SQL 注入
        let escaped_table = table.replace('"', "\"\"");
        let sql = format!("PRAGMA table_info(\"{}\")", escaped_table);
        let mut stmt = conn.prepare(&sql)
            .map_err(|e| AppError::Connection(format!("SQLite 查询列信息失败: {}", e)))?;

        let columns = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            let data_type: String = row.get(2)?;
            let nullable: i32 = row.get(3)?;
            let default_value: Option<String> = row.get(4)?;
            let pk: i32 = row.get(5)?;
            Ok(ColumnInfo {
                name,
                data_type,
                nullable: nullable == 0,
                default_value,
                is_primary_key: pk > 0,
                comment: None,
            })
        }).map_err(|e| AppError::Connection(format!("SQLite 查询列信息失败: {}", e)))?
        .filter_map(|c| c.ok())
        .collect();

        Ok(columns)
    }

    async fn execute_query(&self, sql: &str, limit: Option<u64>) -> Result<serde_json::Value, AppError> {
        let guard = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let conn = guard.as_ref().ok_or_else(|| AppError::Connection("SQLite 未连接".to_string()))?;

        let max_rows = limit.unwrap_or(1000) as usize;

        // 判断是否为 SELECT 查询
        let trimmed = sql.trim().to_uppercase();
        let is_select = trimmed.starts_with("SELECT") || trimmed.starts_with("PRAGMA") || trimmed.starts_with("EXPLAIN");

        if is_select {
            let mut stmt = conn.prepare(sql)
                .map_err(|e| AppError::Connection(format!("SQL 执行失败: {}", e)))?;

            let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let column_count = column_names.len();

            let mut rows = Vec::new();
            let result = stmt.query_map([], |row| {
                let mut map = serde_json::Map::new();
                for i in 0..column_count {
                    let val: serde_json::Value = match row.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                        Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::json!(n),
                        Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::json!(f),
                        Ok(rusqlite::types::ValueRef::Text(s)) => {
                            serde_json::json!(String::from_utf8_lossy(s).to_string())
                        }
                        Ok(rusqlite::types::ValueRef::Blob(_b)) => serde_json::json!("[BLOB]"),
                        Err(e) => serde_json::json!(format!("ERROR: {}", e)),
                    };
                    map.insert(column_names[i].clone(), val);
                }
                Ok(serde_json::Value::Object(map))
            });

            let mapped_rows = result.map_err(|e| AppError::Connection(format!("SQL 执行失败: {}", e)))?;
            for row in mapped_rows.take(max_rows) {
                if let Ok(val) = row {
                    rows.push(val);
                }
            }

            Ok(serde_json::json!({
                "columns": column_names.iter().map(|n| serde_json::json!({"name": n})).collect::<Vec<_>>(),
                "rows": rows,
                "affectedRows": null,
            }))
        } else {
            // 非 SELECT：执行修改语句
            let affected = conn.execute(sql, [])
                .map_err(|e| AppError::Connection(format!("SQL 执行失败: {}", e)))?;

            Ok(serde_json::json!({
                "columns": [],
                "rows": [],
                "affectedRows": affected,
            }))
        }
    }

    async fn version(&self) -> Result<String, AppError> {
        let guard = self.conn.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let conn = guard.as_ref().ok_or_else(|| AppError::Connection("SQLite 未连接".to_string()))?;
        let version: String = conn.query_row("SELECT sqlite_version()", [], |row| row.get(0))
            .map_err(|e| AppError::Connection(format!("SQLite 版本查询失败: {}", e)))?;
        Ok(format!("SQLite {}", version))
    }

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, AppError> {
        // SQLite 只有一个主数据库，返回 "main"
        Ok(vec![DatabaseInfo {
            name: "main".to_string(),
            kind: "main".to_string(),
        }])
    }
}
