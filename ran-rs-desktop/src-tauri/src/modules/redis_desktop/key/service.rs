// modules/redis_desktop/key/service.rs — Key 操作服务
// 实现 SCAN 流式扫描（通过 Tauri Events 推送进度）+ Key CRUD 操作

use std::sync::Arc;

use dashmap::DashMap;
use tauri::{AppHandle, Emitter};

use crate::shared::error::AppError;
use crate::shared::event::redis_event;
use crate::modules::redis_desktop::connection::service::RedisConnectionManager;
use crate::modules::redis_desktop::key::models::*;

/// SCAN 取消标志
static SCAN_CANCEL_MAP: once_cell::sync::Lazy<DashMap<String, bool>> =
    once_cell::sync::Lazy::new(DashMap::new);

/// Key 操作服务
pub struct KeyService;

impl KeyService {
    /// 启动 SCAN 流式扫描
    /// 通过 Tauri Events 持续推送 ScanProgressEvent 到前端
    pub async fn scan_start(
        manager: &Arc<RedisConnectionManager>,
        app_handle: &AppHandle,
        params: ScanStartParams,
    ) -> Result<(), AppError> {
        let client = manager.get_client(&params.connection_id)?;

        // 切换到目标数据库（SCAN 命令需要在正确的 DB 上执行）
        client.select_db(params.db).await.map_err(|e| {
            AppError::Connection(format!("切换数据库 db{} 失败: {}", params.db, e))
        })?;
        log::info!("[KeyService] 已切换到 db{} for SCAN: {}", params.db, params.connection_id);

        // 清除可能存在的取消标志
        SCAN_CANCEL_MAP.remove(&params.scan_id);

        let pattern = params.pattern.as_deref();
        let count = params.count.unwrap_or(200);
        let scan_id = params.scan_id.clone();
        let connection_id = params.connection_id.clone();

        let mut cursor: u64 = 0;
        let mut total_scanned: usize = 0;

        loop {
            // 检查取消标志
            if SCAN_CANCEL_MAP.contains_key(&scan_id) {
                SCAN_CANCEL_MAP.remove(&scan_id);

                // 发送取消完成事件
                let cancel_event = ScanProgressEvent {
                    scan_id: scan_id.clone(),
                    connection_id: connection_id.clone(),
                    cursor: 0,
                    batch_count: 0,
                    keys: vec![],
                    done: true,
                    total_scanned,
                };
                let _ = app_handle.emit(
                    &redis_event("key:scan:progress"),
                    &cancel_event,
                );
                break;
            }

            // 执行 SCAN
            let scan_result = client
                .scan(cursor, pattern, Some(count))
                .await
                .map_err(|e| AppError::Redis(e))?;

            cursor = scan_result.0;
            let keys = scan_result.1;
            let batch_count = keys.len();
            total_scanned += batch_count;
            let done = cursor == 0;

            // 发送进度事件
            let event = ScanProgressEvent {
                scan_id: scan_id.clone(),
                connection_id: connection_id.clone(),
                cursor,
                batch_count,
                keys: keys.clone(),
                done,
                total_scanned,
            };
            let _ = app_handle.emit(
                &redis_event("key:scan:progress"),
                &event,
            );

            if done {
                break;
            }

            // 每批次之间短暂让出，避免阻塞
            tokio::task::yield_now().await;
        }

        Ok(())
    }

    /// 取消 SCAN 扫描
    pub fn scan_cancel(scan_id: &str) -> Result<(), AppError> {
        SCAN_CANCEL_MAP.insert(scan_id.to_string(), true);
        Ok(())
    }

    /// SCAN 继续下一批（前端主动拉取模式）
    pub async fn scan_continue(
        manager: &Arc<RedisConnectionManager>,
        params: ScanContinueParams,
    ) -> Result<ScanProgressEvent, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let pattern = params.pattern.as_deref();
        let count = params.count.unwrap_or(200);

        let scan_result = client
            .scan(params.cursor, pattern, Some(count))
            .await
            .map_err(|e| AppError::Redis(e))?;

        let cursor = scan_result.0;
        let keys = scan_result.1;
        let batch_count = keys.len();
        let done = cursor == 0;

        Ok(ScanProgressEvent {
            scan_id: params.scan_id,
            connection_id: params.connection_id,
            cursor,
            batch_count,
            keys,
            done,
            total_scanned: 0, // 前端自行累计
        })
    }

    /// 获取 Key 详情
    pub async fn get_key_detail(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        key: &str,
    ) -> Result<KeyDetail, AppError> {
        let client = manager.get_client(connection_id)?;

        // 并发查询 TYPE / TTL / MEMORY USAGE / OBJECT ENCODING / 长度
        let key_type = client.key_type(key).await.map_err(|e| AppError::Redis(e))?;
        let ttl = client.ttl(key).await.map_err(|e| AppError::Redis(e))?;
        let memory_usage = client.memory_usage(key).await.map_err(|e| AppError::Redis(e))?;
        let encoding = client.object_encoding(key).await.unwrap_or_else(|_| "unknown".to_string());

        // 根据类型获取长度
        let length = match key_type.as_str() {
            "string" => {
                // String 长度
                client.get(key).await
                    .map(|v| v.map(|s| s.len() as i64).unwrap_or(0))
                    .unwrap_or(0)
            }
            "hash" => client.hlen(key).await.unwrap_or(0) as i64,
            "list" => client.llen(key).await.unwrap_or(0) as i64,
            "set" => client.scard(key).await.unwrap_or(0) as i64,
            "zset" => client.zcard(key).await.unwrap_or(0) as i64,
            "stream" => client.xlen(key).await.unwrap_or(0) as i64,
            _ => 0,
        };

        Ok(KeyDetail {
            key: key.to_string(),
            key_type,
            ttl,
            memory_usage,
            encoding,
            length,
        })
    }

    /// 删除 Key（支持批量）
    pub async fn delete_keys(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        keys: &[String],
    ) -> Result<u64, AppError> {
        let client = manager.get_client(connection_id)?;

        let key_refs: Vec<&str> = keys.iter().map(|s| s.as_str()).collect();
        let deleted = client.del(&key_refs).await.map_err(|e| AppError::Redis(e))?;

        log::info!("[KeyService] 删除 {} 个 Key，实际删除 {}", keys.len(), deleted);
        Ok(deleted)
    }

    /// 重命名 Key
    pub async fn rename_key(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        old_key: &str,
        new_key: &str,
    ) -> Result<(), AppError> {
        let client = manager.get_client(connection_id)?;

        client.rename(old_key, new_key).await.map_err(|e| AppError::Redis(e))?;

        log::info!("[KeyService] 重命名 Key: {} -> {}", old_key, new_key);
        Ok(())
    }

    /// 设置 Key 过期时间
    pub async fn expire_key(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        key: &str,
        seconds: i64,
    ) -> Result<(), AppError> {
        let client = manager.get_client(connection_id)?;

        if seconds == -1 {
            // PERSIST：移除过期时间
            client.persist(key).await.map_err(|e| AppError::Redis(e))?;
            log::info!("[KeyService] 移除过期时间: {}", key);
        } else {
            client.expire(key, seconds).await.map_err(|e| AppError::Redis(e))?;
            log::info!("[KeyService] 设置过期时间: {} -> {}s", key, seconds);
        }

        Ok(())
    }

    /// 获取 Key 类型
    pub async fn get_key_type(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        key: &str,
    ) -> Result<String, AppError> {
        let client = manager.get_client(connection_id)?;
        client.key_type(key).await.map_err(|e| AppError::Redis(e))
    }
}
