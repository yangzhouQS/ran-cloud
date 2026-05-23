// modules/sql-studio/query/commands.rs — 查询执行 Tauri 命令

use std::sync::Arc;
use tauri::State;

use crate::shared::error::AppError;
use crate::modules::sql_studio::connection::service::SqlConnectionManager;
use super::models::{QueryRequest, QueryResult};
use super::service::QueryService;

/// 执行 SQL 查询
#[tauri::command]
pub async fn sql_query_execute(
    manager: State<'_, Arc<SqlConnectionManager>>,
    request: QueryRequest,
) -> Result<QueryResult, AppError> {
    QueryService::execute(&manager, &request).await
}
