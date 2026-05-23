//! SQL Studio 驱动构造测试（无需 live DB）
use ran_rs_desktop_lib::modules::sql_studio::drivers::mysql::MysqlClient;
use ran_rs_desktop_lib::modules::sql_studio::drivers::postgresql::PostgresqlClient;
use ran_rs_desktop_lib::modules::sql_studio::connection::models::DatabaseType;
use ran_rs_desktop_lib::modules::sql_studio::drivers::basic_database_client::BasicDatabaseClient;

#[test]
fn mysql_new_mysql_label() {
    let client = MysqlClient::new(&DatabaseType::Mysql);
    let features = client.supported_features();
    assert!(features.list_tables);
    assert!(features.list_routines);
}

#[test]
fn mysql_new_mariadb() {
    let client = MysqlClient::new(&DatabaseType::Mariadb);
    let features = client.supported_features();
    assert!(features.list_tables);
}

#[test]
fn mysql_new_tidb() {
    let client = MysqlClient::new(&DatabaseType::Tidb);
    let features = client.supported_features();
    assert!(features.list_tables);
}

#[test]
fn mysql_supported_features_all_true() {
    let client = MysqlClient::new(&DatabaseType::Mysql);
    let f = client.supported_features();
    assert!(f.list_tables);
    assert!(f.list_columns);
    assert!(f.list_routines);
    assert!(f.list_indexes);
    assert!(f.list_triggers);
    assert!(f.list_partitions);
    assert!(f.create_table);
    assert!(f.alter_table);
    assert!(f.drop_table);
    assert!(f.export_data);
    assert!(f.import_data);
    assert!(f.backup);
}

#[test]
fn postgresql_new() {
    let client = PostgresqlClient::new();
    let features = client.supported_features();
    assert!(features.list_tables);
}

#[test]
fn postgresql_supported_features_all_true() {
    let client = PostgresqlClient::new();
    let f = client.supported_features();
    assert!(f.list_tables);
    assert!(f.list_columns);
    assert!(f.list_routines);
    assert!(f.list_indexes);
    assert!(f.list_triggers);
    assert!(f.list_partitions);
    assert!(f.create_table);
    assert!(f.alter_table);
    assert!(f.drop_table);
    assert!(f.export_data);
    assert!(f.import_data);
    assert!(f.backup);
}
