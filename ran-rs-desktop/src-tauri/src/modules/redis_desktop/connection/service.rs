// modules/redis_desktop/connection/service.rs — 连接管理服务
// 管理所有 Redis 连接的生命周期，支持 Standalone / Cluster / Sentinel / SSH 隧道 / TLS
// 支持组合模式：SSH+Cluster（多隧道）、SSH+Sentinel（发现 master 后建隧道）、NAT 映射

use std::collections::HashMap;
use std::sync::Arc;

use dashmap::DashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

use crate::shared::connection::{ConnectionManager, ConnectionStatus};
use crate::shared::error::AppError;
use crate::shared::event::redis_event;

use super::models::{ClusterNodeInfo, ConnectionConfig, ConnectionInfo, NatMapEntry};
use crate::modules::redis_desktop::shared::redis_client::RedisClient;
use crate::modules::redis_desktop::tool::models::DatabaseInfo;
use crate::modules::redis_desktop::tunnel::SshTunnelManager;

/// Redis 连接管理器
/// 管理所有 Redis 连接实例，线程安全
/// 支持 Standalone / Cluster / Sentinel / SSH 隧道组合连接
pub struct RedisConnectionManager {
    /// 活跃连接 <connection_id, RedisClient>
    clients: DashMap<String, Arc<RedisClient>>,
    /// 连接配置缓存 <connection_id, ConnectionConfig>
    configs: RwLock<HashMap<String, ConnectionConfig>>,
    /// Tauri AppHandle（用于发送事件）
    app_handle: RwLock<Option<AppHandle>>,
    /// SSH 隧道管理器
    tunnel_manager: SshTunnelManager,
}

impl RedisConnectionManager {
    pub fn new() -> Self {
        Self {
            clients: DashMap::new(),
            configs: RwLock::new(HashMap::new()),
            app_handle: RwLock::new(None),
            tunnel_manager: SshTunnelManager::new(),
        }
    }

    /// 设置 AppHandle（在 setup 时调用）
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
        if let Ok(guard) = self.app_handle.try_read() {
            if let Some(ref handle) = *guard {
                let _ = handle.emit(&redis_event(event_name), payload);
            }
        }
    }

    // ==================== 认证字符串构建 ====================

    /// 根据配置构建认证前缀
    fn build_auth_prefix(config: &ConnectionConfig) -> String {
        match (&config.username, &config.password) {
            (Some(user), Some(pwd)) if !user.is_empty() && !pwd.is_empty() => {
                format!("{}:{}@", user, pwd)
            }
            (Some(user), _) if !user.is_empty() => {
                format!("{}@", user)
            }
            (_, Some(pwd)) if !pwd.is_empty() => {
                format!(":{}@", pwd)
            }
            _ => String::new(),
        }
    }

    // ==================== 连接路由逻辑 ====================

    /// 确定实际连接地址（考虑 SSH 隧道）
    /// 如果配置了 SSH 隧道，创建隧道并返回本地转发地址
    /// 返回 (host, port) 用于实际 Redis 连接
    async fn resolve_connection_address(
        &self,
        config: &ConnectionConfig,
    ) -> Result<(String, u16), AppError> {
        if let Some(ref ssh_config) = config.ssh_tunnel {
            // 创建 SSH 隧道（使用 connection_id 作为 key）
            let local_port = self.tunnel_manager.create_tunnel(
                &config.id,
                ssh_config,
                &config.host,
                config.port,
            ).await?;

            log::info!(
                "[RedisConnectionManager] SSH 隧道已建立: 127.0.0.1:{} → {}:{} → {}:{}",
                local_port, ssh_config.host, ssh_config.port, config.host, config.port
            );

            Ok(("127.0.0.1".to_string(), local_port))
        } else {
            Ok((config.host.clone(), config.port))
        }
    }

    // ==================== SSH + Cluster 组合连接 ====================

    /// SSH + Cluster 组合连接
    /// 流程：
    /// 1. 创建 SSH 隧道到初始集群节点
    /// 2. 以 Standalone 模式连接，执行 CLUSTER NODES 发现所有节点
    /// 3. 为每个集群节点创建独立的 SSH 隧道
    /// 4. 构建 NAT 映射（内部地址 → 本地隧道地址）
    /// 5. 以 Cluster 模式连接，使用 NAT 映射
    async fn connect_ssh_cluster(
        &self,
        config: &ConnectionConfig,
    ) -> Result<Arc<RedisClient>, AppError> {
        let ssh_config = config.ssh_tunnel.as_ref().unwrap();
        let connection_id = &config.id;

        // 1. 创建到初始节点的 SSH 隧道
        let local_port = self.tunnel_manager.create_tunnel(
            connection_id,
            ssh_config,
            &config.host,
            config.port,
        ).await?;

        log::info!(
            "[SSH+Cluster] 初始隧道已建立: 127.0.0.1:{} → {}:{}",
            local_port, config.host, config.port
        );

        // 2. 以 Standalone 模式连接，发现集群节点
        let auth = Self::build_auth_prefix(config);
        let temp_conn_string = format!("redis://{}127.0.0.1:{}", auth, local_port);
        let temp_client = RedisClient::new(config.name.clone(), Some(config.command_timeout));
        temp_client.connect(&temp_conn_string).await.map_err(|e| {
            AppError::Connection(format!("SSH+Cluster 临时连接失败: {}", e))
        })?;

        // 3. 执行 CLUSTER NODES 发现所有节点
        let cluster_nodes_raw = temp_client.cluster_nodes().await.map_err(|e| {
            AppError::Connection(format!("CLUSTER NODES 执行失败: {}", e))
        })?;
        let nodes = RedisClient::parse_cluster_nodes(&cluster_nodes_raw);

        // 只取 master 节点（或所有节点，取决于配置）
        let master_nodes: Vec<(String, u16)> = nodes
            .iter()
            .filter(|n| n.is_master)
            .map(|n| (n.host.clone(), n.port))
            .collect();

        if master_nodes.is_empty() {
            return Err(AppError::Connection("未发现任何集群 master 节点".to_string()));
        }

        log::info!(
            "[SSH+Cluster] 发现 {} 个 master 节点",
            master_nodes.len()
        );

        // 断开临时连接
        temp_client.disconnect().await;

        // 4. 为每个 master 节点创建 SSH 隧道
        let tunnels = self.tunnel_manager.create_cluster_tunnels(
            connection_id,
            ssh_config,
            &master_nodes,
        ).await?;

        // 5. 构建 NAT 映射
        let nat_map: HashMap<String, NatMapEntry> = tunnels
            .iter()
            .map(|(dst_host, dst_port, local_port)| {
                (
                    format!("{}:{}", dst_host, dst_port),
                    NatMapEntry {
                        host: "127.0.0.1".to_string(),
                        port: *local_port,
                    },
                )
            })
            .collect();

        log::info!(
            "[SSH+Cluster] NAT 映射已构建, {} 条规则",
            nat_map.len()
        );

        // 6. 以 Cluster 模式连接，使用 NAT 映射
        let mut cluster_client = RedisClient::new(config.name.clone(), Some(config.command_timeout));
        let initial_nodes: Vec<String> = tunnels
            .iter()
            .map(|(_, _, local_port)| format!("redis://{}127.0.0.1:{}", auth, local_port))
            .collect();

        cluster_client
            .connect_cluster_with_nat_map(initial_nodes, Some(&nat_map))
            .await
            .map_err(|e| {
                AppError::Connection(format!("SSH+Cluster 集群连接失败: {}", e))
            })?;

        log::info!("[SSH+Cluster] 集群连接已建立: {}", connection_id);
        Ok(Arc::new(cluster_client))
    }

    // ==================== SSH + Sentinel 组合连接 ====================

    /// SSH + Sentinel 组合连接
    /// 流程：
    /// 1. 创建 SSH 隧道到 Sentinel 节点
    /// 2. 通过 Sentinel 发现 master 地址
    /// 3. 为 master 节点创建独立的 SSH 隧道
    /// 4. 以 Standalone 模式连接到 master
    async fn connect_ssh_sentinel(
        &self,
        config: &ConnectionConfig,
    ) -> Result<Arc<RedisClient>, AppError> {
        let ssh_config = config.ssh_tunnel.as_ref().unwrap();
        let sentinel_config = config.sentinel.as_ref().unwrap();
        let connection_id = &config.id;

        // 1. 创建到 Sentinel 节点的 SSH 隧道
        let sentinel_local_port = self.tunnel_manager.create_tunnel(
            connection_id,
            ssh_config,
            &config.host,
            config.port,
        ).await?;

        log::info!(
            "[SSH+Sentinel] Sentinel 隧道已建立: 127.0.0.1:{} → {}:{}",
            sentinel_local_port, config.host, config.port
        );

        // 2. 通过 Sentinel 发现 master 地址
        let sentinel_nodes = vec![format!("127.0.0.1:{}", sentinel_local_port)];
        let mut temp_client = RedisClient::new(config.name.clone(), Some(config.command_timeout));

        let master_info = temp_client
            .connect_via_sentinel(
                sentinel_nodes,
                &sentinel_config.master_name,
                sentinel_config.password.as_deref(),
                sentinel_config.username.as_deref(),
                sentinel_config.node_password.as_deref(),
                config.db,
            )
            .await
            .map_err(|e| {
                AppError::Connection(format!("SSH+Sentinel master 发现失败: {}", e))
            })?;

        // 断开临时 Sentinel 连接
        temp_client.disconnect().await;

        log::info!(
            "[SSH+Sentinel] master 已发现: {}:{}",
            master_info.0, master_info.1
        );

        // 3. 为 master 节点创建独立的 SSH 隧道
        let master_tunnel_key = format!("{}::master", connection_id);
        let master_local_port = self.tunnel_manager.create_tunnel_with_key(
            &master_tunnel_key,
            ssh_config,
            &master_info.0,
            master_info.1,
        ).await?;

        log::info!(
            "[SSH+Sentinel] master 隧道已建立: 127.0.0.1:{} → {}:{}",
            master_local_port, master_info.0, master_info.1
        );

        // 4. 以 Standalone 模式连接到 master
        let node_auth = match sentinel_config.node_password.as_ref() {
            Some(pwd) if !pwd.is_empty() => format!(":{}@", pwd),
            _ => match (&config.username, &config.password) {
                (Some(user), Some(pwd)) if !user.is_empty() && !pwd.is_empty() => {
                    format!("{}:{}@", user, pwd)
                }
                (_, Some(pwd)) if !pwd.is_empty() => format!(":{}@", pwd),
                _ => String::new(),
            },
        };
        let master_conn_string = format!(
            "redis://{}127.0.0.1:{}/{}",
            node_auth, master_local_port, config.db
        );

        let client = RedisClient::new(config.name.clone(), Some(config.command_timeout));
        client.connect(&master_conn_string).await.map_err(|e| {
            AppError::Connection(format!("SSH+Sentinel master 连接失败: {}", e))
        })?;

        log::info!("[SSH+Sentinel] 连接已建立: {}", connection_id);
        Ok(Arc::new(client))
    }

    // ==================== 纯 Cluster 连接（支持 NAT 映射） ====================

    /// 纯 Cluster 连接（可选 NAT 映射）
    /// 如果配置了 nat_map，使用 NAT 映射连接
    /// 否则使用标准 Cluster 连接
    async fn connect_cluster_pure(
        &self,
        config: &ConnectionConfig,
        host: &str,
        port: u16,
    ) -> Result<Arc<RedisClient>, AppError> {
        let auth = Self::build_auth_prefix(config);
        let initial_node = format!("redis://{}{}:{}", auth, host, port);

        let mut client = RedisClient::new(config.name.clone(), Some(config.command_timeout));

        if let Some(ref nat_map) = config.nat_map {
            // 有 NAT 映射：使用映射地址连接
            let nodes = vec![initial_node];
            client
                .connect_cluster_with_nat_map(nodes, Some(nat_map))
                .await
                .map_err(|e| {
                    AppError::Connection(format!("Cluster (NAT) 连接失败: {}", e))
                })?;

            log::info!(
                "[RedisConnectionManager] Cluster (NAT) 连接已建立: {}:{}, 映射规则 {} 条",
                host, port, nat_map.len()
            );
        } else {
            // 无 NAT 映射：标准 Cluster 连接
            let nodes = vec![initial_node];
            client.connect_cluster(nodes).await.map_err(|e| {
                AppError::Connection(format!("Cluster 连接失败: {}", e))
            })?;

            log::info!(
                "[RedisConnectionManager] Cluster 连接已建立: {}:{}",
                host, port
            );
        }

        Ok(Arc::new(client))
    }

    // ==================== 纯 Sentinel 连接 ====================

    /// 纯 Sentinel 连接（无 SSH）
    async fn connect_sentinel_pure(
        &self,
        config: &ConnectionConfig,
        host: &str,
        port: u16,
    ) -> Result<Arc<RedisClient>, AppError> {
        let sentinel_config = config.sentinel.as_ref().unwrap();
        let sentinel_nodes = vec![format!("{}:{}", host, port)];

        let mut client = RedisClient::new(config.name.clone(), Some(config.command_timeout));
        client
            .connect_via_sentinel(
                sentinel_nodes,
                &sentinel_config.master_name,
                sentinel_config.password.as_deref(),
                sentinel_config.username.as_deref(),
                sentinel_config.node_password.as_deref(),
                config.db,
            )
            .await
            .map_err(|e| {
                AppError::Connection(format!("Sentinel 连接失败: {}", e))
            })?;

        log::info!(
            "[RedisConnectionManager] Sentinel 连接已建立: master={}",
            sentinel_config.master_name
        );
        Ok(Arc::new(client))
    }

    // ==================== Standalone 连接 ====================

    /// Standalone 连接
    async fn connect_standalone(
        &self,
        config: &ConnectionConfig,
        host: &str,
        port: u16,
    ) -> Result<Arc<RedisClient>, AppError> {
        let auth = Self::build_auth_prefix(config);
        let connection_string = format!("redis://{}{}:{}/{}", auth, host, port, config.db);

        let client = RedisClient::new(config.name.clone(), Some(config.command_timeout));
        client.connect(&connection_string).await.map_err(|e| {
            AppError::Connection(format!("Standalone 连接失败: {}", e))
        })?;

        log::info!(
            "[RedisConnectionManager] Standalone 连接已建立: {}:{}",
            host, port
        );
        Ok(Arc::new(client))
    }
}

#[async_trait::async_trait]
impl ConnectionManager<ConnectionConfig> for RedisConnectionManager {
    async fn create(&self, config: ConnectionConfig) -> Result<String, AppError> {
        let connection_id = config.id.clone();

        // 检查是否已存在同名连接
        if self.clients.contains_key(&connection_id) {
            return Err(AppError::BadRequest(format!("连接已存在: {}", connection_id)));
        }

        // 发送连接中事件
        self.emit_event("connection:connecting", &connection_id);

        // 根据连接模式路由到不同的连接方法
        let client = if config.cluster && config.ssh_tunnel.is_some() {
            // SSH + Cluster 组合
            self.connect_ssh_cluster(&config).await?
        } else if config.sentinel.is_some() && config.ssh_tunnel.is_some() {
            // SSH + Sentinel 组合
            self.connect_ssh_sentinel(&config).await?
        } else {
            // 解析连接地址（可能通过 SSH 隧道）
            let (host, port) = self.resolve_connection_address(&config).await?;

            if config.cluster {
                // 纯 Cluster（可选 NAT 映射）
                self.connect_cluster_pure(&config, &host, port).await?
            } else if config.sentinel.is_some() {
                // 纯 Sentinel
                self.connect_sentinel_pure(&config, &host, port).await?
            } else {
                // Standalone
                self.connect_standalone(&config, &host, port).await?
            }
        };

        // 缓存配置和客户端
        self.save_config(config).await?;
        self.clients.insert(connection_id.clone(), client);

        // 发送已连接事件
        self.emit_event("connection:connected", &connection_id);

        log::info!("[RedisConnectionManager] Redis 连接已建立: {}", connection_id);
        Ok(connection_id)
    }

    async fn close(&self, id: &str) -> Result<(), AppError> {
        if let Some((_, client)) = self.clients.remove(id) {
            client.disconnect().await;

            // 关闭关联的所有 SSH 隧道（包括主隧道和节点隧道）
            self.tunnel_manager.close_tunnel(id).await.ok();

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

        // 关闭所有 SSH 隧道
        self.tunnel_manager.close_all().await?;

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
