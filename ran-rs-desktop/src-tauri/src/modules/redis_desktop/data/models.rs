// modules/redis_desktop/data/models.rs — Redis 数据类型操作相关数据模型
// 覆盖 String/Hash/List/Set/ZSet/Stream 六种数据类型

use serde::{Deserialize, Serialize};

// ==================== String ====================

/// String 类型值
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StringData {
    pub value: String,
    pub encoding: String,
}

// ==================== Hash ====================

/// Hash 字段
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashField {
    pub field: String,
    pub value: String,
}

/// Hash 分页查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashPageParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    pub page: u32,
    pub page_size: u32,
    pub match_pattern: Option<String>,
}

// ==================== List ====================

/// List 元素
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEntry {
    pub index: i64,
    pub value: String,
}

/// List 分页查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPageParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    pub page: u32,
    pub page_size: u32,
}

// ==================== Set ====================

/// Set 成员
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMember {
    pub member: String,
}

/// Set 分页查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPageParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    pub page: u32,
    pub page_size: u32,
    pub match_pattern: Option<String>,
}

// ==================== ZSet (Sorted Set) ====================

/// ZSet 成员
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZSetEntry {
    pub member: String,
    pub score: f64,
}

/// ZSet 分页查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZSetPageParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    pub min_score: Option<f64>,
    pub max_score: Option<f64>,
    pub page: u32,
    pub page_size: u32,
}

// ==================== Stream ====================

/// Stream 条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<(String, String)>,
}

/// Stream 分页查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamPageParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    pub start_id: Option<String>,
    pub count: u64,
}

/// Stream 消费者组信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamGroupInfo {
    pub name: String,
    pub consumers: u64,
    pub pending: u64,
    pub last_delivered_id: String,
}

// ==================== 通用 ====================

/// 分页结果包装
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageResult<T> {
    pub items: Vec<T>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
}

/// 新增字段/成员请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataAddParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    /// 字段名（Hash）/ 索引位置（List）/ 成员（Set/ZSet）
    pub field: Option<String>,
    pub value: String,
    /// ZSet 分数
    pub score: Option<f64>,
}

/// 更新字段/成员请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataUpdateParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    pub field: String,
    pub new_field: Option<String>,
    pub value: String,
    pub score: Option<f64>,
}

/// 删除字段/成员请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDeleteParams {
    pub connection_id: String,
    pub db: u32,
    pub key: String,
    pub fields: Vec<String>,
}
