// modules/sql-studio/drivers/postgresql.rs — PostgreSQL 数据库驱动
// 使用 tokio-postgres 实现，支持 SSL/TLS

use async_trait::async_trait;
use tokio_postgres::Client as PgClient;

use crate::shared::error::AppError;
use super::basic_database_client::{BasicDatabaseClient, ColumnInfo, DatabaseInfo, SupportedFeatures, TableInfo};
use super::super::connection::models::ConnectionConfig;
use std::sync::Arc;
use tokio::sync::Mutex;

/// PostgreSQL 驱动实现
pub struct PostgresqlClient {
    client: Arc<Mutex<Option<PgClient>>>,
}

impl PostgresqlClient {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
        }
    }
}

#[async_trait]
impl BasicDatabaseClient for PostgresqlClient {
    async fn connect(&self, config: &ConnectionConfig) -> Result<(), AppError> {
        let host = config.host.as_deref().unwrap_or("localhost");
        let port = config.port.unwrap_or(5432);
        let user = config.user.as_deref().unwrap_or("postgres");
        let password = config.password.as_deref().unwrap_or("");
        let database = config.database.as_deref().unwrap_or("postgres");

        let conn_str = if let Some(ref url) = config.url {
            url.clone()
        } else {
            format!("host={} port={} user={} password={} dbname={}", host, port, user, password, database)
        };

        let client = if config.ssl.enabled {
            // SSL/TLS 连接
            let mut tls_builder = native_tls::TlsConnector::builder();
            if !config.ssl.reject_unauthorized {
                tls_builder.danger_accept_invalid_certs(true);
            }
            // 加载 CA 证书（如果配置了）
            if let Some(ref ca_path) = config.ssl.ca_file {
                let ca_data = std::fs::read(ca_path)
                    .map_err(|e| AppError::Connection(format!("读取 CA 证书失败 ({}): {}", ca_path, e)))?;
                let ca_cert = native_tls::Certificate::from_pem(&ca_data)
                    .map_err(|e| AppError::Connection(format!("解析 CA 证书失败: {}", e)))?;
                tls_builder.add_root_certificate(ca_cert);
            }
            // 加载客户端证书（如果配置了）
            if let (Some(ref cert_path), Some(ref key_path)) = (&config.ssl.cert_file, &config.ssl.key_file) {
                let cert_data = std::fs::read(cert_path)
                    .map_err(|e| AppError::Connection(format!("读取客户端证书失败 ({}): {}", cert_path, e)))?;
                let key_data = std::fs::read(key_path)
                    .map_err(|e| AppError::Connection(format!("读取客户端私钥失败 ({}): {}", key_path, e)))?;
                let identity = native_tls::Identity::from_pkcs8(&cert_data, &key_data)
                    .map_err(|e| AppError::Connection(format!("解析客户端证书/私钥失败: {}", e)))?;
                tls_builder.identity(identity);
            }

            let tls_connector = tls_builder.build()
                .map_err(|e| AppError::Connection(format!("TLS 连接器创建失败: {}", e)))?;

            let (client, connection) = tokio_postgres::connect(&conn_str, postgres_native_tls::MakeTlsConnector::new(tls_connector))
                .await
                .map_err(|e| AppError::Connection(format!("PostgreSQL SSL 连接失败: {}", e)))?;
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    log::error!("PostgreSQL 连接错误: {}", e);
                }
            });
            client
        } else {
            let (client, connection) = tokio_postgres::connect(&conn_str, tokio_postgres::NoTls)
                .await
                .map_err(|e| AppError::Connection(format!("PostgreSQL 连接失败: {}", e)))?;
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    log::error!("PostgreSQL 连接错误: {}", e);
                }
            });
            client
        };

        let mut guard = self.client.lock().await;
        *guard = Some(client);
        Ok(())
    }

    async fn disconnect(&self) -> Result<(), AppError> {
        let mut guard = self.client.lock().await;
        *guard = None;
        Ok(())
    }

    async fn ping(&self) -> Result<bool, AppError> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| AppError::Connection("PostgreSQL 未连接".to_string()))?;
        let rows = client.query("SELECT 1", &[])
            .await
            .map_err(|e| AppError::Connection(format!("PostgreSQL ping 失败: {}", e)))?;
        Ok(!rows.is_empty())
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

    async fn list_tables(&self, schema: Option<&str>) -> Result<Vec<TableInfo>, AppError> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| AppError::Connection("PostgreSQL 未连接".to_string()))?;
        let schema_val = schema.unwrap_or("public");

        let rows = client.query(
            "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
            &[&schema_val],
        ).await.map_err(|e| AppError::Connection(format!("PostgreSQL 查询表列表失败: {}", e)))?;

        let mut tables = Vec::new();
        for row in rows {
            tables.push(TableInfo {
                name: row.get(0),
                schema: Some(schema_val.to_string()),
                table_type: row.get(1),
                row_count: None,
                comment: None,
            });
        }
        Ok(tables)
    }

    async fn list_columns(&self, table: &str, schema: Option<&str>) -> Result<Vec<ColumnInfo>, AppError> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| AppError::Connection("PostgreSQL 未连接".to_string()))?;
        let schema_val = schema.unwrap_or("public");

        let rows = client.query(
            "SELECT column_name, data_type, is_nullable, column_default \
             FROM information_schema.columns \
             WHERE table_schema = $1 AND table_name = $2 \
             ORDER BY ordinal_position",
            &[&schema_val, &table],
        ).await.map_err(|e| AppError::Connection(format!("PostgreSQL 查询列信息失败: {}", e)))?;

        // 查询主键列
        let pk_rows = client.query(
            "SELECT kcu.column_name \
             FROM information_schema.table_constraints tc \
             JOIN information_schema.key_column_usage kcu \
               ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema \
             WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2",
            &[&schema_val, &table],
        ).await.unwrap_or_default();
        let pk_cols: Vec<String> = pk_rows.iter().map(|r| r.get::<_, String>(0)).collect();

        let mut columns = Vec::new();
        for row in rows {
            let col_name: String = row.get(0);
            columns.push(ColumnInfo {
                is_primary_key: pk_cols.contains(&col_name),
                name: col_name,
                data_type: row.get(1),
                nullable: row.get::<_, String>(2) == "YES",
                default_value: row.get(3),
                comment: None,
            });
        }
        Ok(columns)
    }

    async fn execute_query(&self, sql: &str, limit: Option<u64>) -> Result<serde_json::Value, AppError> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| AppError::Connection("PostgreSQL 未连接".to_string()))?;
        let max_rows = limit.unwrap_or(1000) as usize;

        // 提取最后一条有效语句（SQL GUI 工具标准行为）
        // 多条语句用 ; 分隔时，只执行最后一条，避免 prepared statement 多语句错误
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
            || trimmed_upper.starts_with("WITH")
            || trimmed_upper.starts_with("EXPLAIN")
            || trimmed_upper.starts_with("SHOW")
            || trimmed_upper.starts_with("TABLE");

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
            let rows = client.query(&limited_sql, &[])
                .await
                .map_err(|e| AppError::Connection(format!("SQL 执行失败: {}", e)))?;

            if rows.is_empty() {
                return Ok(serde_json::json!({
                    "columns": [],
                    "rows": [],
                    "affectedRows": null,
                }));
            }

            let columns: Vec<serde_json::Value> = rows[0].columns()
                .iter()
                .map(|c| serde_json::json!({"name": c.name()}))
                .collect();

            let column_names: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
            let mut result_rows = Vec::new();
            for row in &rows {
                let mut map = serde_json::Map::new();
                for (i, col_name) in column_names.iter().enumerate() {
                    // 尝试以多种类型获取值
                    let val = if let Ok(v) = row.try_get::<_, String>(i) {
                        serde_json::json!(v)
                    } else if let Ok(v) = row.try_get::<_, i64>(i) {
                        serde_json::json!(v)
                    } else if let Ok(v) = row.try_get::<_, f64>(i) {
                        serde_json::json!(v)
                    } else if let Ok(v) = row.try_get::<_, bool>(i) {
                        serde_json::json!(v)
                    } else if let Ok(_) = row.try_get::<_, Vec<u8>>(i) {
                        serde_json::json!("[BLOB]")
                    } else {
                        serde_json::Value::Null
                    };
                    map.insert(col_name.clone(), val);
                }
                result_rows.push(serde_json::Value::Object(map));
            }

            Ok(serde_json::json!({
                "columns": columns,
                "rows": result_rows,
                "affectedRows": null,
            }))
        } else {
            let result = client.execute(last_stmt, &[])
                .await
                .map_err(|e| AppError::Connection(format!("SQL 执行失败: {}", e)))?;

            Ok(serde_json::json!({
                "columns": [],
                "rows": [],
                "affectedRows": result,
            }))
        }
    }

    async fn version(&self) -> Result<String, AppError> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| AppError::Connection("PostgreSQL 未连接".to_string()))?;
        let version: String = client.query_one("SELECT version()", &[])
            .await
            .map_err(|e| AppError::Connection(format!("PostgreSQL 版本查询失败: {}", e)))?
            .get(0);
        Ok(version)
    }

    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, AppError> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| AppError::Connection("PostgreSQL 未连接".to_string()))?;

        // 查询用户可访问的 schema（排除系统 schema）
        let rows = client.query(
            "SELECT schema_name FROM information_schema.schemata \
             WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
             ORDER BY schema_name",
            &[],
        ).await.map_err(|e| AppError::Connection(format!("PostgreSQL 查询 schema 列表失败: {}", e)))?;

        let schemas = rows.iter().map(|row| {
            let name: String = row.get(0);
            DatabaseInfo {
                name,
                kind: "schema".to_string(),
            }
        }).collect();

        Ok(schemas)
    }
}
