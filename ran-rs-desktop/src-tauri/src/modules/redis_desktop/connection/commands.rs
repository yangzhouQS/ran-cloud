// modules/redis_desktop/connection/commands.rs — 连接管理 Tauri 命令
// 所有前端通过 invoke 调用的连接管理命令

use std::sync::Arc;

use tauri::State;

use crate::shared::connection::{ConnectionManager, ConnectionStatus};
use crate::shared::error::AppError;
use crate::shared::result::AppResult;

use super::models::{ConnectionConfig, ConnectionInfo};
use super::service::RedisConnectionManager;
use crate::modules::redis_desktop::tool::models::DatabaseInfo;

/// 创建 Redis 连接
#[tauri::command]
pub async fn redis_connection_create(
    manager: State<'_, Arc<RedisConnectionManager>>,
    config: ConnectionConfig,
) -> AppResult<String> {
    manager.create(config).await
}

/// 关闭 Redis 连接
#[tauri::command]
pub async fn redis_connection_close(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<()> {
    manager.close(&connection_id).await
}

/// 关闭所有 Redis 连接
#[tauri::command]
pub async fn redis_connection_close_all(
    manager: State<'_, Arc<RedisConnectionManager>>,
) -> AppResult<()> {
    manager.close_all().await
}

/// 获取连接状态
#[tauri::command]
pub async fn redis_connection_status(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<String> {
    let status = manager.status(&connection_id).await;
    Ok(match status {
        ConnectionStatus::Connected => "connected".to_string(),
        ConnectionStatus::Connecting => "connecting".to_string(),
        ConnectionStatus::Disconnected => "disconnected".to_string(),
        ConnectionStatus::Error(msg) => format!("error:{}", msg),
    })
}

/// 获取所有活跃连接 ID 列表
#[tauri::command]
pub async fn redis_connection_list(
    manager: State<'_, Arc<RedisConnectionManager>>,
) -> AppResult<Vec<String>> {
    Ok(manager.list_active())
}

/// Ping 测试连接
#[tauri::command]
pub async fn redis_connection_ping(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<String> {
    let client = manager.get_client(&connection_id)?;
    client.ping().await.map_err(|e| AppError::Connection(e.to_string()))
}

/// 保存连接配置
#[tauri::command]
pub async fn redis_connection_save(
    manager: State<'_, Arc<RedisConnectionManager>>,
    config: ConnectionConfig,
) -> AppResult<()> {
    manager.save_config(config).await
}

/// 删除连接配置（同时关闭连接）
#[tauri::command]
pub async fn redis_connection_delete(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<()> {
    manager.delete_config(&connection_id).await
}

/// 切换数据库
#[tauri::command]
pub async fn redis_connection_select_db(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
) -> AppResult<()> {
    manager.select_db(&connection_id, db).await
}

/// 获取连接配置
#[tauri::command]
pub async fn redis_connection_get_config(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<ConnectionConfig> {
    manager.get_config(&connection_id).await
}

/// 获取所有连接信息列表（含配置和状态）
#[tauri::command]
pub async fn redis_connection_list_info(
    manager: State<'_, Arc<RedisConnectionManager>>,
) -> AppResult<Vec<ConnectionInfo>> {
    Ok(manager.list_connections().await)
}

/// 测试连接（不保存，仅测试连通性）
#[tauri::command]
pub async fn redis_connection_test(
    config: ConnectionConfig,
) -> AppResult<String> {
    let connection_string = config.connection_string();
    let client = redis::Client::open(connection_string.as_str())
        .map_err(|e| AppError::Connection(e.to_string()))?;
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| AppError::Connection(e.to_string()))?;

    let mut cmd = redis::Cmd::new();
    cmd.arg("PING");
    let result: String = redis::cmd("PING")
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Connection(e.to_string()))?;

    Ok(result)
}

/// 获取数据库列表（从 INFO KEYSPACE 解析）
#[tauri::command]
pub async fn redis_connection_get_database_list(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<Vec<DatabaseInfo>> {
    manager.get_database_list(&connection_id).await
}

/// 批量保存连接配置（用于排序/导入）
#[tauri::command]
pub async fn redis_connection_save_all(
    manager: State<'_, Arc<RedisConnectionManager>>,
    configs: Vec<ConnectionConfig>,
) -> AppResult<()> {
    manager.save_all_configs(configs).await
}
