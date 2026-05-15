// shared/connection.rs — 通用连接管理 trait
// 不同类型的连接（Redis、Telepresence 等）各自实现此 trait

use async_trait::async_trait;
use serde::Serialize;

use super::error::AppError;
use super::result::AppResult;

/// 连接状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

/// 通用连接管理 trait
/// 不同类型的连接（Redis、Telepresence、K8s 等）各自实现此 trait
#[async_trait]
pub trait ConnectionManager<C>: Send + Sync {
    /// 创建连接，返回连接 ID
    async fn create(&self, config: C) -> AppResult<String>;

    /// 关闭指定连接
    async fn close(&self, id: &str) -> AppResult<()>;

    /// 关闭所有连接
    async fn close_all(&self) -> AppResult<()>;

    /// 获取连接状态
    async fn status(&self, id: &str) -> ConnectionStatus;

    /// 列出所有活跃连接 ID
    fn list_active(&self) -> Vec<String>;
}
