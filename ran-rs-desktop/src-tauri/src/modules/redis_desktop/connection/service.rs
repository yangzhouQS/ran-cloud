// modules/redis_desktop/connection/service.rs — 连接管理服务
// 管理所有 Redis 连接的生命周期，实现 ConnectionManager trait

use std::collections::HashMap;
use std::sync::Arc;

use dashmap::DashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

use crate::shared::connection::{ConnectionManager, ConnectionStatus};
use crate::shared::error::AppError;
use crate::shared::event::redis_event;

use super::models::{ConnectionConfig, ConnectionInfo};
use crate::modules::redis_desktop::shared::redis_client::RedisClient;
use crate::modules::redis_desktop::tool::models::DatabaseInfo;

/// Redis 连接管理器
/// 管理所有 Redis 连接实例，线程安全
pub struct RedisConnectionManager {
    /// 活跃连接 <connection_id, RedisClient>
    clients: DashMap<String, Arc<RedisClient>>,
    /// 连接配置缓存 <connection_id, ConnectionConfig>
    configs: RwLock<HashMap<String, ConnectionConfig>>,
    /// Tauri AppHandle（用于发送事件）
    app_handle: RwLock<Option<AppHandle>>,
}

impl RedisConnectionManager {
    pub fn new() -> Self {
        Self {
            clients: DashMap::new(),
            configs: RwLock::new(HashMap::new()),
            app_handle: RwLock::new(None),
        }
    }

    /// 设置 AppHandle（在 Plugin setup 时调用）
    pub async fn set_app_handle(&self, handle: AppHandle) {
        let mut guard = self.app_handle.write().await;
        *guard = Some(handle);
    }

    /// 获取指定连接的 RedisClient
    pub fn get_client(&self, connection_id: &str) -> Result<Arc<RedisClient>, AppError> {
        self.clients
            .get(connection_id)
            .map(|r| r.value().clone())
            .ok_or_else(|| AppError::NotFound(format!("连接不存在: {}", connection_id)))
    }

    /// 获取所有连接信息列表
    pub async fn list_connections(&self) -> Vec<ConnectionInfo> {
        let configs = self.configs.read().await;
        let mut result = Vec::new();
        for c in configs.values() {
            let mut info = ConnectionInfo::from(c);
            // 检查连接状态
            if let Some(client) = self.clients.get(&c.id) {
                info.status = if client.is_connected().await {
                    "connected".to_string()
                } else {
                    "disconnected".to_string()
                };
            }
            result.push(info);
        }
        result
    }

    /// 保存连接配置
    pub async fn save_config(&self, config: ConnectionConfig) -> Result<(), AppError> {
        let mut configs = self.configs.write().await;
        configs.insert(config.id.clone(), config);
        Ok(())
    }

    /// 删除连接配置
    pub async fn delete_config(&self, connection_id: &str) -> Result<(), AppError> {
        // 先关闭连接
        self.close(connection_id).await?;

        let mut configs = self.configs.write().await;
        configs
            .remove(connection_id)
            .ok_or_else(|| AppError::NotFound(format!("连接配置不存在: {}", connection_id)))?;
        Ok(())
    }

    /// 切换数据库
    pub async fn select_db(&self, connection_id: &str, db: u32) -> Result<(), AppError> {
        let client = self.get_client(connection_id)?;
        client.select_db(db).await?;
        log::info!("[RedisConnectionManager] 切换 DB: {} → {}", connection_id, db);
        Ok(())
    }

    /// 获取数据库列表（从 INFO KEYSPACE 解析）
    pub async fn get_database_list(&self, connection_id: &str) -> Result<Vec<DatabaseInfo>, AppError> {
        let client = self.get_client(connection_id)?;
        let info = client.info(Some("keyspace")).await?;

        let mut databases = Vec::new();

        for line in info.lines() {
            let line = line.trim();
            // 格式: db0:keys=100,expires=20,avg_ttl=30000
            if let Some(rest) = line.strip_prefix("db") {
                let parts: Vec<&str> = rest.splitn(2, ':').collect();
                if parts.len() == 2 {
                    if let Ok(db) = parts[0].parse::<u32>() {
                        let mut keys: u64 = 0;
                        let mut expires: u64 = 0;
                        let mut avg_ttl: i64 = 0;

                        for kv in parts[1].split(',') {
                            let kv_parts: Vec<&str> = kv.splitn(2, '=').collect();
                            if kv_parts.len() == 2 {
                                match kv_parts[0] {
                                    "keys" => { keys = kv_parts[1].parse().unwrap_or(0); }
                                    "expires" => { expires = kv_parts[1].parse().unwrap_or(0); }
                                    "avg_ttl" => { avg_ttl = kv_parts[1].parse().unwrap_or(0); }
                                    _ => {}
                                }
                            }
                        }

                        databases.push(DatabaseInfo { db, keys, expires, avg_ttl });
                    }
                }
            }
        }

        Ok(databases)
    }

    /// 获取连接配置
    pub async fn get_config(&self, connection_id: &str) -> Result<ConnectionConfig, AppError> {
        let configs = self.configs.read().await;
        configs
            .get(connection_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("连接配置不存在: {}", connection_id)))
    }

    /// 批量保存连接配置（用于导入/排序）
    pub async fn save_all_configs(&self, new_configs: Vec<ConnectionConfig>) -> Result<(), AppError> {
        let mut configs = self.configs.write().await;
        configs.clear();
        for config in new_configs {
            configs.insert(config.id.clone(), config);
        }
        Ok(())
    }

    /// 发送 Redis 事件到前端
    fn emit_event(&self, event_name: &str, payload: &str) {
        // 使用 try_emit 避免在未初始化时 panic
        // 由于 async 限制，这里用 try_read
        if let Ok(guard) = self.app_handle.try_read() {
            if let Some(ref handle) = *guard {
                let _ = handle.emit(&redis_event(event_name), payload);
            }
        }
    }
}

#[async_trait::async_trait]
impl ConnectionManager<ConnectionConfig> for RedisConnectionManager {
    async fn create(&self, config: ConnectionConfig) -> Result<String, AppError> {
        let connection_id = config.id.clone();
        let connection_string = config.connection_string();

        // 检查是否已存在同名连接
        if self.clients.contains_key(&connection_id) {
            return Err(AppError::BadRequest(format!("连接已存在: {}", connection_id)));
        }

        // 发送连接中事件
        self.emit_event("connection:connecting", &connection_id);

        // 创建客户端并连接
        let client = RedisClient::new(config.name.clone(), Some(config.command_timeout));
        client
            .connect(&connection_string)
            .await
            .map_err(|e| {
                self.emit_event("connection:error", &format!("{}:{}", connection_id, e));
                AppError::Connection(e.to_string())
            })?;

        // 缓存配置和客户端
        self.save_config(config).await?;
        self.clients.insert(connection_id.clone(), Arc::new(client));

        // 发送已连接事件
        self.emit_event("connection:connected", &connection_id);

        log::info!("[RedisConnectionManager] Redis 连接已建立: {}", connection_id);
        Ok(connection_id)
    }

    async fn close(&self, id: &str) -> Result<(), AppError> {
        if let Some((_, client)) = self.clients.remove(id) {
            client.disconnect().await;
            self.emit_event("connection:disconnected", id);
            log::info!("[RedisConnectionManager] Redis 连接已关闭: {}", id);
        }
        Ok(())
    }

    async fn close_all(&self) -> Result<(), AppError> {
        let ids: Vec<String> = self.clients.iter().map(|r| r.key().clone()).collect();
        for id in ids {
            self.close(&id).await?;
        }
        Ok(())
    }

    async fn status(&self, id: &str) -> ConnectionStatus {
        if let Some(client) = self.clients.get(id) {
            if client.is_connected().await {
                ConnectionStatus::Connected
            } else {
                ConnectionStatus::Disconnected
            }
        } else {
            ConnectionStatus::Disconnected
        }
    }

    fn list_active(&self) -> Vec<String> {
        self.clients.iter().map(|r| r.key().clone()).collect()
    }
}
