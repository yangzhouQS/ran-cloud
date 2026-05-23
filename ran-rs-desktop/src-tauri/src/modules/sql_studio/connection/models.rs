// modules/sql-studio/connection/models.rs — 连接配置模型
// 支持 PostgreSQL、MySQL、MariaDB、TiDB、SQLite 的连接配置

use serde::{Deserialize, Serialize};

/// 支持的数据库类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    Postgresql,
    Mysql,
    Mariadb,
    Tidb,
    Sqlite,
}

/// SSL 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SslConfig {
    pub enabled: bool,
    pub ca_file: Option<String>,
    pub cert_file: Option<String>,
    pub key_file: Option<String>,
    pub reject_unauthorized: bool,
}

impl Default for SslConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            ca_file: None,
            cert_file: None,
            key_file: None,
            reject_unauthorized: false,
        }
    }
}

/// SSH 隧道配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub passphrase: Option<String>,
    pub bastion_host: Option<String>,
    pub bastion_port: Option<u16>,
}

impl Default for SshTunnelConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: String::new(),
            port: 22,
            user: String::new(),
            password: None,
            private_key: None,
            passphrase: None,
            bastion_host: None,
            bastion_port: None,
        }
    }
}

/// 数据库连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    /// 连接 ID
    pub id: String,
    /// 连接名称
    pub name: String,
    /// 数据库类型
    pub db_type: DatabaseType,
    /// 主机地址（SQLite 为文件路径）
    pub host: Option<String>,
    /// 端口号
    pub port: Option<u16>,
    /// 用户名
    pub user: Option<String>,
    /// 密码（加密存储）
    pub password: Option<String>,
    /// 默认数据库
    pub database: Option<String>,
    /// 连接 URL（可选，覆盖以上字段）
    pub url: Option<String>,
    /// SSL 配置
    #[serde(default)]
    pub ssl: SslConfig,
    /// SSH 隧道配置
    #[serde(default)]
    pub ssh: SshTunnelConfig,
    /// 连接选项（驱动特定参数）
    pub options: Option<serde_json::Value>,
}

/// 连接信息（返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub db_type: DatabaseType,
    pub status: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
}
