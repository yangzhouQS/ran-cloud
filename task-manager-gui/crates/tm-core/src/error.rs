//! 进程操作错误类型与 Windows 错误码映射。

use thiserror::Error;

#[derive(Debug, Error)]
pub enum OpsError {
    #[error("拒绝访问(可能需要管理员权限)")]
    AccessDenied,
    #[error("找不到进程")]
    NotFound,
    #[error("参数无效")]
    InvalidParameter,
    #[error("Windows 错误码 {0}")]
    Other(u32),
    #[error(transparent)]
    Windows(#[from] windows::core::Error),
}

/// 把 GetLastError 的码映射为 OpsError。
pub fn map_windows_error(code: u32) -> OpsError {
    match code {
        5 => OpsError::AccessDenied,
        87 => OpsError::InvalidParameter,
        0 => OpsError::Other(0),
        _ => OpsError::Other(code),
    }
}

impl PartialEq for OpsError {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::AccessDenied, Self::AccessDenied) => true,
            (Self::NotFound, Self::NotFound) => true,
            (Self::InvalidParameter, Self::InvalidParameter) => true,
            (Self::Other(a), Self::Other(b)) => a == b,
            // windows::core::Error 未实现 PartialEq,按 HRESULT 比对。
            (Self::Windows(a), Self::Windows(b)) => a.code() == b.code(),
            _ => false,
        }
    }
}
