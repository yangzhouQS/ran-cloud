//! Redis Storage 模型 Serde 测试
use ran_rs_desktop_lib::modules::redis_desktop::storage::models::*;

#[test]
fn app_settings_default() {
    let s = AppSettings::default();
    assert_eq!(s.language, "zh-CN");
    assert_eq!(s.theme, "system");
    assert_eq!(s.font_size, 14);
    assert_eq!(s.key_separator, ":");
    assert_eq!(s.scan_count, 200);
    assert_eq!(s.page_size, 50);
    assert_eq!(s.command_timeout_secs, 5);
    assert_eq!(s.connection_timeout_secs, 5);
    assert!(!s.auto_refresh_keys);
    assert_eq!(s.auto_refresh_interval_ms, 5000);
    assert!(s.show_cli_suggestions);
    assert_eq!(s.max_cli_history, 500);
}

#[test]
fn app_settings_serde_roundtrip() {
    let s = AppSettings::default();
    let json = serde_json::to_string(&s).unwrap();
    let back: AppSettings = serde_json::from_str(&json).unwrap();
    assert_eq!(back.language, s.language);
    assert_eq!(back.font_size, s.font_size);
    assert_eq!(back.scan_count, s.scan_count);
    assert_eq!(back.max_cli_history, s.max_cli_history);
}

#[test]
fn app_settings_camel_case() {
    let s = AppSettings::default();
    let json = serde_json::to_string(&s).unwrap();
    assert!(json.contains("\"fontSize\""));
    assert!(json.contains("\"keySeparator\""));
    assert!(json.contains("\"scanCount\""));
    assert!(json.contains("\"pageSize\""));
    assert!(json.contains("\"commandTimeoutSecs\""));
    assert!(json.contains("\"connectionTimeoutSecs\""));
    assert!(json.contains("\"autoRefreshKeys\""));
    assert!(json.contains("\"autoRefreshIntervalMs\""));
    assert!(json.contains("\"showCliSuggestions\""));
    assert!(json.contains("\"maxCliHistory\""));
}
