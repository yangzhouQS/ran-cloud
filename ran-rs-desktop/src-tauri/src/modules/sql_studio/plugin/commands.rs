// modules/sql_studio/plugin/commands.rs — 插件系统 Tauri 命令
// 注册到 lib.rs 的 invoke_handler 中

use std::sync::Arc;
use tauri::State;

use crate::shared::error::AppError;
use crate::modules::sql_studio::connection::service::SqlConnectionManager;
use super::manager::PluginManager;
use super::models::{PluginApiRequest, PluginApiResponse, PluginManifest, PluginMetadata};
use super::store::PluginDataStore;
use super::api::PluginApiDispatcher;

/// 获取所有插件列表
#[tauri::command]
pub async fn plugin_list(
    manager: State<'_, Arc<PluginManager>>,
) -> Result<Vec<PluginMetadata>, AppError> {
    Ok(manager.list_plugins())
}

/// 获取插件清单
#[tauri::command]
pub async fn plugin_get_manifest(
    manager: State<'_, Arc<PluginManager>>,
    id: String,
) -> Result<PluginManifest, AppError> {
    manager.get_manifest(&id)
        .ok_or_else(|| AppError::NotFound(format!("插件不存在: {}", id)))
}

/// 启用插件
#[tauri::command]
pub async fn plugin_enable(
    manager: State<'_, Arc<PluginManager>>,
    id: String,
) -> Result<(), AppError> {
    manager.enable_plugin(&id)
}

/// 禁用插件
#[tauri::command]
pub async fn plugin_disable(
    manager: State<'_, Arc<PluginManager>>,
    id: String,
) -> Result<(), AppError> {
    manager.disable_plugin(&id)
}

/// 插件 API 调用（核心命令）
/// 从前端 PluginMessageRouter 转发插件 API 请求到 Rust 后端
#[tauri::command]
pub async fn plugin_api_call(
    manager: State<'_, Arc<PluginManager>>,
    conn_manager: State<'_, Arc<SqlConnectionManager>>,
    plugin_store: State<'_, Arc<PluginDataStore>>,
    plugin_id: String,
    connection_id: String,
    request: PluginApiRequest,
) -> Result<PluginApiResponse, AppError> {
    // 验证插件是否存在且已启用
    let plugin = manager.get_plugin(&plugin_id)
        .ok_or_else(|| AppError::NotFound(format!("插件不存在: {}", plugin_id)))?;

    if !plugin.enabled {
        return Ok(PluginApiResponse::err(&request, format!("插件已禁用: {}", plugin_id)));
    }

    // 分发 API 请求
    let response = PluginApiDispatcher::dispatch(
        request,
        &plugin_id,
        &connection_id,
        &conn_manager,
        &plugin_store,
    ).await;

    Ok(response)
}
