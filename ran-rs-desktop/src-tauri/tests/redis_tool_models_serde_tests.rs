//! Redis 运维工具模型 Serde 测试
use std::collections::HashMap;
use ran_rs_desktop_lib::modules::redis_desktop::tool::models::*;

fn roundtrip<T: serde::Serialize + serde::de::DeserializeOwned>(val: &T) -> T {
    let json = serde_json::to_string(val).unwrap();
    serde_json::from_str(&json).unwrap()
}

#[test]
fn slow_log_entry_serde() {
    let e = SlowLogEntry {
        id: 1, timestamp: 1600000000, duration_us: 5000,
        command: vec!["SET".to_string(), "key".to_string(), "value".to_string()],
        client_address: "127.0.0.1:54321".to_string(), client_name: "client-1".to_string(),
    };
    let json = serde_json::to_string(&e).unwrap();
    assert!(json.contains("\"durationUs\""));
    assert!(json.contains("\"clientAddress\""));
    assert_eq!(roundtrip(&e).command.len(), 3);
}

#[test]
fn memory_analysis_entry_serde() {
    let e = MemoryAnalysisEntry {
        key: "bigkey".to_string(), key_type: "hash".to_string(),
        memory_usage: 1048576, encoding: "ziplist".to_string(), length: 10000,
    };
    let json = serde_json::to_string(&e).unwrap();
    assert!(json.contains("\"memoryUsage\""));
}

#[test]
fn memory_analysis_result_serde() {
    let r = MemoryAnalysisResult {
        total_keys: 1000, total_memory: 5242880,
        big_keys: vec![MemoryAnalysisEntry {
            key: "k".to_string(), key_type: "string".to_string(),
            memory_usage: 100, encoding: "embstr".to_string(), length: 1,
        }],
        duration_ms: 250,
    };
    assert_eq!(roundtrip(&r).big_keys.len(), 1);
}

#[test]
fn server_status_serde() {
    let s = ServerStatus {
        redis_version: "7.0.0".to_string(), mode: "standalone".to_string(),
        uptime_days: 30, connected_clients: 5,
        used_memory: 1048576, used_memory_peak: 2097152,
        total_keys: 500, expired_keys: 10,
        instantaneous_ops_per_sec: 100,
        total_net_input_bytes: 1024, total_net_output_bytes: 2048,
        keyspace_hits: 800, keyspace_misses: 200, hit_rate: 0.8,
    };
    let json = serde_json::to_string(&s).unwrap();
    assert!(json.contains("\"redisVersion\""));
    assert!(json.contains("\"hitRate\""));
    assert!((roundtrip(&s).hit_rate - 0.8).abs() < f64::EPSILON);
}

#[test]
fn database_info_serde() {
    let d = DatabaseInfo { db: 0, keys: 100, expires: 20, avg_ttl: 3600 };
    let json = serde_json::to_string(&d).unwrap();
    assert!(json.contains("\"avgTtl\""));
}

#[test]
fn server_info_nested_hashmap_serde() {
    let mut sections = HashMap::new();
    let mut server = HashMap::new();
    server.insert("redis_version".to_string(), "7.0.0".to_string());
    sections.insert("Server".to_string(), server);
    let info = ServerInfo { sections };
    let json = serde_json::to_string(&info).unwrap();
    assert!(json.contains("\"Server\""));
    assert!(json.contains("\"redis_version\""));
    let back = roundtrip(&info);
    assert_eq!(back.sections.get("Server").unwrap().get("redis_version").unwrap(), "7.0.0");
}

#[test]
fn command_log_entry_serde() {
    let e = CommandLogEntry {
        id: "log-1".to_string(), connection_id: "c1".to_string(),
        db: 0, command: "GET".to_string(), args: vec!["mykey".to_string()],
        duration_ms: 1.5, success: true, error: None, timestamp: 1600000000000,
    };
    let json = serde_json::to_string(&e).unwrap();
    assert!(json.contains("\"durationMs\""));
    assert!(roundtrip(&e).success);
    assert!(roundtrip(&e).error.is_none());
}

#[test]
fn command_log_entry_with_error_serde() {
    let e = CommandLogEntry {
        id: "log-2".to_string(), connection_id: "c1".to_string(),
        db: 0, command: "SET".to_string(), args: vec![],
        duration_ms: 0.1, success: false, error: Some("WRONGTYPE".to_string()), timestamp: 1600000000000,
    };
    assert_eq!(roundtrip(&e).error.as_deref(), Some("WRONGTYPE"));
}

#[test]
fn command_log_query_params_serde() {
    let p = CommandLogQueryParams {
        connection_id: "c1".to_string(), limit: Some(50),
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"connectionId\""));
    assert_eq!(roundtrip(&p).limit, Some(50));
}
