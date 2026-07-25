//! 权限:检测是否以管理员运行、启用 SE_DEBUG_PRIVILEGE。

#[cfg(windows)]
pub fn is_elevated() -> bool {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{
        GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elev = TOKEN_ELEVATION {
            TokenIsElevated: 0,
        };
        let mut ret_len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elev as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        );
        let _ = CloseHandle(token);
        ok.is_ok() && elev.TokenIsElevated != 0
    }
}

/// 启用 SE_DEBUG_PRIVILEGE(仅提权时成功),以便结束/读取系统级进程。
#[cfg(windows)]
pub fn enable_debug_privilege() {
    use windows::Win32::Foundation::{CloseHandle, HANDLE, LUID};
    use windows::Win32::Security::{
        AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_DEBUG_NAME,
        SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES,
        TOKEN_PRIVILEGES_ATTRIBUTES, TOKEN_QUERY,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_QUERY | TOKEN_ADJUST_PRIVILEGES,
            &mut token,
        )
        .is_err()
        {
            return;
        }
        let mut luid = LUID::default();
        if LookupPrivilegeValueW(None, SE_DEBUG_NAME, &mut luid).is_err() {
            let _ = CloseHandle(token);
            return;
        }
        let tp = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: TOKEN_PRIVILEGES_ATTRIBUTES(SE_PRIVILEGE_ENABLED.0),
            }],
        };
        let _ = AdjustTokenPrivileges(
            token,
            false,
            Some(&tp as *const _ as *const _),
            0,
            None,
            None,
        );
        let _ = CloseHandle(token);
    }
}

#[cfg(not(windows))]
pub fn is_elevated() -> bool {
    false
}

#[cfg(not(windows))]
pub fn enable_debug_privilege() {}
