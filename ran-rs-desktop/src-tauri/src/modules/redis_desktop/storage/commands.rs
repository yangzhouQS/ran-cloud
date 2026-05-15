// modules/redis_desktop/storage/commands.rs — 存储相关 Tauri Commands
// 提供前端调用存储服务的命令接口

use tauri::{AppHandle, Runtime, State};

use crate::modules::redis_desktop::connection::models::ConnectionConfig;
use crate::modules::redis_desktop::storage::models::AppSettings;
use crate::modules::redis_desktop::storage::service::StorageService;
use crate::shared::error::AppError;
use crate::shared::result::AppResult;

/// 加载所有连接配置
#[tauri::command]
pub async fn redis_storage_load_connections<R: Runtime>(
    app: AppHandle<R>,
) -> AppResult<Vec<ConnectionConfig>> {
    let service = StorageService::new(app);
    service.load_connections()
}

/// 保存所有连接配置
#[tauri::command]
pub async fn redis_storage_save_connections<R: Runtime>(
    app: AppHandle<R>,
    connections: Vec<ConnectionConfig>,
) -> AppResult<()> {
    let service = StorageService::new(app);
    service.save_connections(&connections)
}

/// 保存单个连接配置（新增或更新）
#[tauri::command]
pub async fn redis_storage_save_connection<R: Runtime>(
    app: AppHandle<R>,
    config: ConnectionConfig,
) -> AppResult<()> {
    let service = StorageService::new(app);
    service.save_connection(&config)
}

/// 删除单个连接配置
#[tauri::command]
pub async fn redis_storage_delete_connection<R: Runtime>(
    app: AppHandle<R>,
    connection_id: String,
) -> AppResult<()> {
    let service = StorageService::new(app);
    service.delete_connection(&connection_id)
}

/// 加载应用设置
#[tauri::command]
pub async fn redis_storage_load_settings<R: Runtime>(
    app: AppHandle<R>,
) -> AppResult<AppSettings> {
    let service = StorageService::new(app);
    service.load_settings()
}

/// 保存应用设置
#[tauri::command]
pub async fn redis_storage_save_settings<R: Runtime>(
    app: AppHandle<R>,
    settings: AppSettings,
) -> AppResult<()> {
    let service = StorageService::new(app);
    service.save_settings(&settings)
}

/// 加载 CLI 命令历史
#[tauri::command]
pub async fn redis_storage_load_cli_history<R: Runtime>(
    app: AppHandle<R>,
) -> AppResult<Vec<String>> {
    let service = StorageService::new(app);
    service.load_cli_history()
}

/// 保存 CLI 命令历史
#[tauri::command]
pub async fn redis_storage_save_cli_history<R: Runtime>(
    app: AppHandle<R>,
    history: Vec<String>,
) -> AppResult<()> {
    let service = StorageService::new(app);
    service.save_cli_history(&history)
}
