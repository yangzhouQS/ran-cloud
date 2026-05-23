// sqlite_driver_tests.rs — SQLite 驱动 :memory: 测试（Tier 2）

use ran_rs_desktop_lib::modules::sql_studio::drivers::sqlite::SqliteClient;
use ran_rs_desktop_lib::modules::sql_studio::drivers::basic_database_client::BasicDatabaseClient;
use ran_rs_desktop_lib::modules::sql_studio::connection::models::{
    ConnectionConfig, DatabaseType, SslConfig, SshTunnelConfig,
};

fn sqlite_config() -> ConnectionConfig {
    ConnectionConfig {
        id: "test-sqlite".to_string(),
        name: "Test SQLite".to_string(),
        db_type: DatabaseType::Sqlite,
        host: None,
        port: None,
        user: None,
        password: None,
        database: Some(":memory:".to_string()),
        url: None,
        ssl: SslConfig::default(),
        ssh: SshTunnelConfig::default(),
        options: None,
    }
}

#[tokio::test]
async fn test_sqlite_connect_and_disconnect() {
    let client = SqliteClient::new();
    let config = sqlite_config();

    client.connect(&config).await.unwrap();
    client.disconnect().await.unwrap();
}

#[tokio::test]
async fn test_sqlite_ping() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    let result = client.ping().await.unwrap();
    assert!(result);
}

#[tokio::test]
async fn test_sqlite_list_tables_empty() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    let tables = client.list_tables(None).await.unwrap();
    assert!(tables.is_empty());
}

#[tokio::test]
async fn test_sqlite_create_table_and_list() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
        None,
    ).await.unwrap();

    let tables = client.list_tables(None).await.unwrap();
    assert_eq!(tables.len(), 1);
    assert_eq!(tables[0].name, "users");
}

#[tokio::test]
async fn test_sqlite_list_columns() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query(
        "CREATE TABLE test_cols (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'anon', age INTEGER)",
        None,
    ).await.unwrap();

    let columns = client.list_columns("test_cols", None).await.unwrap();
    assert_eq!(columns.len(), 3);

    let id_col = columns.iter().find(|c| c.name == "id").unwrap();
    assert!(id_col.is_primary_key);

    let name_col = columns.iter().find(|c| c.name == "name").unwrap();
    assert!(!name_col.nullable);
    assert_eq!(name_col.default_value, Some("'anon'".to_string()));
}

#[tokio::test]
async fn test_sqlite_select_query() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query("CREATE TABLE t (id INTEGER, val TEXT)", None).await.unwrap();
    client.execute_query("INSERT INTO t VALUES (1, 'hello'), (2, 'world')", None).await.unwrap();

    let result = client.execute_query("SELECT * FROM t", None).await.unwrap();
    let obj = result.as_object().unwrap();
    let rows = obj.get("rows").unwrap().as_array().unwrap();
    assert_eq!(rows.len(), 2);
}

#[tokio::test]
async fn test_sqlite_insert_and_affected_rows() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query("CREATE TABLE t (id INTEGER, val TEXT)", None).await.unwrap();

    let result = client.execute_query("INSERT INTO t VALUES (1, 'x')", None).await.unwrap();
    let affected = result.as_object().unwrap().get("affectedRows").unwrap();
    assert_eq!(affected.as_i64().unwrap(), 1);
}

#[tokio::test]
async fn test_sqlite_update() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query("CREATE TABLE t (id INTEGER, val TEXT)", None).await.unwrap();
    client.execute_query("INSERT INTO t VALUES (1, 'old')", None).await.unwrap();

    let result = client.execute_query("UPDATE t SET val = 'new' WHERE id = 1", None).await.unwrap();
    let affected = result.as_object().unwrap().get("affectedRows").unwrap();
    assert_eq!(affected.as_i64().unwrap(), 1);

    let rows = client.execute_query("SELECT val FROM t", None).await.unwrap();
    let arr = rows.as_object().unwrap().get("rows").unwrap().as_array().unwrap();
    assert_eq!(arr[0].as_object().unwrap().get("val").unwrap().as_str().unwrap(), "new");
}

#[tokio::test]
async fn test_sqlite_delete() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query("CREATE TABLE t (id INTEGER)", None).await.unwrap();
    client.execute_query("INSERT INTO t VALUES (1), (2)", None).await.unwrap();

    let result = client.execute_query("DELETE FROM t WHERE id = 1", None).await.unwrap();
    assert_eq!(result.as_object().unwrap().get("affectedRows").unwrap().as_i64().unwrap(), 1);
}

#[tokio::test]
async fn test_sqlite_limit() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query("CREATE TABLE t (id INTEGER)", None).await.unwrap();
    for i in 0..100 {
        client.execute_query(&format!("INSERT INTO t VALUES ({})", i), None).await.unwrap();
    }

    let result = client.execute_query("SELECT * FROM t", Some(10)).await.unwrap();
    let rows = result.as_object().unwrap().get("rows").unwrap().as_array().unwrap();
    assert_eq!(rows.len(), 10);
}

#[tokio::test]
async fn test_sqlite_null_values() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query("CREATE TABLE t (id INTEGER, val TEXT)", None).await.unwrap();
    client.execute_query("INSERT INTO t VALUES (1, NULL)", None).await.unwrap();

    let result = client.execute_query("SELECT * FROM t", None).await.unwrap();
    let row = &result.as_object().unwrap().get("rows").unwrap().as_array().unwrap()[0];
    assert!(row.as_object().unwrap().get("val").unwrap().is_null());
}

#[tokio::test]
async fn test_sqlite_real_values() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    client.execute_query("CREATE TABLE t (id INTEGER, val REAL)", None).await.unwrap();
    client.execute_query("INSERT INTO t VALUES (1, 3.14)", None).await.unwrap();

    let result = client.execute_query("SELECT * FROM t", None).await.unwrap();
    let row = &result.as_object().unwrap().get("rows").unwrap().as_array().unwrap()[0];
    let val = row.as_object().unwrap().get("val").unwrap().as_f64().unwrap();
    assert!((val - 3.14).abs() < 0.001);
}

#[tokio::test]
async fn test_sqlite_version() {
    let client = SqliteClient::new();
    client.connect(&sqlite_config()).await.unwrap();

    let version = client.version().await.unwrap();
    assert!(version.starts_with("SQLite "));
}

#[tokio::test]
async fn test_sqlite_operations_without_connect() {
    let client = SqliteClient::new();

    let result = client.list_tables(None).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_sqlite_reconnect() {
    let client = SqliteClient::new();

    client.connect(&sqlite_config()).await.unwrap();
    client.disconnect().await.unwrap();

    // 重连到新的 :memory:
    client.connect(&sqlite_config()).await.unwrap();
    let tables = client.list_tables(None).await.unwrap();
    assert!(tables.is_empty()); // 新的内存数据库为空
}
