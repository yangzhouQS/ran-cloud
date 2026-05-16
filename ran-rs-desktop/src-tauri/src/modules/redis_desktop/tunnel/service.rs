// modules/redis_desktop/tunnel/service.rs — SSH 隧道服务
// 使用 ssh2 crate 创建本地端口转发隧道
// 将本地随机端口通过 SSH 转发到远程 Redis 服务器
// 支持单连接多隧道（用于 Cluster 多节点 / Sentinel 多节点场景）

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use ssh2::Session;
use tokio::sync::RwLock;

use crate::shared::error::AppError;
use super::super::connection::models::SshTunnelConfig;

/// SSH 隧道实例
struct SshTunnel {
    /// 本地监听端口
    local_port: u16,
    /// 转发任务句柄（任务内部持有 Session 所有权）
    task_handle: tokio::task::JoinHandle<()>,
    /// 关闭信号
    shutdown_tx: tokio::sync::watch::Sender<bool>,
}

impl SshTunnel {
    /// 获取本地端口
    pub fn local_port(&self) -> u16 {
        self.local_port
    }
}

/// SSH 隧道管理器
/// 管理所有 SSH 隧道实例的生命周期
/// 支持每个连接创建多个隧道（用于 Cluster 多节点场景）
/// key 格式: "{connection_id}" 或 "{connection_id}::node::{host}:{port}"
pub struct SshTunnelManager {
    /// 活跃隧道 <tunnel_key, SshTunnel>
    tunnels: RwLock<HashMap<String, SshTunnel>>,
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: RwLock::new(HashMap::new()),
        }
    }

    /// 创建 SSH 隧道（使用默认 key = connection_id）
    /// 返回本地端口号，redis 可通过 localhost:<port> 连接
    pub async fn create_tunnel(
        &self,
        connection_id: &str,
        config: &SshTunnelConfig,
        target_host: &str,
        target_port: u16,
    ) -> Result<u16, AppError> {
        self.create_tunnel_with_key(connection_id, config, target_host, target_port)
            .await
    }

    /// 创建 SSH 隧道（使用自定义 key）
    /// 用于同一连接需要多个隧道的场景（如 Cluster 多节点）
    /// key 格式建议: "{connection_id}::node::{host}:{port}"
    pub async fn create_tunnel_with_key(
        &self,
        tunnel_key: &str,
        config: &SshTunnelConfig,
        target_host: &str,
        target_port: u16,
    ) -> Result<u16, AppError> {
        // 检查是否已存在
        {
            let tunnels = self.tunnels.read().await;
            if let Some(existing) = tunnels.get(tunnel_key) {
                return Ok(existing.local_port());
            }
        }

        // 1. 创建 SSH 会话（在阻塞线程中执行）
        let ssh_config = config.clone();
        let session = tokio::task::spawn_blocking(move || {
            create_ssh_session(&ssh_config)
        })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))??;

        // 2. 创建本地 TCP 监听器
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| AppError::Connection(format!("本地端口绑定失败: {}", e)))?;
        let local_port = listener.local_addr()
            .map_err(|e| AppError::Connection(format!("获取本地端口失败: {}", e)))?
            .port();

        log::info!(
            "[SshTunnel] 隧道已创建: key={}, 127.0.0.1:{} → {}:{} → {}:{}",
            tunnel_key, local_port, config.host, config.port, target_host, target_port
        );

        // 3. 设置非阻塞模式用于轮询关闭信号
        listener
            .set_nonblocking(true)
            .map_err(|e| AppError::Connection(format!("设置非阻塞模式失败: {}", e)))?;

        // 4. 创建关闭信号通道
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        // 5. 启动转发任务（Session 所有权转移到 forward_loop）
        let target_host_owned = target_host.to_string();
        let task_handle = tokio::task::spawn_blocking(move || {
            forward_loop(listener, session, &target_host_owned, target_port, shutdown_rx);
        });

        // 6. 存储隧道实例
        let tunnel = SshTunnel {
            local_port,
            task_handle,
            shutdown_tx,
        };

        let mut tunnels = self.tunnels.write().await;
        tunnels.insert(tunnel_key.to_string(), tunnel);

        Ok(local_port)
    }

    /// 为多个目标地址批量创建 SSH 隧道
    /// 返回 Vec<(target_host, target_port, local_port)>
    /// 用于 Cluster 模式下为每个节点创建独立隧道
    pub async fn create_cluster_tunnels(
        &self,
        connection_id: &str,
        config: &SshTunnelConfig,
        nodes: &[(String, u16)],
    ) -> Result<Vec<(String, u16, u16)>, AppError> {
        let mut results = Vec::with_capacity(nodes.len());

        for (host, port) in nodes {
            let tunnel_key = format!("{}::node::{}:{}", connection_id, host, port);
            let local_port = self
                .create_tunnel_with_key(&tunnel_key, config, host, *port)
                .await?;
            results.push((host.clone(), *port, local_port));
        }

        log::info!(
            "[SshTunnel] 已为连接 {} 创建 {} 个集群节点隧道",
            connection_id,
            results.len()
        );

        Ok(results)
    }

    /// 关闭指定连接的所有 SSH 隧道
    /// 包括主隧道和所有节点隧道
    pub async fn close_tunnel(&self, connection_id: &str) -> Result<(), AppError> {
        let mut tunnels = self.tunnels.write().await;

        // 收集所有属于该连接的 key（包括主隧道和节点隧道）
        let keys_to_remove: Vec<String> = tunnels
            .keys()
            .filter(|k| {
                // 精确匹配或以 "{connection_id}::" 开头
                k.as_str() == connection_id || k.starts_with(&format!("{}::", connection_id))
            })
            .cloned()
            .collect();

        for key in keys_to_remove {
            if let Some(tunnel) = tunnels.remove(&key) {
                let _ = tunnel.shutdown_tx.send(true);
                tunnel.task_handle.abort();
                log::info!("[SshTunnel] 隧道已关闭: {}", key);
            }
        }

        Ok(())
    }

    /// 获取指定连接的隧道本地端口（主隧道）
    pub async fn get_tunnel_port(&self, connection_id: &str) -> Option<u16> {
        let tunnels = self.tunnels.read().await;
        tunnels.get(connection_id).map(|t| t.local_port())
    }

    /// 关闭所有隧道
    pub async fn close_all(&self) -> Result<(), AppError> {
        let mut tunnels = self.tunnels.write().await;
        for (id, tunnel) in tunnels.drain() {
            let _ = tunnel.shutdown_tx.send(true);
            tunnel.task_handle.abort();
            log::info!("[SshTunnel] 隧道已关闭: {}", id);
        }
        Ok(())
    }
}

/// 创建 SSH 会话并认证
fn create_ssh_session(config: &SshTunnelConfig) -> Result<Session, AppError> {
    // 连接到 SSH 服务器
    let tcp = std::net::TcpStream::connect((config.host.as_str(), config.port))
        .map_err(|e| AppError::Connection(format!("SSH 连接失败 ({}:{}): {}", config.host, config.port, e)))?;

    let mut session = Session::new()
        .map_err(|e| AppError::Connection(format!("SSH 会话创建失败: {}", e)))?;
    session.set_tcp_stream(tcp);
    session.set_timeout(std::time::Duration::from_secs(config.timeout).as_millis() as u32);

    // SSH 握手
    session.handshake()
        .map_err(|e| AppError::Connection(format!("SSH 握手失败: {}", e)))?;

    // 认证：密码或私钥
    if let Some(ref password) = config.password {
        session.userauth_password(&config.username, password)
            .map_err(|e| AppError::Connection(format!("SSH 密码认证失败: {}", e)))?;
    } else if let Some(ref key_path) = config.private_key_path {
        let passphrase = config.passphrase.as_deref();
        session.userauth_pubkey_file(
            &config.username,
            None,
            std::path::Path::new(key_path),
            passphrase,
        )
        .map_err(|e| AppError::Connection(format!("SSH 密钥认证失败 ({}): {}", key_path, e)))?;
    } else {
        return Err(AppError::Connection("SSH 需要密码或私钥进行认证".to_string()));
    }

    if !session.authenticated() {
        return Err(AppError::Connection("SSH 认证未通过".to_string()));
    }

    log::info!("[SshTunnel] SSH 会话已建立: {}@{}", config.username, config.host);
    Ok(session)
}

/// 转发循环
/// 拥有 Session 所有权，在阻塞线程中运行
/// 接受本地连接并通过 SSH 转发到远程
fn forward_loop(
    listener: std::net::TcpListener,
    session: Session,
    target_host: &str,
    target_port: u16,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    // 设置 Session 为阻塞模式（默认就是阻塞的）
    session.set_blocking(true);

    let mut active_connections: Vec<std::thread::JoinHandle<()>> = Vec::new();

    loop {
        // 检查关闭信号
        if *shutdown_rx.borrow() {
            log::info!("[SshTunnel] 收到关闭信号，停止转发");
            break;
        }

        // 清理已完成的连接线程
        active_connections.retain(|h| !h.is_finished());

        // 接受新连接（listener 是非阻塞的）
        match listener.accept() {
            Ok((tcp_stream, _addr)) => {
                match session.channel_direct_tcpip(target_host, target_port, None) {
                    Ok(channel) => {
                        // 为每个连接启动双向转发线程
                        let handle = std::thread::spawn(move || {
                            forward_connection(tcp_stream, channel);
                        });
                        active_connections.push(handle);
                    }
                    Err(e) => {
                        log::error!("[SshTunnel] SSH 通道创建失败: {}", e);
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // 无新连接，短暂休眠
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(e) => {
                log::error!("[SshTunnel] 接受连接失败: {}", e);
                break;
            }
        }
    }

    // 等待所有活跃连接完成（最多等 5 秒）
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    for h in active_connections {
        if std::time::Instant::now() < deadline {
            let _ = h.join();
        }
    }

    // 关闭 Session
    let _ = session.disconnect(None, "Tunnel closing", None);
    log::info!("[SshTunnel] 转发循环已退出");
}

/// 双向转发单个连接
/// TCP ↔ SSH Channel
/// 使用双线程阻塞 I/O 实现全双工转发
fn forward_connection(
    tcp_stream: std::net::TcpStream,
    channel: ssh2::Channel,
) {
    // 设置 TCP 超时以避免永久阻塞
    let _ = tcp_stream.set_read_timeout(Some(std::time::Duration::from_secs(60)));
    let _ = tcp_stream.set_write_timeout(Some(std::time::Duration::from_secs(60)));

    // 克隆 TCP 流以分离读写
    let tcp_read = match tcp_stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            log::error!("[SshTunnel] TCP 流克隆失败: {}", e);
            return;
        }
    };
    let tcp_write = tcp_stream;

    // 使用 Channel 的 flush 方法确保数据发送
    // ssh2::Channel 实现了 Read + Write，可以在两个线程中分别使用
    // 通过 Arc<Mutex> 包装实现安全的跨线程共享
    let channel = Arc::new(std::sync::Mutex::new(channel));
    let ch_read = Arc::clone(&channel);
    let ch_write = Arc::clone(&channel);

    // 线程1: TCP Read → Channel Write
    let tcp_to_channel = std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut tcp = tcp_read;
        loop {
            match tcp.read(&mut buf) {
                Ok(0) => break, // TCP 连接关闭
                Ok(n) => {
                    let mut ch = ch_write.lock().unwrap();
                    if ch.write_all(&buf[..n]).is_err() {
                        break;
                    }
                    let _ = ch.flush();
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    continue; // 超时，继续轮询
                }
                Err(_) => break,
            }
        }
    });

    // 线程2: Channel Read → TCP Write
    let channel_to_tcp = std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut tcp = tcp_write;
        loop {
            let mut ch = ch_read.lock().unwrap();
            match ch.read(&mut buf) {
                Ok(0) => {
                    // SSH 通道 EOF
                    drop(ch);
                    break;
                }
                Ok(n) => {
                    drop(ch); // 释放锁后再写 TCP
                    if tcp.write_all(&buf[..n]).is_err() {
                        break;
                    }
                    let _ = tcp.flush();
                }
                Err(_) => {
                    drop(ch);
                    break;
                }
            }
        }
    });

    // 等待两个线程完成
    let _ = tcp_to_channel.join();
    let _ = channel_to_tcp.join();

    // 关闭 channel
    let mut ch = channel.lock().unwrap();
    let _ = ch.close();
    log::debug!("[SshTunnel] 连接转发已结束");
}
