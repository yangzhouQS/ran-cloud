// shared/result.rs — 全局 Result 类型别名

use super::error::AppError;

/// 全局 Result 类型，所有模块统一使用
pub type AppResult<T> = Result<T, AppError>;
