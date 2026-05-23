// connection_models_serde_tests.rs — IPC 序列化往返测试（Tier 1）

use ran_rs_desktop_lib::modules::sql_studio::connection::models::*;
use ran_rs_desktop_lib::modules::sql_studio::plugin::models::*;

// ========== DatabaseType serde ==========

#[test]
fn serde_database_type_postgresql() {
    let json = serde_json::to_string(&DatabaseType::Postgresql).unwrap();
    assert_eq!(json, "\"postgresql\"");
    let back: DatabaseType = serde_json::from_str(&json).unwrap();
    assert_eq!(back, DatabaseType::Postgresql);
}

#[test]
fn serde_database_type_mysql() {
    let json = serde_json::to_string(&DatabaseType::Mysql).unwrap();
    assert_eq!(json, "\"mysql\"");
    let back: DatabaseType = serde_json::from_str(&json).unwrap();
    assert_eq!(back, DatabaseType::Mysql);
}

#[test]
fn serde_database_type_mariadb() {
    let json = serde_json::to_string(&DatabaseType::Mariadb).unwrap();
    assert_eq!(json, "\"mariadb\"");
}

#[test]
fn serde_database_type_tidb() {
    let json = serde_json::to_string(&DatabaseType::Tidb).unwrap();
    assert_eq!(json, "\"tidb\"");
}

#[test]
fn serde_database_type_sqlite() {
    let json = serde_json::to_string(&DatabaseType::Sqlite).unwrap();
    assert_eq!(json, "\"sqlite\"");
}

// ========== SSL camelCase ==========

#[test]
fn serde_ssl_config_camel_case() {
    let ssl = SslConfig {
        enabled: true,
        ca_file: Some("/ca.pem".to_string()),
        cert_file: None,
        key_file: None,
        reject_unauthorized: true,
    };
    let json = serde_json::to_string(&ssl).unwrap();
    assert!(json.contains("\"caFile\""));
    assert!(json.contains("\"rejectUnauthorized\""));
    assert!(!json.contains("\"ca_file\""));

    let back: SslConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.ca_file, Some("/ca.pem".to_string()));
}

// ========== SSH camelCase ==========

#[test]
fn serde_ssh_config_camel_case() {
    let ssh = SshTunnelConfig {
        enabled: true,
        host: "bastion".to_string(),
        port: 22,
        user: "admin".to_string(),
        password: Some("pass".to_string()),
        private_key: None,
        passphrase: None,
        bastion_host: Some("jump".to_string()),
        bastion_port: Some(2222),
    };
    let json = serde_json::to_string(&ssh).unwrap();
    assert!(json.contains("\"privateKey\":null"));
    assert!(json.contains("\"bastionHost\":"));
    assert!(json.contains("\"bastionPort\":"));

    let back: SshTunnelConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.bastion_host, Some("jump".to_string()));
}

// ========== ConnectionConfig roundtrip ==========

#[test]
fn serde_connection_config_full_roundtrip() {
    let config = ConnectionConfig {
        id: "test-conn".to_string(),
        name: "Test".to_string(),
        db_type: DatabaseType::Postgresql,
        host: Some("localhost".to_string()),
        port: Some(5432),
        user: Some("root".to_string()),
        password: Some("secret".to_string()),
        database: Some("testdb".to_string()),
        url: None,
        ssl: SslConfig::default(),
        ssh: SshTunnelConfig::default(),
        options: Some(serde_json::json!({"timeout": 30})),
    };

    let json = serde_json::to_string(&config).unwrap();
    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();

    assert_eq!(back.id, config.id);
    assert_eq!(back.db_type, config.db_type);
    assert_eq!(back.host, config.host);
    assert_eq!(back.port, config.port);
    assert_eq!(back.password, config.password);
}

#[test]
fn serde_connection_config_minimal() {
    let minimal = serde_json::json!({
        "id": "min",
        "name": "Min",
        "dbType": "sqlite",
        "ssl": {"enabled": false, "rejectUnauthorized": false},
        "ssh": {"enabled": false, "host": "", "port": 22, "user": ""}
    });

    let config: ConnectionConfig = serde_json::from_value(minimal.clone()).unwrap();
    assert_eq!(config.id, "min");
    assert_eq!(config.db_type, DatabaseType::Sqlite);
    assert!(config.host.is_none());

    // Round-trip
    let json = serde_json::to_string(&config).unwrap();
    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.id, "min");
}

// ========== ConnectionInfo camelCase ==========

#[test]
fn serde_connection_info_camel_case() {
    let info = ConnectionInfo {
        id: "conn-1".to_string(),
        name: "My PG".to_string(),
        db_type: DatabaseType::Postgresql,
        status: "connected".to_string(),
        host: Some("localhost".to_string()),
        port: Some(5432),
        database: Some("testdb".to_string()),
    };
    let json = serde_json::to_string(&info).unwrap();
    assert!(json.contains("\"dbType\":"));
    assert!(!json.contains("\"db_type\":"));

    let back: ConnectionInfo = serde_json::from_str(&json).unwrap();
    assert_eq!(back.id, "conn-1");
}

// ========== PluginManifest 全字段 ==========

#[test]
fn serde_plugin_manifest_full() {
    let manifest = PluginManifest {
        id: "com.test.plugin".to_string(),
        name: "Test Plugin".to_string(),
        version: "1.2.3".to_string(),
        description: "A test plugin".to_string(),
        author: Some(PluginAuthor::Structured {
            name: "Author".to_string(),
            url: "https://example.com".to_string(),
        }),
        min_app_version: Some("0.1.0".to_string()),
        icon: Some("extension".to_string()),
        manifest_version: 1,
        plugin_entry_dir: Some("dist".to_string()),
        capabilities: PluginCapabilities {
            views: vec![PluginView {
                id: "main".to_string(),
                name: "Main View".to_string(),
                view_type: "shell-tab".to_string(),
                entry: "index.html".to_string(),
            }],
            menu: vec![],
        },
    };

    let json = serde_json::to_string(&manifest).unwrap();
    let back: PluginManifest = serde_json::from_str(&json).unwrap();

    assert_eq!(back.id, "com.test.plugin");
    assert_eq!(back.version, "1.2.3");
    assert!(json.contains("\"manifestVersion\":1"));
    assert!(json.contains("\"pluginEntryDir\":"));
}

// ========== PluginApiResponse skip_serializing_none ==========

#[test]
fn serde_plugin_api_response_skip_none() {
    let response = PluginApiResponse {
        id: "req-1".to_string(),
        name: "getTables".to_string(),
        result: Some(serde_json::json!([{"name": "users"}])),
        error: None,
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(!json.contains("\"error\":"));
    assert!(json.contains("\"result\":"));

    let err_response = PluginApiResponse {
        id: "req-2".to_string(),
        name: "runQuery".to_string(),
        result: None,
        error: Some("SQL 错误".to_string()),
    };

    let json2 = serde_json::to_string(&err_response).unwrap();
    assert!(!json2.contains("\"result\":"));
    assert!(json2.contains("\"error\":"));
}

// ========== PluginAuthor untagged ==========

#[test]
fn serde_plugin_author_string() {
    let json = serde_json::json!("John Doe");
    let author: PluginAuthor = serde_json::from_value(json).unwrap();
    match author {
        PluginAuthor::Simple(s) => assert_eq!(s, "John Doe"),
        _ => panic!("Expected Simple variant"),
    }
}

#[test]
fn serde_plugin_author_structured() {
    let json = serde_json::json!({"name": "Jane", "url": "https://jane.dev"});
    let author: PluginAuthor = serde_json::from_value(json).unwrap();
    match author {
        PluginAuthor::Structured { name, url } => {
            assert_eq!(name, "Jane");
            assert_eq!(url, "https://jane.dev");
        }
        _ => panic!("Expected Structured variant"),
    }
}
