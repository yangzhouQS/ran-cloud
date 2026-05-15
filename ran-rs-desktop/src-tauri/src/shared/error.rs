// shared/error.rs — 全局错误处理
// 所有模块统一使用此错误类型，确保 IPC 返回一致的错误格式

use thiserror::Error;

/// 全局应用错误类型
#[derive(Debug, Error)]
pub enum AppError {
    #[error("连接错误: {0}")]
    Connection(String),

    #[error("Redis 错误: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("SSH 隧道错误: {0}")]
    Tunnel(String),

    #[error("Telepresence 错误: {0}")]
    Telepresence(String),

    #[error("存储错误: {0}")]
    Storage(String),

    #[error("参数错误: {0}")]
    BadRequest(String),

    #[error("未找到: {0}")]
    NotFound(String),

    #[error("权限不足: {0}")]
    Forbidden(String),

    #[error("内部错误: {0}")]
    Internal(String),
}

/// 为 Tauri Command 返回值实现 Serialize
/// Tauri 要求错误类型实现 Serialize
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
