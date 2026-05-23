// modules/sql-studio/tunnel/service.rs — SQL Studio SSH 隧道适配层
// 复用 redis_desktop 模块的 SshTunnelManager
// 将 SQL Studio 的 SshTunnelConfig 转换为 Redis 模块所需的格式

use std::sync::Arc;

use crate::shared::error::AppError;
use crate::modules::redis_desktop::tunnel::SshTunnelManager;
use super::super::connection::models::SshTunnelConfig;

/// SQL Studio SSH 隧道服务
/// 封装共享的 SshTunnelManager，处理配置转换
pub struct SqlTunnelService {
    manager: Arc<SshTunnelManager>,
}

impl SqlTunnelService {
    pub fn new(manager: Arc<SshTunnelManager>) -> Self {
        Self { manager }
    }

    /// 为连接创建 SSH 隧道
    /// 返回本地端口号，驱动可通过 127.0.0.1:<port> 连接
    pub async fn create_tunnel(
        &self,
        connection_id: &str,
        ssh_config: &SshTunnelConfig,
        target_host: &str,
        target_port: u16,
    ) -> Result<u16, AppError> {
        let redis_config = convert_ssh_config(ssh_config);
        self.manager
            .create_tunnel(connection_id, &redis_config, target_host, target_port)
            .await
    }

    /// 关闭指定连接的 SSH 隧道
    pub async fn close_tunnel(&self, connection_id: &str) -> Result<(), AppError> {
        self.manager.close_tunnel(connection_id).await
    }

    /// 获取指定连接的隧道本地端口
    pub async fn get_tunnel_port(&self, connection_id: &str) -> Option<u16> {
        self.manager.get_tunnel_port(connection_id).await
    }

    /// 关闭所有隧道
    pub async fn close_all(&self) -> Result<(), AppError> {
        self.manager.close_all().await
    }
}

/// 将 SQL Studio 的 SshTunnelConfig 转换为 Redis 模块的格式
fn convert_ssh_config(sql_config: &SshTunnelConfig) -> crate::modules::redis_desktop::connection::models::SshTunnelConfig {
    crate::modules::redis_desktop::connection::models::SshTunnelConfig {
        host: sql_config.host.clone(),
        port: sql_config.port,
        username: sql_config.user.clone(),
        password: sql_config.password.clone(),
        private_key_path: sql_config.private_key.clone(),
        passphrase: sql_config.passphrase.clone(),
        timeout: 10,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config() -> SshTunnelConfig {
        SshTunnelConfig {
            enabled: true,
            host: "ssh.example.com".to_string(),
            port: 2222,
            user: "admin".to_string(),
            password: Some("secret".to_string()),
            private_key: None,
            passphrase: None,
            bastion_host: None,
            bastion_port: None,
        }
    }

    #[test]
    fn convert_full_config() {
        let cfg = make_config();
        let redis_cfg = convert_ssh_config(&cfg);
        assert_eq!(redis_cfg.host, "ssh.example.com");
        assert_eq!(redis_cfg.port, 2222);
        assert_eq!(redis_cfg.username, "admin");
        assert_eq!(redis_cfg.password.as_deref(), Some("secret"));
    }

    #[test]
    fn convert_minimal_config() {
        let cfg = SshTunnelConfig {
            enabled: false,
            host: "h".to_string(), port: 22, user: "u".to_string(),
            password: None, private_key: None, passphrase: None,
            bastion_host: None, bastion_port: None,
        };
        let redis_cfg = convert_ssh_config(&cfg);
        assert!(redis_cfg.password.is_none());
        assert!(redis_cfg.private_key_path.is_none());
    }

    #[test]
    fn convert_timeout_always_10() {
        let cfg = make_config();
        let redis_cfg = convert_ssh_config(&cfg);
        assert_eq!(redis_cfg.timeout, 10);
    }
}
