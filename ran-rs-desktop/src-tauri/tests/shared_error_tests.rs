//! Shared error 模块测试
use ran_rs_desktop_lib::shared::error::AppError;

#[test]
fn app_error_display_connection() {
    let err = AppError::Connection("timeout".to_string());
    assert!(err.to_string().contains("连接错误"));
    assert!(err.to_string().contains("timeout"));
}

#[test]
fn app_error_display_internal() {
    let err = AppError::Internal("something failed".to_string());
    assert!(err.to_string().contains("内部错误"));
}

#[test]
fn app_error_display_bad_request() {
    let err = AppError::BadRequest("invalid param".to_string());
    assert!(err.to_string().contains("参数错误"));
}

#[test]
fn app_error_display_not_found() {
    let err = AppError::NotFound("key".to_string());
    assert!(err.to_string().contains("未找到"));
}

#[test]
fn app_error_from_io() {
    let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
    let app_err: AppError = io_err.into();
    assert!(app_err.to_string().contains("IO"));
}

#[test]
fn app_error_serialize() {
    let err = AppError::BadRequest("test".to_string());
    let json = serde_json::to_string(&err).unwrap();
    // Serialize produces a plain string, not an object
    assert!(json.starts_with('"'));
    assert!(json.contains("参数错误"));
}
