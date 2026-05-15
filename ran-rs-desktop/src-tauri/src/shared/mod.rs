// shared/mod.rs — 全局共享模块入口
// 所有模块共用的基础类型、工具、trait

pub mod connection;
pub mod constants;
pub mod error;
pub mod event;
pub mod result;

// 便捷 re-export
pub use connection::{ConnectionManager, ConnectionStatus};
pub use error::AppError;
pub use result::AppResult;
