// modules/sql-studio/connection/commands.rs — 连接管理 Tauri 命令
// 注册到 lib.rs 的 invoke_handler 中

use std::sync::Arc;
use tauri::State;

use crate::shared::error::AppError;
use crate::modules::sql_studio::drivers::basic_database_client::{TableInfo, ColumnInfo};
use crate::modules::sql_studio::storage::service::StorageService;
use super::models::{ConnectionConfig, ConnectionInfo};
use super::service::SqlConnectionManager;

/// 创建连接（保存配置、持久化、然后连接）
#[tauri::command]
pub async fn sql_connection_create(
    manager: State<'_, Arc<SqlConnectionManager>>,
    storage: State<'_, Arc<StorageService>>,
    config: ConnectionConfig,
) -> Result<String, AppError> {
    let id = config.id.clone();
    // 保存到内存缓存
    manager.save_config(config.clone()).await?;
    // 持久化到 SQLite
    storage.save_connection_config(&config)?;
    // 建立连接
    manager.connect(&id).await?;
    Ok(id)
}

/// 断开连接
#[tauri::command]
pub async fn sql_connection_close(
    manager: State<'_, Arc<SqlConnectionManager>>,
    id: String,
) -> Result<(), AppError> {
    manager.disconnect(&id).await
}

/// 断开所有连接
#[tauri::command]
pub async fn sql_connection_close_all(
    manager: State<'_, Arc<SqlConnectionManager>>,
) -> Result<(), AppError> {
    manager.disconnect_all().await;
    Ok(())
}

/// 获取连接列表
#[tauri::command]
pub async fn sql_connection_list(
    manager: State<'_, Arc<SqlConnectionManager>>,
) -> Result<Vec<ConnectionInfo>, AppError> {
    Ok(manager.list_connections().await)
}

/// 测试连接
#[tauri::command]
pub async fn sql_connection_test(
    manager: State<'_, Arc<SqlConnectionManager>>,
    config: ConnectionConfig,
) -> Result<bool, AppError> {
    manager.test_connection(&config).await
}

/// 保存连接配置（不连接，仅保存）
#[tauri::command]
pub async fn sql_connection_save(
    manager: State<'_, Arc<SqlConnectionManager>>,
    storage: State<'_, Arc<StorageService>>,
    config: ConnectionConfig,
) -> Result<(), AppError> {
    // 保存到内存缓存
    manager.save_config(config.clone()).await?;
    // 持久化到 SQLite
    storage.save_connection_config(&config)?;
    Ok(())
}

/// 删除连接配置
#[tauri::command]
pub async fn sql_connection_delete(
    manager: State<'_, Arc<SqlConnectionManager>>,
    storage: State<'_, Arc<StorageService>>,
    id: String,
) -> Result<(), AppError> {
    // 从 SQLite 删除
    storage.delete_connection_config(&id)?;
    // 从内存删除（同时断开连接）
    manager.delete_config(&id).await
}

/// 获取数据库对象树（表列表）
#[tauri::command]
pub async fn sql_database_tree(
    manager: State<'_, Arc<SqlConnectionManager>>,
    connection_id: String,
    schema: Option<String>,
) -> Result<Vec<TableInfo>, AppError> {
    let holder = manager.get_connection(&connection_id)
        .ok_or_else(|| AppError::Connection(format!("连接不存在或未连接: {}", connection_id)))?;
    holder.client.list_tables(schema.as_deref()).await
}

/// 获取表列信息
#[tauri::command]
pub async fn sql_table_columns(
    manager: State<'_, Arc<SqlConnectionManager>>,
    connection_id: String,
    table: String,
    schema: Option<String>,
) -> Result<Vec<ColumnInfo>, AppError> {
    let holder = manager.get_connection(&connection_id)
        .ok_or_else(|| AppError::Connection(format!("连接不存在或未连接: {}", connection_id)))?;
    holder.client.list_columns(&table, schema.as_deref()).await
}

/// 获取数据库版本
#[tauri::command]
pub async fn sql_database_version(
    manager: State<'_, Arc<SqlConnectionManager>>,
    connection_id: String,
) -> Result<String, AppError> {
    let holder = manager.get_connection(&connection_id)
        .ok_or_else(|| AppError::Connection(format!("连接不存在或未连接: {}", connection_id)))?;
    holder.client.version().await
}
