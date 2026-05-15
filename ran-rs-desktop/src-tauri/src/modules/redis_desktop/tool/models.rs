// modules/redis_desktop/tool/models.rs — 运维工具相关数据模型
// 慢日志、内存分析、服务器状态

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== 慢日志 ====================

/// 慢日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowLogEntry {
    /// 日志 ID
    pub id: i64,
    /// 执行时间戳（Unix）
    pub timestamp: i64,
    /// 执行耗时（微秒）
    pub duration_us: i64,
    /// 执行的命令
    pub command: Vec<String>,
    /// 客户端地址
    pub client_address: String,
    /// 客户端名称
    pub client_name: String,
}

// ==================== 内存分析 ====================

/// 内存分析条目（大 Key 分析）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryAnalysisEntry {
    /// Key 名称
    pub key: String,
    /// Key 类型
    pub key_type: String,
    /// 内存占用（字节）
    pub memory_usage: i64,
    /// 编码格式
    pub encoding: String,
    /// 元素数量
    pub length: i64,
}

/// 内存分析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryAnalysisResult {
    /// 分析的 Key 总数
    pub total_keys: u64,
    /// 总内存占用（字节）
    pub total_memory: i64,
    /// 大 Key 列表
    pub big_keys: Vec<MemoryAnalysisEntry>,
    /// 分析耗时（毫秒）
    pub duration_ms: u64,
}

// ==================== 服务器状态 ====================

/// 服务器状态信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    /// Redis 版本
    pub redis_version: String,
    /// 运行模式（standalone/sentinel/cluster）
    pub mode: String,
    /// 运行天数
    pub uptime_days: u64,
    /// 连接的客户端数
    pub connected_clients: u64,
    /// 已用内存（字节）
    pub used_memory: u64,
    /// 内存峰值（字节）
    pub used_memory_peak: u64,
    /// 总 Key 数量
    pub total_keys: u64,
    /// 过期 Key 数量
    pub expired_keys: u64,
    /// 每秒执行命令数
    pub instantaneous_ops_per_sec: u64,
    /// 每秒网络入流量（字节）
    pub total_net_input_bytes: u64,
    /// 每秒网络出流量（字节）
    pub total_net_output_bytes: u64,
    /// 命中次数
    pub keyspace_hits: u64,
    /// 未命中次数
    pub keyspace_misses: u64,
    /// 命中率
    pub hit_rate: f64,
}

/// 数据库详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    /// 数据库编号
    pub db: u32,
    /// Key 数量
    pub keys: u64,
    /// 带过期时间的 Key 数量
    pub expires: u64,
    /// 平均 TTL
    pub avg_ttl: i64,
}

/// 服务器信息（原始 INFO 命令解析结果）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    /// 分段信息
    pub sections: HashMap<String, HashMap<String, String>>,
}

// ==================== 命令日志 ====================

/// 命令日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandLogEntry {
    /// 唯一 ID
    pub id: String,
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// 命令名称（如 GET, SET, HGETALL）
    pub command: String,
    /// 命令参数
    pub args: Vec<String>,
    /// 执行耗时（毫秒）
    pub duration_ms: f64,
    /// 是否成功
    pub success: bool,
    /// 错误信息（失败时）
    pub error: Option<String>,
    /// 时间戳（Unix 毫秒）
    pub timestamp: i64,
}

/// 命令日志查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandLogQueryParams {
    /// 连接 ID
    pub connection_id: String,
    /// 最大条数（默认 100）
    pub limit: Option<usize>,
}
