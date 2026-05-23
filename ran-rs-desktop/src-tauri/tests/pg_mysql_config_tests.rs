// pg_mysql_config_tests.rs — PG/MySQL 配置 serde 往返测试（Tier 3）

use ran_rs_desktop_lib::modules::sql_studio::connection::models::*;

#[test]
fn test_postgresql_config_roundtrip() {
    let config = ConnectionConfig {
        id: "pg-1".to_string(),
        name: "Production PG".to_string(),
        db_type: DatabaseType::Postgresql,
        host: Some("db.example.com".to_string()),
        port: Some(5432),
        user: Some("admin".to_string()),
        password: Some("secret".to_string()),
        database: Some("mydb".to_string()),
        url: None,
        ssl: SslConfig {
            enabled: true,
            ca_file: Some("/certs/ca.pem".to_string()),
            cert_file: Some("/certs/client-cert.pem".to_string()),
            key_file: Some("/certs/client-key.pem".to_string()),
            reject_unauthorized: true,
        },
        ssh: SshTunnelConfig::default(),
        options: None,
    };

    let json = serde_json::to_string(&config).unwrap();
    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();

    assert_eq!(back.id, "pg-1");
    assert_eq!(back.db_type, DatabaseType::Postgresql);
    assert_eq!(back.host, Some("db.example.com".to_string()));
    assert!(back.ssl.enabled);
    assert_eq!(back.ssl.ca_file, Some("/certs/ca.pem".to_string()));
}

#[test]
fn test_mysql_config_roundtrip() {
    let config = ConnectionConfig {
        id: "mysql-1".to_string(),
        name: "MySQL Dev".to_string(),
        db_type: DatabaseType::Mysql,
        host: Some("localhost".to_string()),
        port: Some(3306),
        user: Some("root".to_string()),
        password: None,
        database: Some("test".to_string()),
        url: None,
        ssl: SslConfig::default(),
        ssh: SshTunnelConfig::default(),
        options: Some(serde_json::json!({"charset": "utf8mb4"})),
    };

    let json = serde_json::to_string(&config).unwrap();
    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();

    assert_eq!(back.db_type, DatabaseType::Mysql);
    assert_eq!(back.options.unwrap()["charset"], "utf8mb4");
}

#[test]
fn test_mariadb_config_roundtrip() {
    let config = ConnectionConfig {
        id: "maria-1".to_string(),
        name: "Maria".to_string(),
        db_type: DatabaseType::Mariadb,
        host: Some("mariadb.local".to_string()),
        port: Some(3306),
        user: Some("dba".to_string()),
        password: Some("pass".to_string()),
        database: None,
        url: None,
        ssl: SslConfig::default(),
        ssh: SshTunnelConfig::default(),
        options: None,
    };

    let json = serde_json::to_string(&config).unwrap();
    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.db_type, DatabaseType::Mariadb);
}

#[test]
fn test_tidb_config_roundtrip() {
    let config = ConnectionConfig {
        id: "tidb-1".to_string(),
        name: "TiDB".to_string(),
        db_type: DatabaseType::Tidb,
        host: Some("tidb.cluster".to_string()),
        port: Some(4000),
        user: Some("root".to_string()),
        password: None,
        database: Some("app".to_string()),
        url: None,
        ssl: SslConfig::default(),
        ssh: SshTunnelConfig::default(),
        options: None,
    };

    let json = serde_json::to_string(&config).unwrap();
    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.db_type, DatabaseType::Tidb);
    assert_eq!(back.port, Some(4000));
}

#[test]
fn test_ssl_config_preserved() {
    let ssl = SslConfig {
        enabled: true,
        ca_file: Some("/ca.pem".to_string()),
        cert_file: Some("/cert.pem".to_string()),
        key_file: Some("/key.pem".to_string()),
        reject_unauthorized: false,
    };

    let json = serde_json::to_string(&ssl).unwrap();
    let back: SslConfig = serde_json::from_str(&json).unwrap();

    assert!(back.enabled);
    assert_eq!(back.ca_file, Some("/ca.pem".to_string()));
    assert!(!back.reject_unauthorized);
}

#[test]
fn test_sqlite_config_no_host_port() {
    let config = ConnectionConfig {
        id: "sqlite-1".to_string(),
        name: "Local DB".to_string(),
        db_type: DatabaseType::Sqlite,
        host: None,
        port: None,
        user: None,
        password: None,
        database: Some("/data/app.db".to_string()),
        url: None,
        ssl: SslConfig::default(),
        ssh: SshTunnelConfig::default(),
        options: None,
    };

    let json = serde_json::to_string(&config).unwrap();
    // serde serializes Option::None as null, not omitted
    assert!(json.contains("\"host\":null"));
    assert!(json.contains("\"port\":null"));
    assert!(json.contains("\"database\":"));

    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();
    assert!(back.host.is_none());
    assert!(back.port.is_none());
}
