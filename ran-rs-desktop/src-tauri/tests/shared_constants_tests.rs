//! Shared constants 断言测试
use ran_rs_desktop_lib::shared::constants::*;

#[test]
fn app_name() { assert_eq!(APP_NAME, "Ran RS Desktop"); }
#[test]
fn default_connection_timeout() { assert_eq!(DEFAULT_CONNECTION_TIMEOUT_SECS, 5); }
#[test]
fn default_command_timeout() { assert_eq!(DEFAULT_COMMAND_TIMEOUT_SECS, 30); }
#[test]
fn max_key_name_length() { assert_eq!(MAX_KEY_NAME_LENGTH, 1024); }
#[test]
fn default_scan_count() { assert_eq!(DEFAULT_SCAN_COUNT, 200); }
#[test]
fn big_key_threshold() { assert_eq!(BIG_KEY_THRESHOLD_BYTES, 524288); }
#[test]
fn default_page_size() { assert_eq!(DEFAULT_PAGE_SIZE, 50); }
#[test]
fn max_cli_history() { assert_eq!(MAX_CLI_HISTORY, 500); }
#[test]
fn default_slowlog_count() { assert_eq!(DEFAULT_SLOWLOG_COUNT, 100); }
#[test]
fn store_filename() { assert_eq!(STORE_FILENAME, "ran-rs-desktop-store"); }
#[test]
fn store_key_connections() { assert_eq!(STORE_KEY_CONNECTIONS, "connections"); }
#[test]
fn store_key_settings() { assert_eq!(STORE_KEY_SETTINGS, "settings"); }
