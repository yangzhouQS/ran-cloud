// modules/redis_desktop/connection/models.rs — 连接配置模型
// 对应 ARDM 中 NewConnectionDialog 的表单数据

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Redis 连接配置
/// 对应 ARDM 中 NewConnectionDialog 的表单数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    /// 唯一标识
    #[serde(default = "default_id")]
    pub id: String,
    /// 连接名称
    pub name: String,
    /// Redis 主机地址
    pub host: String,
    /// Redis 端口
    #[serde(default = "default_port")]
    pub port: u16,
    /// ACL 用户名（Redis 6+）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    /// 认证密码（加密存储）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// 数据库索引
    #[serde(default = "default_db")]
    pub db: u32,
    /// 连接超时（秒）
    #[serde(default = "default_timeout")]
    pub connection_timeout: u64,
    /// 命令执行超时（秒）
    #[serde(default = "default_timeout")]
    pub command_timeout: u64,
    /// SSH 隧道配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_tunnel: Option<SshTunnelConfig>,
    /// Sentinel 配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sentinel: Option<SentinelConfig>,
    /// Cluster 模式
    #[serde(default)]
    pub cluster: bool,
    /// Cluster NAT 映射
    /// key: "internalHost:internalPort", value: 映射后的地址
    /// 用于 Docker/NAT 环境下的集群连接
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nat_map: Option<HashMap<String, NatMapEntry>>,
    /// TLS 配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
    /// 连接颜色标记
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// 分隔符（用于 key 树展示）
    #[serde(default = "default_separator")]
    pub separator: String,
    /// 备注
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remark: Option<String>,
    /// 只读模式（拦截写命令）
    #[serde(default)]
    pub readonly: bool,
    /// 排序序号（用于拖拽排序持久化）
    #[serde(default)]
    pub sort_order: Option<u32>,
}

/// NAT 映射条目
/// 将集群内部地址映射为外部可达地址
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NatMapEntry {
    /// 映射后的主机地址
    pub host: String,
    /// 映射后的端口
    pub port: u16,
}

/// 集群节点信息（从 CLUSTER NODES 解析）
#[derive(Debug, Clone)]
pub struct ClusterNodeInfo {
    /// 节点 ID
    pub node_id: String,
    /// 节点地址 host:port
    pub host: String,
    pub port: u16,
    /// 节点角色标志（master, slave）
    pub flags: String,
    /// 是否为 master
    pub is_master: bool,
}

/// SSH 隧道配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshTunnelConfig {
    /// SSH 主机
    pub host: String,
    /// SSH 端口
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    /// SSH 用户名
    pub username: String,
    /// SSH 密码（二选一）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// SSH 私钥路径（二选一）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key_path: Option<String>,
    /// 私钥密码
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
    /// SSH 连接超时（秒）
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

/// Sentinel 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelConfig {
    /// Sentinel 节点列表 "host:port"
    pub nodes: Vec<String>,
    /// 主节点名称
    pub master_name: String,
    /// Sentinel 密码
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// Sentinel 连接的用户名 (Redis 6+ ACL)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    /// 节点密码（获取 master 地址后连接用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_password: Option<String>,
}

/// TLS 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsConfig {
    /// 是否验证证书
    #[serde(default = "default_true")]
    pub verify_cert: bool,
    /// CA 证书路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ca_cert_path: Option<String>,
    /// 客户端证书路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cert_path: Option<String>,
    /// 客户端私钥路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_path: Option<String>,
    /// SNI 主机名
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sni: Option<String>,
}

/// 连接信息（返回给前端的摘要）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub db: u32,
    pub status: String,
    pub cluster: bool,
    pub has_sentinel: bool,
    pub has_ssh_tunnel: bool,
    pub has_tls: bool,
    pub readonly: bool,
    pub color: Option<String>,
    pub separator: String,
}

impl From<&ConnectionConfig> for ConnectionInfo {
    fn from(config: &ConnectionConfig) -> Self {
        Self {
            id: config.id.clone(),
            name: config.name.clone(),
            host: config.host.clone(),
            port: config.port,
            db: config.db,
            status: "disconnected".to_string(),
            cluster: config.cluster,
            has_sentinel: config.sentinel.is_some(),
            has_ssh_tunnel: config.ssh_tunnel.is_some(),
            has_tls: config.tls.is_some(),
            readonly: config.readonly,
            color: config.color.clone(),
            separator: config.separator.clone(),
        }
    }
}

impl ConnectionConfig {
    /// 生成 redis 连接字符串
    /// 格式：redis://[username:password@]host:port/db
    pub fn connection_string(&self) -> String {
        let auth = match (&self.username, &self.password) {
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
        };
        format!("redis://{}{}:{}/{}", auth, self.host, self.port, self.db)
    }

    /// 生成用于显示的安全连接字符串（隐藏密码）
    pub fn connection_string_safe(&self) -> String {
        let auth = match &self.username {
            Some(user) if !user.is_empty() => format!("{}:***@", user),
            _ if self.password.is_some() => ":***@".to_string(),
            _ => String::new(),
        };
        format!("redis://{}{}:{}/{}", auth, self.host, self.port, self.db)
    }

    /// 获取显示用的主机描述
    pub fn display_host(&self) -> String {
        if self.cluster {
            format!("{}:{} [Cluster]", self.host, self.port)
        } else if self.sentinel.is_some() {
            format!("{} [Sentinel]", self.name)
        } else {
            format!("{}:{}", self.host, self.port)
        }
    }
}

// 默认值函数
fn default_id() -> String { uuid::Uuid::new_v4().to_string() }
fn default_port() -> u16 { 6379 }
fn default_db() -> u32 { 0 }
fn default_timeout() -> u64 { 5 }
fn default_separator() -> String { ":".to_string() }
fn default_ssh_port() -> u16 { 22 }
fn default_true() -> bool { true }
