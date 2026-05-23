//! Shared connection status 测试
use ran_rs_desktop_lib::shared::connection::ConnectionStatus;

#[test]
fn connection_status_disconnected_serde() {
    let status = ConnectionStatus::Disconnected;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"disconnected\"");
    // Roundtrip not possible — ConnectionStatus doesn't implement Deserialize
}

#[test]
fn connection_status_connecting_serde() {
    let status = ConnectionStatus::Connecting;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"connecting\"");
}

#[test]
fn connection_status_connected_serde() {
    let status = ConnectionStatus::Connected;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"connected\"");
}

#[test]
fn connection_status_error_serde() {
    let status = ConnectionStatus::Error("timeout".to_string());
    let json = serde_json::to_string(&status).unwrap();
    assert!(json.contains("\"error\""));
    assert!(json.contains("timeout"));
}
