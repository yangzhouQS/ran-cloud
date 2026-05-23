// modules/sql-studio/query/service.rs — 查询执行服务
// 根据连接的数据库类型分发到对应驱动执行查询

use std::sync::Arc;

use crate::shared::error::AppError;
use crate::modules::sql_studio::connection::service::SqlConnectionManager;
use super::models::{QueryRequest, QueryResult, ResultColumn};

/// 查询执行服务
pub struct QueryService;

impl QueryService {
    /// 执行 SQL 查询
    pub async fn execute(
        manager: &Arc<SqlConnectionManager>,
        request: &QueryRequest,
    ) -> Result<QueryResult, AppError> {
        let holder = manager.get_connection(&request.connection_id)
            .ok_or_else(|| AppError::Connection(format!("连接不存在或未连接: {}", request.connection_id)))?;

        if !holder.connected {
            return Err(AppError::Connection("连接已断开".to_string()));
        }

        let start = std::time::Instant::now();

        let raw_result = holder.client.execute_query(&request.sql, request.limit).await?;
        let execution_time_ms = start.elapsed().as_millis() as u64;

        // 解析驱动返回的 JSON 结果
        let columns: Vec<ResultColumn> = raw_result.get("columns")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter().filter_map(|v| {
                    let name = v.get("name")?.as_str()?.to_string();
                    // 驱动可能返回 dataType 或 data_type
                    let data_type = v.get("dataType")
                        .or_else(|| v.get("data_type"))
                        .and_then(|dt| dt.as_str())
                        .map(String::from);
                    Some(ResultColumn { name, data_type })
                }).collect()
            })
            .unwrap_or_default();

        let rows: Vec<serde_json::Value> = raw_result.get("rows")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let affected_rows: Option<u64> = raw_result.get("affectedRows")
            .and_then(|v| v.as_u64());

        Ok(QueryResult {
            columns,
            rows,
            affected_rows,
            execution_time_ms,
        })
    }
}
