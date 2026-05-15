// modules/redis_desktop/cli/models.rs — CLI 命令行相关数据模型

use serde::{Deserialize, Serialize};

/// CLI 命令执行请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliExecParams {
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// 命令文本
    pub command: String,
}

/// CLI 命令执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliExecResult {
    /// 原始命令
    pub command: String,
    /// 执行结果（字符串表示）
    pub result: String,
    /// 结果类型（string/integer/array/error/status）
    pub result_type: String,
    /// 执行耗时（毫秒）
    pub duration_ms: u64,
}

/// CLI 命令历史记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliHistoryEntry {
    /// 命令文本
    pub command: String,
    /// 执行时间戳
    pub timestamp: i64,
    /// 连接 ID
    pub connection_id: String,
}
