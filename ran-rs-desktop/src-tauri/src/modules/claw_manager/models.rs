// modules/claw_manager/models.rs — 数据结构定义
// Claw Manager 模块的请求/响应结构体

use std::collections::HashMap;

/// 命令执行请求参数
#[derive(Debug, serde::Deserialize)]
pub struct CommandRequest {
    /// 完整命令字符串，如 "openclaw gateway start"
    pub command: String,
    /// 可选的工作目录
    #[serde(default)]
    pub cwd: Option<String>,
    /// 可选的环境变量
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    /// 超时时间（秒），默认 30
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}

/// 命令执行结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandResult {
    /// 是否执行成功（exit code == 0）
    pub success: bool,
    /// 标准输出
    pub stdout: String,
    /// 标准错误
    pub stderr: String,
    /// 退出码（None 表示进程被信号终止或超时）
    pub exit_code: Option<i32>,
    /// 合并后的输出（stdout + stderr）
    pub output: String,
    /// 执行耗时（毫秒）
    pub duration_ms: u64,
}

/// CLI 工具信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct ClawCliInfo {
    /// CLI 是否可用
    pub available: bool,
    /// CLI 版本号
    pub version: Option<String>,
    /// CLI 可执行文件路径
    pub path: Option<String>,
    /// 错误信息（不可用时）
    pub error: Option<String>,
}
