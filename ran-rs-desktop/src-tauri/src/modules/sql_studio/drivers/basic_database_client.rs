// modules/sql-studio/drivers/basic_database_client.rs — 数据库客户端基础 trait
// 镜像 Beekeeper Studio 的 BasicDatabaseClient TypeScript 接口
// 所有数据库驱动必须实现此 trait

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::shared::error::AppError;
use super::super::connection::models::ConnectionConfig;

/// 数据库/Schema 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    /// 数据库/Schema 名称
    pub name: String,
    /// 类型标识："database" | "schema" | "main"
    pub kind: String,
}

/// 表信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub schema: Option<String>,
    pub table_type: String,
    pub row_count: Option<i64>,
    pub comment: Option<String>,
}

/// 列信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
    pub comment: Option<String>,
}

/// 支持的功能集
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportedFeatures {
    pub list_tables: bool,
    pub list_columns: bool,
    pub list_routines: bool,
    pub list_indexes: bool,
    pub list_triggers: bool,
    pub list_partitions: bool,
    pub create_table: bool,
    pub alter_table: bool,
    pub drop_table: bool,
    pub export_data: bool,
    pub import_data: bool,
    pub backup: bool,
}

impl Default for SupportedFeatures {
    fn default() -> Self {
        Self {
            list_tables: true,
            list_columns: true,
            list_routines: false,
            list_indexes: true,
            list_triggers: false,
            list_partitions: false,
            create_table: true,
            alter_table: true,
            drop_table: true,
            export_data: false,
            import_data: false,
            backup: false,
        }
    }
}

/// 数据库客户端基础 trait
/// 所有数据库驱动（PostgreSQL、MySQL、SQLite）必须实现此 trait
#[async_trait]
pub trait BasicDatabaseClient: Send + Sync {
    /// 建立连接
    async fn connect(&self, config: &ConnectionConfig) -> Result<(), AppError>;

    /// 断开连接
    async fn disconnect(&self) -> Result<(), AppError>;

    /// 测试连接是否可用
    async fn ping(&self) -> Result<bool, AppError>;

    /// 获取支持的功能集
    fn supported_features(&self) -> SupportedFeatures;

    /// 列出所有表
    async fn list_tables(&self, schema: Option<&str>) -> Result<Vec<TableInfo>, AppError>;

    /// 列出指定表的所有列
    async fn list_columns(&self, table: &str, schema: Option<&str>) -> Result<Vec<ColumnInfo>, AppError>;

    /// 执行 SQL 查询
    async fn execute_query(&self, sql: &str, limit: Option<u64>) -> Result<serde_json::Value, AppError>;

    /// 获取版本信息
    async fn version(&self) -> Result<String, AppError>;

    /// 列出所有可访问的数据库/Schema
    /// PostgreSQL: 返回 schema 列表
    /// MySQL/MariaDB/TiDB: 返回 database 列表
    /// SQLite: 返回单个 "main"
    async fn list_databases(&self) -> Result<Vec<DatabaseInfo>, AppError>;
}
