// modules/sql_studio/plugin/api.rs — 插件 API 分发器
// 将插件的 postMessage API 请求路由到对应的 Rust 服务

use std::sync::Arc;

use super::models::{PluginApiRequest, PluginApiResponse};
use super::store::PluginDataStore;
use crate::modules::sql_studio::connection::service::SqlConnectionManager;

/// 插件 API 分发器（无状态）
/// 每次调用传入所需依赖
pub struct PluginApiDispatcher;

impl PluginApiDispatcher {
    /// 分发插件 API 请求
    pub async fn dispatch(
        request: PluginApiRequest,
        plugin_id: &str,
        connection_id: &str,
        conn_manager: &Arc<SqlConnectionManager>,
        plugin_store: &Arc<PluginDataStore>,
    ) -> PluginApiResponse {
        match request.name.as_str() {
            // ========== 数据库查询 API ==========
            "getSchemas" => {
                Self::handle_get_schemas(request, connection_id, conn_manager).await
            }
            "getTables" => {
                Self::handle_get_tables(request, connection_id, conn_manager).await
            }
            "getColumns" => {
                Self::handle_get_columns(request, connection_id, conn_manager).await
            }
            "runQuery" => {
                Self::handle_run_query(request, connection_id, conn_manager).await
            }

            // ========== 插件数据存储 API ==========
            "getData" => {
                Self::handle_get_data(request, plugin_id, plugin_store).await
            }
            "setData" => {
                Self::handle_set_data(request, plugin_id, plugin_store).await
            }

            // ========== 应用信息 API ==========
            "getAppInfo" => {
                let result = serde_json::json!({
                    "version": env!("CARGO_PKG_VERSION"),
                    "theme": "system"
                });
                PluginApiResponse::ok(&request, result)
            }

            // ========== 连接信息 API ==========
            "getConnectionInfo" => {
                Self::handle_get_connection_info(request, connection_id, conn_manager).await
            }

            // ========== 未实现的 API ==========
            _ => {
                PluginApiResponse::err(&request, format!("未知的 API 方法: {}", request.name))
            }
        }
    }

    /// 获取所有 schema
    async fn handle_get_schemas(
        request: PluginApiRequest,
        connection_id: &str,
        conn_manager: &Arc<SqlConnectionManager>,
    ) -> PluginApiResponse {
        let holder = match conn_manager.get_connection(connection_id) {
            Some(h) => h,
            None => return PluginApiResponse::err(&request, "未找到活跃连接".to_string()),
        };

        match holder.client.list_tables(None).await {
            Ok(tables) => {
                // 提取唯一的 schema 列表
                let mut schemas: Vec<String> = tables
                    .iter()
                    .filter_map(|t| t.schema.clone())
                    .collect();
                schemas.sort();
                schemas.dedup();
                PluginApiResponse::ok(&request, serde_json::json!(schemas))
            }
            Err(e) => PluginApiResponse::err(&request, e.to_string()),
        }
    }

    /// 获取表列表
    async fn handle_get_tables(
        request: PluginApiRequest,
        connection_id: &str,
        conn_manager: &Arc<SqlConnectionManager>,
    ) -> PluginApiResponse {
        let holder = match conn_manager.get_connection(connection_id) {
            Some(h) => h,
            None => return PluginApiResponse::err(&request, "未找到活跃连接".to_string()),
        };

        let schema = request.args.get("schema")
            .and_then(|v| v.as_str());

        match holder.client.list_tables(schema).await {
            Ok(tables) => {
                let result: Vec<serde_json::Value> = tables.iter().map(|t| {
                    serde_json::json!({
                        "name": t.name,
                        "schema": t.schema,
                        "tableType": t.table_type,
                        "rowCount": t.row_count,
                        "comment": t.comment,
                    })
                }).collect();
                PluginApiResponse::ok(&request, serde_json::json!(result))
            }
            Err(e) => PluginApiResponse::err(&request, e.to_string()),
        }
    }

    /// 获取列信息
    async fn handle_get_columns(
        request: PluginApiRequest,
        connection_id: &str,
        conn_manager: &Arc<SqlConnectionManager>,
    ) -> PluginApiResponse {
        let holder = match conn_manager.get_connection(connection_id) {
            Some(h) => h,
            None => return PluginApiResponse::err(&request, "未找到活跃连接".to_string()),
        };

        let table = match request.args.get("table").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => return PluginApiResponse::err(&request, "缺少 table 参数".to_string()),
        };
        let schema = request.args.get("schema").and_then(|v| v.as_str());

        match holder.client.list_columns(table, schema).await {
            Ok(columns) => {
                let result: Vec<serde_json::Value> = columns.iter().map(|c| {
                    serde_json::json!({
                        "name": c.name,
                        "dataType": c.data_type,
                        "nullable": c.nullable,
                        "defaultValue": c.default_value,
                        "isPrimaryKey": c.is_primary_key,
                        "comment": c.comment,
                    })
                }).collect();
                PluginApiResponse::ok(&request, serde_json::json!(result))
            }
            Err(e) => PluginApiResponse::err(&request, e.to_string()),
        }
    }

    /// 执行 SQL 查询（仅允许只读语句）
    async fn handle_run_query(
        request: PluginApiRequest,
        connection_id: &str,
        conn_manager: &Arc<SqlConnectionManager>,
    ) -> PluginApiResponse {
        let holder = match conn_manager.get_connection(connection_id) {
            Some(h) => h,
            None => return PluginApiResponse::err(&request, "未找到活跃连接".to_string()),
        };

        let sql = match request.args.get("query").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => return PluginApiResponse::err(&request, "缺少 query 参数".to_string()),
        };

        // 安全检查：仅允许 SELECT / EXPLAIN / SHOW / DESCRIBE 语句
        let trimmed = sql.trim().to_uppercase();
        let first_word = trimmed.split_whitespace().next().unwrap_or("");
        let allowed_prefixes = ["SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE", "DESC"];
        if !allowed_prefixes.iter().any(|p| first_word == *p) {
            return PluginApiResponse::err(
                &request,
                "插件仅允许执行只读查询（SELECT/EXPLAIN/SHOW/DESCRIBE）".to_string(),
            );
        }

        match holder.client.execute_query(sql, Some(1000)).await {
            Ok(result) => PluginApiResponse::ok(&request, result),
            Err(e) => PluginApiResponse::err(&request, e.to_string()),
        }
    }

    /// 获取插件存储数据
    async fn handle_get_data(
        request: PluginApiRequest,
        plugin_id: &str,
        plugin_store: &Arc<PluginDataStore>,
    ) -> PluginApiResponse {
        let key = match request.args.get("key").and_then(|v| v.as_str()) {
            Some(k) => k,
            None => return PluginApiResponse::err(&request, "缺少 key 参数".to_string()),
        };

        match plugin_store.get_data(plugin_id, key) {
            Ok(Some(value)) => PluginApiResponse::ok(&request, value),
            Ok(None) => PluginApiResponse::ok(&request, serde_json::Value::Null),
            Err(e) => PluginApiResponse::err(&request, e.to_string()),
        }
    }

    /// 设置插件存储数据
    async fn handle_set_data(
        request: PluginApiRequest,
        plugin_id: &str,
        plugin_store: &Arc<PluginDataStore>,
    ) -> PluginApiResponse {
        let key = match request.args.get("key").and_then(|v| v.as_str()) {
            Some(k) => k,
            None => return PluginApiResponse::err(&request, "缺少 key 参数".to_string()),
        };
        let value = request.args.get("value").cloned().unwrap_or(serde_json::Value::Null);

        match plugin_store.set_data(plugin_id, key, &value) {
            Ok(()) => PluginApiResponse::ok(&request, serde_json::json!(true)),
            Err(e) => PluginApiResponse::err(&request, e.to_string()),
        }
    }

    /// 获取当前连接信息（不含密码）
    async fn handle_get_connection_info(
        request: PluginApiRequest,
        connection_id: &str,
        conn_manager: &Arc<SqlConnectionManager>,
    ) -> PluginApiResponse {
        let config = match conn_manager.get_config(connection_id).await {
            Some(c) => c,
            None => return PluginApiResponse::err(&request, "未找到连接配置".to_string()),
        };

        let result = serde_json::json!({
            "id": config.id,
            "name": config.name,
            "databaseType": config.db_type,
            "host": config.host,
            "port": config.port,
            "database": config.database,
            // 注意：不返回密码、SSL、SSH 等敏感信息
        });
        PluginApiResponse::ok(&request, result)
    }

    /// 检查 SQL 是否为只读语句（纯字符串匹配，不依赖数据库连接）
    /// 此方法提取自 handle_run_query 的安全检查逻辑，便于独立测试
    fn is_read_only_query(sql: &str) -> bool {
        let trimmed = sql.trim().to_uppercase();
        let first_word = trimmed.split_whitespace().next().unwrap_or("");
        let allowed_prefixes = ["SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE", "DESC"];
        allowed_prefixes.iter().any(|p| first_word == *p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_only_allows_select() {
        assert!(PluginApiDispatcher::is_read_only_query("SELECT * FROM users"));
    }

    #[test]
    fn test_read_only_allows_select_lowercase() {
        assert!(PluginApiDispatcher::is_read_only_query("select 1"));
    }

    #[test]
    fn test_read_only_allows_with() {
        assert!(PluginApiDispatcher::is_read_only_query("WITH cte AS (SELECT 1) SELECT * FROM cte"));
    }

    #[test]
    fn test_read_only_allows_explain() {
        assert!(PluginApiDispatcher::is_read_only_query("EXPLAIN SELECT 1"));
    }

    #[test]
    fn test_read_only_allows_show() {
        assert!(PluginApiDispatcher::is_read_only_query("SHOW TABLES"));
    }

    #[test]
    fn test_read_only_allows_describe() {
        assert!(PluginApiDispatcher::is_read_only_query("DESCRIBE users"));
    }

    #[test]
    fn test_read_only_allows_desc() {
        assert!(PluginApiDispatcher::is_read_only_query("DESC users"));
    }

    #[test]
    fn test_read_only_rejects_insert() {
        assert!(!PluginApiDispatcher::is_read_only_query("INSERT INTO t VALUES (1)"));
    }

    #[test]
    fn test_read_only_rejects_update() {
        assert!(!PluginApiDispatcher::is_read_only_query("UPDATE t SET x=1"));
    }

    #[test]
    fn test_read_only_rejects_delete() {
        assert!(!PluginApiDispatcher::is_read_only_query("DELETE FROM t"));
    }

    #[test]
    fn test_read_only_rejects_drop() {
        assert!(!PluginApiDispatcher::is_read_only_query("DROP TABLE users"));
    }

    #[test]
    fn test_read_only_rejects_alter() {
        assert!(!PluginApiDispatcher::is_read_only_query("ALTER TABLE t ADD COLUMN x INT"));
    }

    #[test]
    fn test_read_only_rejects_create() {
        assert!(!PluginApiDispatcher::is_read_only_query("CREATE TABLE t (id INT)"));
    }

    #[test]
    fn test_read_only_handles_whitespace() {
        assert!(PluginApiDispatcher::is_read_only_query("   SELECT   *   FROM   t   "));
    }

    #[test]
    fn test_read_only_handles_empty() {
        assert!(!PluginApiDispatcher::is_read_only_query(""));
    }

    #[test]
    fn test_response_ok() {
        let req = PluginApiRequest {
            id: "r1".to_string(),
            name: "test".to_string(),
            args: serde_json::json!({}),
        };
        let resp = PluginApiResponse::ok(&req, serde_json::json!(42));
        assert_eq!(resp.id, "r1");
        assert_eq!(resp.result, Some(serde_json::json!(42)));
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_response_err() {
        let req = PluginApiRequest {
            id: "r2".to_string(),
            name: "test".to_string(),
            args: serde_json::json!({}),
        };
        let resp = PluginApiResponse::err(&req, "something failed".to_string());
        assert_eq!(resp.id, "r2");
        assert!(resp.result.is_none());
        assert_eq!(resp.error, Some("something failed".to_string()));
    }

    #[test]
    fn test_response_skip_serializing_none() {
        let resp = PluginApiResponse {
            id: "r1".to_string(),
            name: "test".to_string(),
            result: Some(serde_json::json!(1)),
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(!json.contains("\"error\":"));
        assert!(json.contains("\"result\":"));
    }
}
