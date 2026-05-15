// modules/redis_desktop/key/models.rs — Key 操作相关数据模型

use serde::{Deserialize, Serialize};

/// Key 扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyScanResult {
    /// Key 名称
    pub key: String,
    /// Key 类型
    pub key_type: String,
    /// TTL（秒），-1 表示永不过期，-2 表示已过期
    pub ttl: i64,
    /// 内存占用（字节），可能为 None
    pub memory_usage: Option<i64>,
}

/// Key 详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDetail {
    /// Key 名称
    pub key: String,
    /// Key 类型
    pub key_type: String,
    /// TTL（秒）
    pub ttl: i64,
    /// 内存占用（字节）
    pub memory_usage: Option<i64>,
    /// 编码格式
    pub encoding: String,
    /// 元素数量（对于集合类型）
    pub length: i64,
}

/// Key 扫描请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyScanParams {
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// 匹配模式（如 user:*）
    pub pattern: Option<String>,
    /// 每次扫描数量
    pub count: Option<u64>,
    /// 游标
    pub cursor: Option<u64>,
}

/// SCAN 流式进度事件（通过 Tauri Events 推送到前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    /// 扫描会话 ID（用于区分多次扫描）
    pub scan_id: String,
    /// 连接 ID
    pub connection_id: String,
    /// 当前游标
    pub cursor: u64,
    /// 本批次返回的 Key 数量
    pub batch_count: usize,
    /// 本批次的 Key 列表
    pub keys: Vec<String>,
    /// 是否扫描完成（cursor == 0）
    pub done: bool,
    /// 累计扫描总数
    pub total_scanned: usize,
}

/// SCAN 启动请求（前端发起扫描，后端通过事件推送进度）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartParams {
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// 匹配模式
    pub pattern: Option<String>,
    /// 每次 SCAN 数量（默认 200）
    pub count: Option<u64>,
    /// 扫描会话 ID（前端生成，用于区分多次扫描）
    pub scan_id: String,
}

/// SCAN 取消请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCancelParams {
    /// 扫描会话 ID
    pub scan_id: String,
}

/// SCAN 继续请求（前端请求下一批）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanContinueParams {
    /// 扫描会话 ID
    pub scan_id: String,
    /// 连接 ID
    pub connection_id: String,
    /// 当前游标
    pub cursor: u64,
    /// 匹配模式
    pub pattern: Option<String>,
    /// 每次 SCAN 数量
    pub count: Option<u64>,
}

/// Key 批量删除参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDeleteParams {
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// 要删除的 Key 列表
    pub keys: Vec<String>,
}

/// Key 重命名参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyRenameParams {
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// 旧 Key 名
    pub old_key: String,
    /// 新 Key 名
    pub new_key: String,
}

/// Key 过期时间设置参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyExpireParams {
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// Key 名
    pub key: String,
    /// 过期时间（秒），-1 表示永不过期（PERSIST）
    pub seconds: i64,
}

/// Key 详情查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDetailParams {
    /// 连接 ID
    pub connection_id: String,
    /// 数据库编号
    pub db: u32,
    /// Key 名
    pub key: String,
}
