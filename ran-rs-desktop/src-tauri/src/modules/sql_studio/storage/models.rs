// modules/sql-studio/storage/models.rs — 内部存储模型
// 使用 rusqlite 实现持久化，连接配置以 JSON 格式存储

use serde::{Deserialize, Serialize};

/// 查询历史记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryHistory {
    pub id: String,
    pub connection_id: String,
    pub database: Option<String>,
    pub sql: String,
    pub executed_at: String,
    pub execution_time_ms: Option<i64>,
    pub row_count: Option<i64>,
}
