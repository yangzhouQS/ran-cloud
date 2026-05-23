// modules/sql-studio/connection/service.rs — 连接管理器
// 管理所有 SQL 数据库连接的生命周期，支持 SSH 隧道 / SSL / 连接池

use std::collections::HashMap;
use std::sync::Arc;

use dashmap::DashMap;
use tauri::AppHandle;
use tokio::sync::RwLock;

use crate::shared::error::AppError;
use super::models::{ConnectionConfig, ConnectionInfo, DatabaseType};
use crate::modules::sql_studio::drivers::basic_database_client::BasicDatabaseClient;
use crate::modules::sql_studio::drivers::create_driver;
use crate::modules::sql_studio::tunnel::SqlTunnelService;

/// SQL 数据库连接管理器
/// 管理所有 SQL 数据库连接实例，线程安全
pub struct SqlConnectionManager {
    /// 活跃连接 <connection_id, ConnectionHolder>
    connections: DashMap<String, Arc<ConnectionHolder>>,
    /// 连接配置缓存 <connection_id, ConnectionConfig>
    configs: RwLock<HashMap<String, ConnectionConfig>>,
    /// Tauri AppHandle（用于发送事件）
    app_handle: RwLock<Option<AppHandle>>,
    /// SSH 隧道服务
    tunnel_service: Option<Arc<SqlTunnelService>>,
}

/// 连接持有者（封装具体驱动连接）
pub struct ConnectionHolder {
    pub db_type: DatabaseType,
    pub connected: bool,
    pub client: Box<dyn BasicDatabaseClient>,
}

impl SqlConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: DashMap::new(),
            configs: RwLock::new(HashMap::new()),
            app_handle: RwLock::new(None),
            tunnel_service: None,
        }
    }

    /// 使用预加载的连接配置创建（用于启动时从存储加载）
    pub fn new_with_configs(configs: Vec<ConnectionConfig>) -> Self {
        let configs_map: HashMap<String, ConnectionConfig> = configs
            .into_iter()
            .map(|c| (c.id.clone(), c))
            .collect();
        Self {
            connections: DashMap::new(),
            configs: RwLock::new(configs_map),
            app_handle: RwLock::new(None),
            tunnel_service: None,
        }
    }

    /// 设置 AppHandle（在 setup 时调用）
    pub async fn set_app_handle(&self, handle: AppHandle) {
        let mut guard = self.app_handle.write().await;
        *guard = Some(handle);
    }

    /// 设置 SSH 隧道服务（在 setup 时调用）
    pub fn set_tunnel_service(&mut self, service: Arc<SqlTunnelService>) {
        self.tunnel_service = Some(service);
    }

    /// 保存连接配置
    pub async fn save_config(&self, config: ConnectionConfig) -> Result<(), AppError> {
        let mut configs = self.configs.write().await;
        configs.insert(config.id.clone(), config);
        Ok(())
    }

    /// 获取连接配置
    pub async fn get_config(&self, id: &str) -> Option<ConnectionConfig> {
        let configs = self.configs.read().await;
        configs.get(id).cloned()
    }

    /// 删除连接配置
    pub async fn delete_config(&self, id: &str) -> Result<(), AppError> {
        // 先断开连接（包括关闭 SSH 隧道）
        self.disconnect_internal(id).await?;
        let mut configs = self.configs.write().await;
        configs.remove(id);
        Ok(())
    }

    /// 获取所有连接信息列表
    pub async fn list_connections(&self) -> Vec<ConnectionInfo> {
        let configs = self.configs.read().await;
        let mut result = Vec::new();
        for c in configs.values() {
            let mut info = ConnectionInfo {
                id: c.id.clone(),
                name: c.name.clone(),
                db_type: c.db_type.clone(),
                status: "disconnected".to_string(),
                host: c.host.clone(),
                port: c.port,
                database: c.database.clone(),
            };
            if let Some(holder) = self.connections.get(&c.id) {
                info.status = if holder.connected {
                    "connected".to_string()
                } else {
                    "disconnected".to_string()
                };
            }
            result.push(info);
        }
        result
    }

    /// 测试连接（不持久化）
    /// 如果启用了 SSH 隧道，创建临时隧道再测试，测试完毕后关闭
    /// 使用特殊的测试用 tunnel key 避免与活跃连接的隧道冲突
    pub async fn test_connection(&self, config: &ConnectionConfig) -> Result<bool, AppError> {
        // 使用测试专用 tunnel key 避免影响活跃连接
        let test_tunnel_key = format!("__test__{}", config.id);

        // 检查是否需要 SSH 隧道
        let effective_config = if config.ssh.enabled && config.db_type != DatabaseType::Sqlite {
            let tunnel = self.tunnel_service.as_ref()
                .ok_or_else(|| AppError::Internal("SSH 隧道服务未初始化".to_string()))?;

            let target_host = config.host.as_deref().unwrap_or("localhost");
            let target_port = config.port.unwrap_or_else(|| default_port_for_db_type(&config.db_type));

            let local_port = tunnel
                .create_tunnel(&test_tunnel_key, &config.ssh, target_host, target_port)
                .await?;

            let mut effective = config.clone();
            effective.host = Some("127.0.0.1".to_string());
            effective.port = Some(local_port);
            effective.ssh.enabled = false;
            effective
        } else {
            config.clone()
        };

        let driver = create_driver(&config.db_type)?;
        let result = match driver.connect(&effective_config).await {
            Ok(()) => driver.ping().await,
            Err(e) => {
                // 清理测试隧道
                self.cleanup_test_tunnel_by_key(&test_tunnel_key).await;
                return Err(e);
            }
        };

        let _ = driver.disconnect().await;

        // 清理测试用的隧道
        self.cleanup_test_tunnel_by_key(&test_tunnel_key).await;

        result
    }

    /// 建立连接
    pub async fn connect(&self, id: &str) -> Result<(), AppError> {
        // 短暂获取读锁，clone 配置后立即释放，避免阻塞其他操作
        let config = {
            let configs = self.configs.read().await;
            configs.get(id).ok_or_else(|| {
                AppError::NotFound(format!("连接配置不存在: {}", id))
            })?.clone()
        };

        // 如果已连接，先断开
        if let Some((_, old_holder)) = self.connections.remove(id) {
            let _ = old_holder.client.disconnect().await;
        }

        // 准备连接配置（可能经过 SSH 隧道转换）
        let (effective_config, _tunnel_guard) = self.prepare_tunnel_config(&config).await?;

        // 创建驱动并连接
        let driver = create_driver(&config.db_type)?;
        driver.connect(&effective_config).await?;

        let holder = Arc::new(ConnectionHolder {
            db_type: config.db_type.clone(),
            connected: true,
            client: driver,
        });
        self.connections.insert(id.to_string(), holder);
        Ok(())
    }

    /// 断开连接
    pub async fn disconnect(&self, id: &str) -> Result<(), AppError> {
        self.disconnect_internal(id).await
    }

    /// 断开所有连接
    pub async fn disconnect_all(&self) {
        // 收集所有连接 ID，逐个断开驱动连接，避免连接泄漏
        let ids: Vec<String> = self.connections.iter().map(|r| r.key().clone()).collect();
        for id in ids {
            if let Some((_, holder)) = self.connections.remove(&id) {
                let _ = holder.client.disconnect().await;
            }
        }
        // 关闭所有 SSH 隧道
        if let Some(ref tunnel) = self.tunnel_service {
            let _ = tunnel.close_all().await;
        }
    }

    /// 获取连接持有者（用于查询执行）
    pub fn get_connection(&self, id: &str) -> Option<Arc<ConnectionHolder>> {
        self.connections.get(id).map(|r| r.value().clone())
    }

    /// 准备连接配置：如果启用了 SSH 隧道，创建隧道并返回修改后的配置
    /// 返回 (effective_config, tunnel_active)
    async fn prepare_tunnel_config(
        &self,
        config: &ConnectionConfig,
    ) -> Result<(ConnectionConfig, bool), AppError> {
        // SQLite 不需要 SSH 隧道
        if config.db_type == DatabaseType::Sqlite {
            return Ok((config.clone(), false));
        }

        // 检查是否启用了 SSH 隧道
        if !config.ssh.enabled {
            return Ok((config.clone(), false));
        }

        // 确保隧道服务可用
        let tunnel = self.tunnel_service.as_ref()
            .ok_or_else(|| AppError::Internal("SSH 隧道服务未初始化".to_string()))?;

        let target_host = config.host.as_deref().unwrap_or("localhost");
        let target_port = config.port.unwrap_or_else(|| default_port_for_db_type(&config.db_type));

        // 创建 SSH 隧道
        let local_port = tunnel
            .create_tunnel(&config.id, &config.ssh, target_host, target_port)
            .await?;

        log::info!(
            "[SqlConnectionManager] SSH 隧道已建立: {} → 127.0.0.1:{} (目标 {}:{})",
            config.id, local_port, target_host, target_port
        );

        // 创建修改后的配置：连接到本地隧道端口
        let mut effective = config.clone();
        effective.host = Some("127.0.0.1".to_string());
        effective.port = Some(local_port);
        // 清除 SSH 配置避免递归
        effective.ssh.enabled = false;

        Ok((effective, true))
    }

    /// 内部断开连接（同时关闭 SSH 隧道）
    async fn disconnect_internal(&self, id: &str) -> Result<(), AppError> {
        // 先断开数据库驱动连接
        if let Some((_, holder)) = self.connections.remove(id) {
            holder.client.disconnect().await?;
        }

        // 关闭该连接的 SSH 隧道
        if let Some(ref tunnel) = self.tunnel_service {
            let _ = tunnel.close_tunnel(id).await;
        }

        Ok(())
    }

    /// 清理测试连接时创建的临时隧道（按 key 关闭）
    async fn cleanup_test_tunnel_by_key(&self, tunnel_key: &str) {
        if let Some(ref tunnel) = self.tunnel_service {
            let _ = tunnel.close_tunnel(tunnel_key).await;
        }
    }
}

/// 根据数据库类型获取默认端口
fn default_port_for_db_type(db_type: &DatabaseType) -> u16 {
    match db_type {
        DatabaseType::Postgresql => 5432,
        DatabaseType::Mysql | DatabaseType::Mariadb => 3306,
        DatabaseType::Tidb => 4000,
        DatabaseType::Sqlite => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_port_postgresql() {
        assert_eq!(default_port_for_db_type(&DatabaseType::Postgresql), 5432);
    }

    #[test]
    fn test_default_port_mysql() {
        assert_eq!(default_port_for_db_type(&DatabaseType::Mysql), 3306);
    }

    #[test]
    fn test_default_port_mariadb() {
        assert_eq!(default_port_for_db_type(&DatabaseType::Mariadb), 3306);
    }

    #[test]
    fn test_default_port_tidb() {
        assert_eq!(default_port_for_db_type(&DatabaseType::Tidb), 4000);
    }

    #[test]
    fn test_default_port_sqlite() {
        assert_eq!(default_port_for_db_type(&DatabaseType::Sqlite), 0);
    }
}
