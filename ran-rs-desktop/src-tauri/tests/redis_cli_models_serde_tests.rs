//! Redis CLI 模型 Serde 测试
use ran_rs_desktop_lib::modules::redis_desktop::cli::models::*;

fn roundtrip<T: serde::Serialize + serde::de::DeserializeOwned>(val: &T) -> T {
    let json = serde_json::to_string(val).unwrap();
    serde_json::from_str(&json).unwrap()
}

#[test]
fn cli_exec_params_serde() {
    let p = CliExecParams {
        connection_id: "c1".to_string(), db: 2, command: "GET mykey".to_string(),
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"connectionId\""));
    assert_eq!(roundtrip(&p).db, 2);
}

#[test]
fn cli_exec_result_serde() {
    let r = CliExecResult {
        command: "GET mykey".to_string(), result: "\"hello\"".to_string(),
        result_type: "string".to_string(), duration_ms: 5,
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("\"resultType\""));
    assert!(json.contains("\"durationMs\""));
    assert_eq!(roundtrip(&r).duration_ms, 5);
}

#[test]
fn cli_history_entry_serde() {
    let e = CliHistoryEntry {
        command: "SET key value".to_string(),
        timestamp: 1600000000000,
        connection_id: "c1".to_string(),
    };
    let json = serde_json::to_string(&e).unwrap();
    assert!(json.contains("\"connectionId\""));
    assert_eq!(roundtrip(&e).timestamp, 1600000000000);
}
