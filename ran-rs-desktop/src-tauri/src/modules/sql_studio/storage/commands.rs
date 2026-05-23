// modules/sql-studio/storage/commands.rs — 内部存储 Tauri 命令
// 使用 State<Arc<StorageService>> 访问 rusqlite 存储

use std::sync::Arc;
use tauri::State;

use crate::shared::error::AppError;
use super::service::StorageService;
use super::models::QueryHistory;
use super::super::connection::models::ConnectionConfig;

/// 加载所有保存的连接配置
#[tauri::command]
pub async fn sql_storage_load_connections(
    storage: State<'_, Arc<StorageService>>,
) -> Result<Vec<ConnectionConfig>, AppError> {
    storage.list_connection_configs()
}

/// 保存连接配置
#[tauri::command]
pub async fn sql_storage_save_connection(
    storage: State<'_, Arc<StorageService>>,
    config: ConnectionConfig,
) -> Result<(), AppError> {
    storage.save_connection_config(&config)
}

/// 删除连接配置
#[tauri::command]
pub async fn sql_storage_delete_connection(
    storage: State<'_, Arc<StorageService>>,
    id: String,
) -> Result<(), AppError> {
    storage.delete_connection_config(&id)
}

/// 保存查询历史
#[tauri::command]
pub async fn sql_storage_save_query_history(
    storage: State<'_, Arc<StorageService>>,
    history: QueryHistory,
) -> Result<(), AppError> {
    storage.save_query_history(&history)
}

/// 获取查询历史
#[tauri::command]
pub async fn sql_storage_load_query_history(
    storage: State<'_, Arc<StorageService>>,
    connection_id: String,
    limit: Option<u32>,
) -> Result<Vec<QueryHistory>, AppError> {
    storage.list_query_history(&connection_id, limit.unwrap_or(100))
}

/// 清理过期查询历史（保留最近 N 条）
#[tauri::command]
pub async fn sql_storage_cleanup_query_history(
    storage: State<'_, Arc<StorageService>>,
    keep_count: Option<u32>,
) -> Result<u64, AppError> {
    storage.cleanup_query_history(keep_count.unwrap_or(1000))
}
