// modules/sql-studio/query/models.rs — 查询结果模型

use serde::{Deserialize, Serialize};

/// 查询请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    pub connection_id: String,
    pub sql: String,
    pub database: Option<String>,
    pub limit: Option<u64>,
}

/// 查询结果列
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultColumn {
    pub name: String,
    pub data_type: Option<String>,
}

/// 查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<ResultColumn>,
    pub rows: Vec<serde_json::Value>,
    pub affected_rows: Option<u64>,
    pub execution_time_ms: u64,
}

/// 查询错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryError {
    pub message: String,
    pub code: Option<String>,
}
