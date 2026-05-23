//! Redis 连接配置模型 Serde 测试
use std::collections::HashMap;
use ran_rs_desktop_lib::modules::redis_desktop::connection::models::*;

#[test]
fn connection_config_full_roundtrip() {
    let config = ConnectionConfig {
        id: "test-id".to_string(),
        name: "Test Redis".to_string(),
        host: "127.0.0.1".to_string(),
        port: 6379,
        username: Some("admin".to_string()),
        password: Some("secret".to_string()),
        db: 2,
        connection_timeout: 10,
        command_timeout: 30,
        ssh_tunnel: Some(SshTunnelConfig {
            host: "ssh.example.com".to_string(),
            port: 22,
            username: "user".to_string(),
            password: Some("sshpass".to_string()),
            private_key_path: None,
            passphrase: None,
            timeout: 5,
        }),
        sentinel: None,
        cluster: true,
        nat_map: None,
        tls: None,
        color: Some("#ff0000".to_string()),
        separator: ":".to_string(),
        remark: Some("test remark".to_string()),
        readonly: true,
        sort_order: Some(3),
    };
    let json = serde_json::to_string(&config).unwrap();
    let back: ConnectionConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.id, "test-id");
    assert_eq!(back.name, "Test Redis");
    assert_eq!(back.host, "127.0.0.1");
    assert_eq!(back.port, 6379);
    assert_eq!(back.username.as_deref(), Some("admin"));
    assert_eq!(back.cluster, true);
    assert!(back.ssh_tunnel.is_some());
    assert_eq!(back.sort_order, Some(3));
}

#[test]
fn connection_config_minimal() {
    let json = r#"{"name":"Minimal","host":"localhost"}"#;
    let config: ConnectionConfig = serde_json::from_str(json).unwrap();
    assert_eq!(config.name, "Minimal");
    assert_eq!(config.host, "localhost");
    assert!(!config.id.is_empty()); // default UUID
    assert_eq!(config.port, 6379); // default
    assert_eq!(config.db, 0); // default
    assert_eq!(config.connection_timeout, 5); // default
    assert_eq!(config.separator, ":"); // default
}

#[test]
fn connection_config_skip_none() {
    let config = ConnectionConfig {
        id: "id".to_string(),
        name: "N".to_string(),
        host: "h".to_string(),
        port: 6379,
        username: None,
        password: None,
        db: 0,
        connection_timeout: 5,
        command_timeout: 5,
        ssh_tunnel: None,
        sentinel: None,
        cluster: false,
        nat_map: None,
        tls: None,
        color: None,
        separator: ":".to_string(),
        remark: None,
        readonly: false,
        sort_order: None,
    };
    let json = serde_json::to_string(&config).unwrap();
    assert!(!json.contains("\"username\""));
    assert!(!json.contains("\"password\""));
    assert!(!json.contains("\"sshTunnel\""));
    assert!(!json.contains("\"sentinel\""));
    assert!(!json.contains("\"tls\""));
}

#[test]
fn ssh_tunnel_config_serde() {
    let cfg = SshTunnelConfig {
        host: "ssh.host".to_string(),
        port: 2222,
        username: "u".to_string(),
        password: Some("p".to_string()),
        private_key_path: None,
        passphrase: None,
        timeout: 10,
    };
    let json = serde_json::to_string(&cfg).unwrap();
    let back: SshTunnelConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.host, "ssh.host");
    assert_eq!(back.port, 2222);
}

#[test]
fn sentinel_config_serde() {
    let cfg = SentinelConfig {
        nodes: vec!["10.0.0.1:26379".to_string(), "10.0.0.2:26379".to_string()],
        master_name: "mymaster".to_string(),
        password: Some("pass".to_string()),
        username: None,
        node_password: None,
    };
    let json = serde_json::to_string(&cfg).unwrap();
    assert!(json.contains("\"nodes\""));
    // SentinelConfig has no rename_all — fields serialize as snake_case
    assert!(json.contains("\"master_name\""));
    let back: SentinelConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.nodes.len(), 2);
}

#[test]
fn tls_config_serde() {
    let cfg = TlsConfig {
        verify_cert: false,
        ca_cert_path: Some("/path/ca.crt".to_string()),
        cert_path: None,
        key_path: None,
        sni: Some("redis.example.com".to_string()),
    };
    let json = serde_json::to_string(&cfg).unwrap();
    let back: TlsConfig = serde_json::from_str(&json).unwrap();
    assert!(!back.verify_cert);
    assert_eq!(back.ca_cert_path.as_deref(), Some("/path/ca.crt"));
    assert_eq!(back.sni.as_deref(), Some("redis.example.com"));
}

#[test]
fn nat_map_entry_serde() {
    let mut map = HashMap::new();
    map.insert("10.0.0.1:6379".to_string(), NatMapEntry { host: "external.host".to_string(), port: 16379 });
    let json = serde_json::to_string(&map).unwrap();
    let back: HashMap<String, NatMapEntry> = serde_json::from_str(&json).unwrap();
    assert_eq!(back.len(), 1);
    assert_eq!(back.get("10.0.0.1:6379").unwrap().host, "external.host");
}

#[test]
fn connection_info_from_config() {
    let config = ConnectionConfig {
        id: "id1".to_string(),
        name: "MyRedis".to_string(),
        host: "10.0.0.1".to_string(),
        port: 6380,
        username: None,
        password: None,
        db: 3,
        connection_timeout: 5,
        command_timeout: 5,
        ssh_tunnel: Some(SshTunnelConfig {
            host: "ssh".to_string(), port: 22, username: "u".to_string(),
            password: None, private_key_path: None, passphrase: None, timeout: 5,
        }),
        sentinel: None,
        cluster: true,
        nat_map: None,
        tls: Some(TlsConfig {
            verify_cert: true, ca_cert_path: None, cert_path: None, key_path: None, sni: None,
        }),
        color: None,
        separator: ":".to_string(),
        remark: None,
        readonly: false,
        sort_order: None,
    };
    let info = ConnectionInfo::from(&config);
    assert_eq!(info.id, "id1");
    assert_eq!(info.status, "disconnected");
    assert!(info.cluster);
    assert!(info.has_ssh_tunnel);
    assert!(info.has_tls);
    assert!(!info.has_sentinel);
}

#[test]
fn connection_string_with_auth() {
    let config = ConnectionConfig {
        id: "id".to_string(), name: "n".to_string(), host: "10.0.0.1".to_string(), port: 6379,
        username: Some("admin".to_string()), password: Some("secret".to_string()), db: 0,
        connection_timeout: 5, command_timeout: 5, ssh_tunnel: None, sentinel: None,
        cluster: false, nat_map: None, tls: None, color: None, separator: ":".to_string(),
        remark: None, readonly: false, sort_order: None,
    };
    assert_eq!(config.connection_string(), "redis://admin:secret@10.0.0.1:6379/0");
}

#[test]
fn connection_string_password_only() {
    let config = ConnectionConfig {
        id: "id".to_string(), name: "n".to_string(), host: "h".to_string(), port: 6379,
        username: None, password: Some("pwd".to_string()), db: 1,
        connection_timeout: 5, command_timeout: 5, ssh_tunnel: None, sentinel: None,
        cluster: false, nat_map: None, tls: None, color: None, separator: ":".to_string(),
        remark: None, readonly: false, sort_order: None,
    };
    assert_eq!(config.connection_string(), "redis://:pwd@h:6379/1");
}

#[test]
fn connection_string_no_auth() {
    let config = ConnectionConfig {
        id: "id".to_string(), name: "n".to_string(), host: "h".to_string(), port: 6379,
        username: None, password: None, db: 0,
        connection_timeout: 5, command_timeout: 5, ssh_tunnel: None, sentinel: None,
        cluster: false, nat_map: None, tls: None, color: None, separator: ":".to_string(),
        remark: None, readonly: false, sort_order: None,
    };
    assert_eq!(config.connection_string(), "redis://h:6379/0");
}

#[test]
fn connection_string_safe() {
    let config = ConnectionConfig {
        id: "id".to_string(), name: "n".to_string(), host: "h".to_string(), port: 6379,
        username: Some("admin".to_string()), password: Some("secret".to_string()), db: 0,
        connection_timeout: 5, command_timeout: 5, ssh_tunnel: None, sentinel: None,
        cluster: false, nat_map: None, tls: None, color: None, separator: ":".to_string(),
        remark: None, readonly: false, sort_order: None,
    };
    let safe = config.connection_string_safe();
    assert!(safe.contains("***"));
    assert!(!safe.contains("secret"));
}

#[test]
fn display_host_cluster() {
    let config = ConnectionConfig {
        id: "id".to_string(), name: "n".to_string(), host: "h".to_string(), port: 6379,
        username: None, password: None, db: 0,
        connection_timeout: 5, command_timeout: 5, ssh_tunnel: None, sentinel: None,
        cluster: true, nat_map: None, tls: None, color: None, separator: ":".to_string(),
        remark: None, readonly: false, sort_order: None,
    };
    assert_eq!(config.display_host(), "h:6379 [Cluster]");
}

#[test]
fn display_host_sentinel() {
    let config = ConnectionConfig {
        id: "id".to_string(), name: "MySentinel".to_string(), host: "h".to_string(), port: 26379,
        username: None, password: None, db: 0,
        connection_timeout: 5, command_timeout: 5, ssh_tunnel: None,
        sentinel: Some(SentinelConfig {
            nodes: vec!["h:26379".to_string()], master_name: "m".to_string(),
            password: None, username: None, node_password: None,
        }),
        cluster: false, nat_map: None, tls: None, color: None, separator: ":".to_string(),
        remark: None, readonly: false, sort_order: None,
    };
    assert_eq!(config.display_host(), "MySentinel [Sentinel]");
}

#[test]
fn display_host_standalone() {
    let config = ConnectionConfig {
        id: "id".to_string(), name: "n".to_string(), host: "127.0.0.1".to_string(), port: 6379,
        username: None, password: None, db: 0,
        connection_timeout: 5, command_timeout: 5, ssh_tunnel: None, sentinel: None,
        cluster: false, nat_map: None, tls: None, color: None, separator: ":".to_string(),
        remark: None, readonly: false, sort_order: None,
    };
    assert_eq!(config.display_host(), "127.0.0.1:6379");
}
