// modules/redis_desktop/key/commands.rs — Key 操作 Tauri Commands
// Phase 1 实现：完整 Key 操作命令 + SCAN 流式输出

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::shared::error::AppError;
use crate::shared::result::AppResult;

use super::models::*;
use super::service::KeyService;
use crate::modules::redis_desktop::connection::service::RedisConnectionManager;

/// 启动 SCAN 流式扫描（后端通过 Tauri Events 推送进度）
#[tauri::command]
pub async fn redis_key_scan_start(
    manager: State<'_, Arc<RedisConnectionManager>>,
    app_handle: AppHandle,
    params: ScanStartParams,
) -> AppResult<()> {
    KeyService::scan_start(&manager, &app_handle, params).await
}

/// 取消 SCAN 扫描
#[tauri::command]
pub async fn redis_key_scan_cancel(
    params: ScanCancelParams,
) -> AppResult<()> {
    KeyService::scan_cancel(&params.scan_id)
}

/// SCAN 继续下一批（前端主动拉取模式）
#[tauri::command]
pub async fn redis_key_scan_continue(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: ScanContinueParams,
) -> AppResult<ScanProgressEvent> {
    KeyService::scan_continue(&manager, params).await
}

/// 扫描 Key 列表（单次 SCAN，返回结果）
#[tauri::command]
pub async fn redis_key_scan(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: KeyScanParams,
) -> AppResult<Vec<KeyScanResult>> {
    let client = manager.get_client(&params.connection_id)?;

    let cursor = params.cursor.unwrap_or(0);
    let pattern = params.pattern.as_deref();
    let count = params.count;

    let scan_result = client
        .scan(cursor, pattern, count)
        .await
        .map_err(AppError::from)?;

    let keys = scan_result.1;
    let mut results = Vec::with_capacity(keys.len());

    for key in keys {
        // 批量查询类型和 TTL（可优化为 Pipeline）
        let key_type = client.key_type(&key).await.unwrap_or_else(|_| "unknown".to_string());
        let ttl = client.ttl(&key).await.unwrap_or(-2);
        let memory_usage = client.memory_usage(&key).await.ok().flatten();

        results.push(KeyScanResult {
            key,
            key_type,
            ttl,
            memory_usage,
        });
    }

    Ok(results)
}

/// 获取 Key 详情
#[tauri::command]
pub async fn redis_key_detail(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    key: String,
) -> AppResult<KeyDetail> {
    let _ = db; // DB 切换已在连接层面处理
    KeyService::get_key_detail(&manager, &connection_id, &key).await
}

/// 删除 Key（支持批量）
#[tauri::command]
pub async fn redis_key_delete(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    keys: Vec<String>,
) -> AppResult<u64> {
    let _ = db;
    KeyService::delete_keys(&manager, &connection_id, &keys).await
}

/// 重命名 Key
#[tauri::command]
pub async fn redis_key_rename(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    old_key: String,
    new_key: String,
) -> AppResult<()> {
    let _ = db;
    KeyService::rename_key(&manager, &connection_id, &old_key, &new_key).await
}

/// 设置 Key 过期时间
#[tauri::command]
pub async fn redis_key_expire(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    key: String,
    seconds: i64,
) -> AppResult<()> {
    let _ = db;
    KeyService::expire_key(&manager, &connection_id, &key, seconds).await
}

/// 获取 Key 类型
#[tauri::command]
pub async fn redis_key_type(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    key: String,
) -> AppResult<String> {
    let _ = db;
    KeyService::get_key_type(&manager, &connection_id, &key).await
}
