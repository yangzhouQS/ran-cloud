//! Redis Key 操作模型 Serde 测试
use ran_rs_desktop_lib::modules::redis_desktop::key::models::*;

fn roundtrip<T: serde::Serialize + serde::de::DeserializeOwned>(val: &T) -> T {
    let json = serde_json::to_string(val).unwrap();
    serde_json::from_str(&json).unwrap()
}

#[test]
fn key_scan_result_serde() {
    let r = KeyScanResult {
        key: "user:1".to_string(), key_type: "hash".to_string(),
        ttl: -1, memory_usage: Some(1024),
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("\"keyType\""));
    assert!(json.contains("\"memoryUsage\""));
    assert_eq!(roundtrip(&r).key, "user:1");
}

#[test]
fn key_detail_serde() {
    let d = KeyDetail {
        key: "k".to_string(), key_type: "string".to_string(),
        ttl: 300, memory_usage: None, encoding: "embstr".to_string(), length: 1,
    };
    assert!(roundtrip(&d).memory_usage.is_none());
}

#[test]
fn key_scan_params_serde() {
    let p = KeyScanParams {
        connection_id: "c1".to_string(), db: 0,
        pattern: Some("user:*".to_string()), count: Some(200), cursor: Some(0),
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"connectionId\""));
}

#[test]
fn scan_progress_event_serde() {
    let e = ScanProgressEvent {
        scan_id: "s1".to_string(), connection_id: "c1".to_string(),
        cursor: 100, batch_count: 50, keys: vec!["k1".to_string(), "k2".to_string()],
        done: false, total_scanned: 150,
    };
    let json = serde_json::to_string(&e).unwrap();
    assert!(json.contains("\"scanId\""));
    assert!(json.contains("\"totalScanned\""));
    assert!(!roundtrip(&e).done);
}

#[test]
fn scan_start_params_serde() {
    let p = ScanStartParams {
        connection_id: "c1".to_string(), db: 1,
        pattern: None, count: Some(500), scan_id: "uuid".to_string(),
    };
    assert_eq!(roundtrip(&p).scan_id, "uuid");
}

#[test]
fn scan_cancel_params_serde() {
    let p = ScanCancelParams { scan_id: "s1".to_string() };
    assert_eq!(roundtrip(&p).scan_id, "s1");
}

#[test]
fn scan_continue_params_serde() {
    let p = ScanContinueParams {
        scan_id: "s1".to_string(), connection_id: "c1".to_string(),
        cursor: 50, pattern: Some("prefix*".to_string()), count: None,
    };
    assert_eq!(roundtrip(&p).cursor, 50);
}

#[test]
fn key_delete_params_serde() {
    let p = KeyDeleteParams {
        connection_id: "c1".to_string(), db: 0,
        keys: vec!["k1".to_string(), "k2".to_string(), "k3".to_string()],
    };
    assert_eq!(roundtrip(&p).keys.len(), 3);
}

#[test]
fn key_rename_params_serde() {
    let p = KeyRenameParams {
        connection_id: "c1".to_string(), db: 0,
        old_key: "old".to_string(), new_key: "new".to_string(),
    };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"oldKey\""));
    assert!(json.contains("\"newKey\""));
}

#[test]
fn key_expire_params_serde() {
    let p = KeyExpireParams {
        connection_id: "c1".to_string(), db: 0,
        key: "mykey".to_string(), seconds: 3600,
    };
    assert_eq!(roundtrip(&p).seconds, 3600);
}

#[test]
fn key_detail_params_serde() {
    let p = KeyDetailParams {
        connection_id: "c1".to_string(), db: 2, key: "user:1".to_string(),
    };
    assert_eq!(roundtrip(&p).db, 2);
}
