// storage_service_tests.rs — 存储层 CRUD 测试（Tier 1）

use ran_rs_desktop_lib::modules::sql_studio::storage::service::StorageService;
use ran_rs_desktop_lib::modules::sql_studio::storage::models::QueryHistory;
use ran_rs_desktop_lib::modules::sql_studio::connection::models::{
    ConnectionConfig, DatabaseType, SslConfig, SshTunnelConfig,
};

fn create_service(temp: &std::path::Path) -> StorageService {
    StorageService::new(temp.join("data")).unwrap()
}

fn make_config(id: &str, name: &str, db_type: DatabaseType) -> ConnectionConfig {
    ConnectionConfig {
        id: id.to_string(),
        name: name.to_string(),
        db_type,
        host: Some("localhost".to_string()),
        port: Some(5432),
        user: Some("root".to_string()),
        password: Some("secret".to_string()),
        database: Some("testdb".to_string()),
        url: None,
        ssl: SslConfig::default(),
        ssh: SshTunnelConfig::default(),
        options: None,
    }
}

#[test]
fn test_save_and_list_connection_configs() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    let config = make_config("conn-1", "My PG", DatabaseType::Postgresql);
    service.save_connection_config(&config).unwrap();

    let configs = service.list_connection_configs().unwrap();
    assert_eq!(configs.len(), 1);
    assert_eq!(configs[0].id, "conn-1");
    assert_eq!(configs[0].name, "My PG");
}

#[test]
fn test_delete_connection_config() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    let config = make_config("conn-1", "My PG", DatabaseType::Postgresql);
    service.save_connection_config(&config).unwrap();
    service.delete_connection_config("conn-1").unwrap();

    let configs = service.list_connection_configs().unwrap();
    assert!(configs.is_empty());
}

#[test]
fn test_update_connection_config() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    let mut config = make_config("conn-1", "Original", DatabaseType::Postgresql);
    service.save_connection_config(&config).unwrap();

    config.name = "Updated".to_string();
    service.save_connection_config(&config).unwrap();

    let configs = service.list_connection_configs().unwrap();
    assert_eq!(configs.len(), 1);
    assert_eq!(configs[0].name, "Updated");
}

#[test]
fn test_connection_config_json_roundtrip() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    let config = ConnectionConfig {
        id: "conn-rt".to_string(),
        name: "Round Trip".to_string(),
        db_type: DatabaseType::Mysql,
        host: Some("192.168.1.1".to_string()),
        port: Some(3306),
        user: Some("admin".to_string()),
        password: Some("p@ss!w0rd".to_string()),
        database: Some("my_db".to_string()),
        url: Some("mysql://custom".to_string()),
        ssl: SslConfig {
            enabled: true,
            ca_file: Some("/path/to/ca.pem".to_string()),
            cert_file: None,
            key_file: None,
            reject_unauthorized: true,
        },
        ssh: SshTunnelConfig {
            enabled: true,
            host: "bastion".to_string(),
            port: 22,
            user: "ssh_user".to_string(),
            password: None,
            private_key: Some("key-data".to_string()),
            passphrase: None,
            bastion_host: None,
            bastion_port: None,
        },
        options: Some(serde_json::json!({"charset": "utf8mb4"})),
    };

    service.save_connection_config(&config).unwrap();

    let loaded = service.list_connection_configs().unwrap();
    assert_eq!(loaded.len(), 1);
    let restored = &loaded[0];

    assert_eq!(restored.id, config.id);
    assert_eq!(restored.db_type, config.db_type);
    assert_eq!(restored.host, config.host);
    assert_eq!(restored.port, config.port);
    assert_eq!(restored.database, config.database);
    assert_eq!(restored.ssl.enabled, true);
    assert_eq!(restored.ssh.enabled, true);
}

#[test]
fn test_save_and_list_query_history() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    let history = QueryHistory {
        id: "hist-1".to_string(),
        connection_id: "conn-1".to_string(),
        database: Some("testdb".to_string()),
        sql: "SELECT * FROM users".to_string(),
        executed_at: "2024-01-01T00:00:00Z".to_string(),
        execution_time_ms: Some(42),
        row_count: Some(10),
    };

    service.save_query_history(&history).unwrap();

    let loaded = service.list_query_history("conn-1", 100).unwrap();
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].sql, "SELECT * FROM users");
    assert_eq!(loaded[0].execution_time_ms, Some(42));
}

#[test]
fn test_query_history_limit() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    for i in 0..10 {
        let history = QueryHistory {
            id: format!("hist-{}", i),
            connection_id: "conn-1".to_string(),
            database: None,
            sql: format!("SELECT {}", i),
            executed_at: format!("2024-01-{:02}T00:00:00Z", i + 1),
            execution_time_ms: None,
            row_count: None,
        };
        service.save_query_history(&history).unwrap();
    }

    let loaded = service.list_query_history("conn-1", 5).unwrap();
    assert_eq!(loaded.len(), 5);
}

#[test]
fn test_cleanup_query_history() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    for i in 0..20 {
        let history = QueryHistory {
            id: format!("hist-{}", i),
            connection_id: "conn-1".to_string(),
            database: None,
            sql: format!("SELECT {}", i),
            executed_at: format!("2024-01-{:02}T00:00:00Z", i + 1),
            execution_time_ms: None,
            row_count: None,
        };
        service.save_query_history(&history).unwrap();
    }

    let deleted = service.cleanup_query_history(10).unwrap();
    assert_eq!(deleted, 10);

    let remaining = service.list_query_history("conn-1", 100).unwrap();
    assert_eq!(remaining.len(), 10);
}

#[test]
fn test_query_history_per_connection_isolation() {
    let temp = tempfile::tempdir().unwrap();
    let service = create_service(temp.path());

    for i in 0..3 {
        let h = QueryHistory {
            id: format!("hist-a-{}", i),
            connection_id: "conn-a".to_string(),
            database: None,
            sql: format!("SELECT a{}", i),
            executed_at: format!("2024-01-{:02}T00:00:00Z", i + 1),
            execution_time_ms: None,
            row_count: None,
        };
        service.save_query_history(&h).unwrap();
    }

    let loaded = service.list_query_history("conn-b", 100).unwrap();
    assert!(loaded.is_empty());
}
