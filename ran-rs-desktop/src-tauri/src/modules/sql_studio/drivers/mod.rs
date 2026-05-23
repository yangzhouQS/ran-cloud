// modules/sql-studio/drivers/mod.rs — 数据库驱动注册表
// 支持 PostgreSQL、MySQL、MariaDB、TiDB、SQLite

pub mod basic_database_client;
pub mod sqlite;
pub mod postgresql;
pub mod mysql;

use crate::shared::error::AppError;
use super::connection::models::DatabaseType;
use basic_database_client::BasicDatabaseClient;

/// 根据数据库类型创建驱动实例
pub fn create_driver(db_type: &DatabaseType) -> Result<Box<dyn BasicDatabaseClient>, AppError> {
    match db_type {
        DatabaseType::Sqlite => Ok(Box::new(sqlite::SqliteClient::new())),
        DatabaseType::Postgresql => Ok(Box::new(postgresql::PostgresqlClient::new())),
        DatabaseType::Mysql => Ok(Box::new(mysql::MysqlClient::new(db_type))),
        DatabaseType::Mariadb => Ok(Box::new(mysql::MysqlClient::new(db_type))),
        DatabaseType::Tidb => Ok(Box::new(mysql::MysqlClient::new(db_type))),
    }
}
