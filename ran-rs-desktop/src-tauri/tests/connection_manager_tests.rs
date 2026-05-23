// connection_manager_tests.rs — 连接管理器配置测试（Tier 3）
// 注意: 本机 Windows 缺少 MSVC 版 OpenSSL DLL，无法运行 SqlConnectionManager
// 此文件测试 ConnectionConfig/ConnectionInfo 的业务逻辑和模型层

use ran_rs_desktop_lib::modules::sql_studio::connection::models::*;
use ran_rs_desktop_lib::modules::sql_studio::storage::service::StorageService;

fn sqlite_config(id: &str) -> ConnectionConfig {
    ConnectionConfig {
        id: id.to_string(),
        name: format!("Test {}", id),
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

#[test]
fn test_config_create_with_defaults() {
    let config = sqlite_config("c1");
    assert_eq!(config.id, "c1");
    assert_eq!(config.db_type, DatabaseType::Sqlite);
    assert!(config.host.is_none());
    assert!(!config.ssl.enabled);
    assert!(!config.ssh.enabled);
}

#[test]
fn test_save_and_reload_configs() {
    let temp = tempfile::tempdir().unwrap();
    let service = StorageService::new(temp.path().join("data")).unwrap();

    let configs = vec![
        sqlite_config("c1"),
        sqlite_config("c2"),
        sqlite_config("c3"),
    ];
    for c in &configs {
        service.save_connection_config(c).unwrap();
    }

    let loaded = service.list_connection_configs().unwrap();
    assert_eq!(loaded.len(), 3);
}

#[test]
fn test_delete_config() {
    let temp = tempfile::tempdir().unwrap();
    let service = StorageService::new(temp.path().join("data")).unwrap();

    service.save_connection_config(&sqlite_config("c1")).unwrap();
    service.save_connection_config(&sqlite_config("c2")).unwrap();
    service.delete_connection_config("c1").unwrap();

    let loaded = service.list_connection_configs().unwrap();
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, "c2");
}

#[test]
fn test_overwrite_config() {
    let temp = tempfile::tempdir().unwrap();
    let service = StorageService::new(temp.path().join("data")).unwrap();

    let mut config = sqlite_config("c1");
    config.name = "Original".to_string();
    service.save_connection_config(&config).unwrap();

    config.name = "Updated".to_string();
    service.save_connection_config(&config).unwrap();

    let loaded = service.list_connection_configs().unwrap();
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].name, "Updated");
}

#[test]
fn test_connection_info_status_values() {
    let statuses = vec!["connected", "disconnected"];
    for status in statuses {
        let info = ConnectionInfo {
            id: "c1".to_string(),
            name: "Test".to_string(),
            db_type: DatabaseType::Postgresql,
            status: status.to_string(),
            host: None,
            port: None,
            database: None,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains(&format!("\"status\":\"{}\"", status)));
    }
}

#[test]
fn test_default_ssl_config() {
    let ssl = SslConfig::default();
    assert!(!ssl.enabled);
    assert!(ssl.ca_file.is_none());
    assert!(ssl.cert_file.is_none());
    assert!(ssl.key_file.is_none());
    assert!(!ssl.reject_unauthorized);
}

#[test]
fn test_default_ssh_config() {
    let ssh = SshTunnelConfig::default();
    assert!(!ssh.enabled);
    assert_eq!(ssh.port, 22);
    assert!(ssh.password.is_none());
    assert!(ssh.private_key.is_none());
}

#[test]
fn test_multiple_db_types_in_storage() {
    let temp = tempfile::tempdir().unwrap();
    let service = StorageService::new(temp.path().join("data")).unwrap();

    let configs = vec![
        ConnectionConfig {
            id: "pg".to_string(), name: "PG".to_string(), db_type: DatabaseType::Postgresql,
            host: Some("localhost".to_string()), port: Some(5432), user: Some("root".to_string()),
            password: None, database: Some("test".to_string()), url: None,
            ssl: SslConfig::default(), ssh: SshTunnelConfig::default(), options: None,
        },
        ConnectionConfig {
            id: "mysql".to_string(), name: "MySQL".to_string(), db_type: DatabaseType::Mysql,
            host: Some("localhost".to_string()), port: Some(3306), user: Some("root".to_string()),
            password: None, database: Some("test".to_string()), url: None,
            ssl: SslConfig::default(), ssh: SshTunnelConfig::default(), options: None,
        },
        ConnectionConfig {
            id: "sqlite".to_string(), name: "SQLite".to_string(), db_type: DatabaseType::Sqlite,
            host: None, port: None, user: None,
            password: None, database: Some(":memory:".to_string()), url: None,
            ssl: SslConfig::default(), ssh: SshTunnelConfig::default(), options: None,
        },
    ];

    for c in &configs {
        service.save_connection_config(c).unwrap();
    }

    let loaded = service.list_connection_configs().unwrap();
    assert_eq!(loaded.len(), 3);

    let types: Vec<DatabaseType> = loaded.iter().map(|c| c.db_type.clone()).collect();
    assert!(types.contains(&DatabaseType::Postgresql));
    assert!(types.contains(&DatabaseType::Mysql));
    assert!(types.contains(&DatabaseType::Sqlite));
}
