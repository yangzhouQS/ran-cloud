// modules/sql-studio/drivers/mysql.rs — MySQL / MariaDB / TiDB 数据库驱动
// 使用 mysql_async 实现（三者共用 MySQL 协议）

use async_trait::async_trait;
use mysql_async::prelude::*;
use mysql_async::{Conn, Opts, OptsBuilder, SslOpts, ClientIdentity};

use crate::shared::error::AppError;
use super::basic_database_client::{BasicDatabaseClient, ColumnInfo, SupportedFeatures, TableInfo};
use super::super::connection::models::{ConnectionConfig, DatabaseType};
use std::sync::Arc;
use tokio::sync::Mutex;

/// MySQL/MariaDB/TiDB 驱动实现
pub struct MysqlClient {
    conn: Arc<Mutex<Option<Conn>>>,
    db_type_label: String,
}

impl MysqlClient {
    pub fn new(db_type: &DatabaseType) -> Self {
        let label = match db_type {
            DatabaseType::Mysql => "MySQL",
            DatabaseType::Mariadb => "MariaDB",
            DatabaseType::Tidb => "TiDB",
            _ => "MySQL",
        };
        Self {
            conn: Arc::new(Mutex::new(None)),
            db_type_label: label.to_string(),
        }
    }
}

#[async_trait]
impl BasicDatabaseClient for MysqlClient {
    async fn connect(&self, config: &ConnectionConfig) -> Result<(), AppError> {
        let host = config.host.as_deref().unwrap_or("localhost");
        let port = config.port.unwrap_or(3306);
        let user = config.user.as_deref().unwrap_or("root");
        let password = config.password.as_deref().unwrap_or("");

        let opts = if let Some(ref url) = config.url {
            Opts::from_url(url)
                .map_err(|e| AppError::Connection(format!("MySQL URL 解析失败: {}", e)))?
        } else {
            let mut builder = OptsBuilder::default();
            builder = builder.ip_or_hostname(host);
            builder = builder.tcp_port(port);
            builder = builder.user(Some(user));
            builder = builder.pass(Some(password));
            if let Some(ref db) = config.database {
                builder = builder.db_name(Some(db));
            }
            // SSL/TLS 配置
            if config.ssl.enabled {
                let mut ssl_opts = SslOpts::default();
                if !config.ssl.reject_unauthorized {
                    ssl_opts = ssl_opts.with_danger_accept_invalid_certs(true);
                    ssl_opts = ssl_opts.with_danger_skip_domain_validation(true);
                }
                if let Some(ref ca_path) = config.ssl.ca_file {
                    let ca_owned = std::path::PathBuf::from(ca_path);
                    ssl_opts = ssl_opts.with_root_certs(vec![ca_owned.into()]);
                }
                // mysql_async 使用 PKCS12 格式的客户端身份
                if let Some(ref cert_path) = config.ssl.cert_file {
                    let cert_owned = std::path::PathBuf::from(cert_path);
                    ssl_opts = ssl_opts.with_client_identity(Some(
                        ClientIdentity::new(cert_owned.into())
                    ));
                }
                builder = builder.ssl_opts(ssl_opts);
            }
            builder.into()
        };

        let conn = Conn::new(opts).await
            .map_err(|e| AppError::Connection(format!("{} 连接失败: {}", self.db_type_label, e)))?;

        let mut guard = self.conn.lock().await;
        *guard = Some(conn);
        Ok(())
    }

    async fn disconnect(&self) -> Result<(), AppError> {
        let mut guard = self.conn.lock().await;
        if let Some(conn) = guard.take() {
            conn.disconnect().await
                .map_err(|e| AppError::Connection(format!("{} 断开连接失败: {}", self.db_type_label, e)))?;
        }
        Ok(())
    }

    async fn ping(&self) -> Result<bool, AppError> {
        let mut guard = self.conn.lock().await;
        let conn = guard.as_mut().ok_or_else(|| AppError::Connection(format!("{} 未连接", self.db_type_label)))?;
        conn.query_drop("SELECT 1").await
            .map_err(|e| AppError::Connection(format!("{} ping 失败: {}", self.db_type_label, e)))?;
        Ok(true)
    }

    fn supported_features(&self) -> SupportedFeatures {
        SupportedFeatures {
            list_tables: true,
            list_columns: true,
            list_routines: true,
            list_indexes: true,
            list_triggers: true,
            list_partitions: true,
            create_table: true,
            alter_table: true,
            drop_table: true,
            export_data: true,
            import_data: true,
            backup: true,
        }
    }

    async fn list_tables(&self, _schema: Option<&str>) -> Result<Vec<TableInfo>, AppError> {
        let mut guard = self.conn.lock().await;
        let conn = guard.as_mut().ok_or_else(|| AppError::Connection(format!("{} 未连接", self.db_type_label)))?;

        let sql = "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME";
        let result: Vec<(String, String)> = conn.query(sql).await
            .map_err(|e| AppError::Connection(format!("查询表列表失败: {}", e)))?;

        let tables = result.into_iter().map(|(name, table_type)| {
            TableInfo {
                name,
                schema: None,
                table_type,
                row_count: None,
                comment: None,
            }
        }).collect();

        Ok(tables)
    }

    async fn list_columns(&self, table: &str, _schema: Option<&str>) -> Result<Vec<ColumnInfo>, AppError> {
        let mut guard = self.conn.lock().await;
        let conn = guard.as_mut().ok_or_else(|| AppError::Connection(format!("{} 未连接", self.db_type_label)))?;

        // 使用字符串拼接（information_schema 不支持参数绑定）
        let sql = format!(
            "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY \
             FROM information_schema.columns \
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}' \
             ORDER BY ORDINAL_POSITION",
            table.replace('\'', "''")
        );
        let cols: Vec<(String, String, String, Option<String>, String)> = conn.query(sql).await
            .map_err(|e| AppError::Connection(format!("查询列信息失败: {}", e)))?;

        let columns = cols.into_iter().map(|(name, data_type, nullable, default_value, key)| {
            ColumnInfo {
                name,
                data_type,
                nullable: nullable == "YES",
                default_value,
                is_primary_key: key == "PRI",
                comment: None,
            }
        }).collect();

        Ok(columns)
    }

    async fn execute_query(&self, sql: &str, limit: Option<u64>) -> Result<serde_json::Value, AppError> {
        let mut guard = self.conn.lock().await;
        let conn = guard.as_mut().ok_or_else(|| AppError::Connection(format!("{} 未连接", self.db_type_label)))?;
        let max_rows = limit.unwrap_or(1000) as usize;

        // 提取最后一条有效语句（SQL GUI 工具标准行为）
        let clean_sql = sql.trim().trim_end_matches(';').trim();
        let last_stmt = match clean_sql.rfind(';') {
            Some(pos) => {
                let last = clean_sql[pos + 1..].trim();
                if last.is_empty() { clean_sql } else { last }
            }
            None => clean_sql,
        };
        let trimmed_upper = last_stmt.trim().to_uppercase();
        let is_select = trimmed_upper.starts_with("SELECT")
            || trimmed_upper.starts_with("SHOW")
            || trimmed_upper.starts_with("DESCRIBE")
            || trimmed_upper.starts_with("EXPLAIN")
            || trimmed_upper.starts_with("WITH");

        if is_select {
            // 仅在原 SQL 没有 LIMIT 子句时追加
            let has_limit = trimmed_upper.rsplit("LIMIT ").next().map_or(false, |s| {
                s.chars().next().map_or(false, |c| c.is_ascii_digit())
            });
            let limited_sql = if has_limit {
                last_stmt.to_string()
            } else {
                format!("{} LIMIT {}", last_stmt, max_rows)
            };
            let mut result = conn.query_iter(limited_sql).await
                .map_err(|e| AppError::Connection(format!("SQL 执行失败: {}", e)))?;

            let mut columns = Vec::new();
            let mut rows = Vec::new();

            // 使用 next() 迭代获取行
            while let Ok(Some(row)) = result.next().await {
                if columns.is_empty() {
                    columns = row.columns().iter()
                        .map(|c| serde_json::json!({"name": c.name_str().to_string()}))
                        .collect();
                }
                let mut map = serde_json::Map::new();
                for (i, col) in row.columns().iter().enumerate() {
                    let col_type = col.column_type();
                    let is_numeric = matches!(col_type,
                        mysql_async::consts::ColumnType::MYSQL_TYPE_TINY
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_SHORT
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_INT24
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_LONG
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_LONGLONG
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_FLOAT
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_DOUBLE
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_NEWDECIMAL
                        | mysql_async::consts::ColumnType::MYSQL_TYPE_YEAR
                    );

                    // mysql_async 的 row.get 返回 Option<Option<T>>
                    // 外层 None = 列不存在，内层 None = NULL
                    let val = match row.get::<Option<String>, _>(i) {
                        Some(Some(s)) => {
                            if is_numeric {
                                // 仅对数值类型列做数字解析
                                if let Ok(n) = s.parse::<i64>() {
                                    serde_json::json!(n)
                                } else if let Ok(f) = s.parse::<f64>() {
                                    serde_json::json!(f)
                                } else {
                                    serde_json::json!(s)
                                }
                            } else {
                                // 非数值类型保持原始字符串
                                serde_json::json!(s)
                            }
                        }
                        Some(None) => serde_json::Value::Null,
                        None => serde_json::Value::Null,
                    };
                    map.insert(col.name_str().to_string(), val);
                }
                rows.push(serde_json::Value::Object(map));
            }

            Ok(serde_json::json!({
                "columns": columns,
                "rows": rows,
                "affectedRows": null,
            }))
        } else {
            let result = conn.query_iter(last_stmt).await
                .map_err(|e| AppError::Connection(format!("SQL 执行失败: {}", e)))?;
            let affected = result.affected_rows();

            Ok(serde_json::json!({
                "columns": [],
                "rows": [],
                "affectedRows": affected,
            }))
        }
    }

    async fn version(&self) -> Result<String, AppError> {
        let mut guard = self.conn.lock().await;
        let conn = guard.as_mut().ok_or_else(|| AppError::Connection(format!("{} 未连接", self.db_type_label)))?;
        let version: String = conn.query_first("SELECT VERSION()")
            .await
            .map_err(|e| AppError::Connection(format!("版本查询失败: {}", e)))?
            .unwrap_or_default();
        Ok(format!("{} {}", self.db_type_label, version))
    }
}
