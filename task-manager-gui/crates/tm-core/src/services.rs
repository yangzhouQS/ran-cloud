//! Windows 服务枚举:名称/显示名/状态/启动类型(基于 SCM)。
#![cfg(windows)]

use windows::core::{Error, PCWSTR};
use windows::Win32::System::Services::{
    CloseServiceHandle, EnumServicesStatusExW, OpenSCManagerW, OpenServiceW, QueryServiceConfigW,
    ENUM_SERVICE_STATUS_PROCESSW, QUERY_SERVICE_CONFIGW, SC_ENUM_PROCESS_INFO, SC_HANDLE,
    SC_MANAGER_ENUMERATE_SERVICE, SERVICE_AUTO_START, SERVICE_BOOT_START, SERVICE_DEMAND_START,
    SERVICE_DISABLED, SERVICE_QUERY_CONFIG, SERVICE_RUNNING, SERVICE_STATE_ALL, SERVICE_SYSTEM_START,
    SERVICE_WIN32,
};

const ERROR_MORE_DATA: u32 = 122;

#[derive(Debug, Clone)]
pub struct ServiceInfo {
    pub name: String,
    pub display_name: String,
    pub status: ServiceState,
    pub start_type: ServiceStartType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceState {
    Running,
    Stopped,
    Starting,
    Stopping,
    Paused,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServiceStartType {
    Auto,
    Manual,
    Disabled,
    System,
    Other,
}

/// 枚举服务(失败返回空)。
pub fn enumerate() -> Vec<ServiceInfo> {
    unsafe { enumerate_inner().unwrap_or_default() }
}

unsafe fn enumerate_inner() -> Result<Vec<ServiceInfo>, Error> {
    let hscm: SC_HANDLE = OpenSCManagerW(None, None, SC_MANAGER_ENUMERATE_SERVICE)?;
    let mut out: Vec<ServiceInfo> = Vec::new();
    let mut buf: Vec<u8> = vec![0u8; 64 * 1024];
    let mut resume: u32 = 0;

    loop {
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;
        let res = EnumServicesStatusExW(
            hscm,
            SC_ENUM_PROCESS_INFO,
            SERVICE_WIN32,
            SERVICE_STATE_ALL,
            Some(buf.as_mut_slice()),
            &mut needed,
            &mut returned,
            Some(&mut resume as *mut u32),
            PCWSTR::null(),
        );
        match res {
            Ok(()) => {
                append_entries(&buf, returned, hscm, &mut out);
                if resume == 0 {
                    break;
                }
            }
            Err(err) => {
                if err.code().0 as u32 == ERROR_MORE_DATA {
                    append_entries(&buf, returned, hscm, &mut out);
                    if needed as usize > buf.len() {
                        buf.resize(needed as usize, 0);
                    }
                    if resume == 0 {
                        break;
                    }
                } else {
                    break;
                }
            }
        }
    }

    let _ = CloseServiceHandle(hscm);
    Ok(out)
}

unsafe fn append_entries(buf: &[u8], count: u32, hscm: SC_HANDLE, out: &mut Vec<ServiceInfo>) {
    if count == 0 {
        return;
    }
    let base = buf.as_ptr() as *const ENUM_SERVICE_STATUS_PROCESSW;
    for i in 0..count as usize {
        let e = &*base.add(i);
        let name = wide_ptr_to_string(e.lpServiceName.0);
        let disp = wide_ptr_to_string(e.lpDisplayName.0);
        let state = e.ServiceStatusProcess.dwCurrentState.0;
        let start = query_start_type(hscm, &name);
        out.push(ServiceInfo {
            name: name.clone(),
            display_name: disp,
            status: map_state(state),
            start_type: start,
        });
    }
}

unsafe fn query_start_type(hscm: SC_HANDLE, name: &str) -> ServiceStartType {
    let wide = to_wide(name);
    let hsvc = match OpenServiceW(hscm, PCWSTR(wide.as_ptr()), SERVICE_QUERY_CONFIG) {
        Ok(h) => h,
        Err(_) => return ServiceStartType::Other,
    };
    let mut buf: Vec<u8> = vec![0u8; 8 * 1024];
    let mut needed: u32 = 0;
    let res = QueryServiceConfigW(
        hsvc,
        Some(buf.as_mut_ptr() as *mut QUERY_SERVICE_CONFIGW),
        buf.len() as u32,
        &mut needed,
    );
    let _ = CloseServiceHandle(hsvc);
    if res.is_err() {
        return ServiceStartType::Other;
    }
    let cfg = &*(buf.as_ptr() as *const QUERY_SERVICE_CONFIGW);
    map_start(cfg.dwStartType.0)
}

fn map_state(state: u32) -> ServiceState {
    match state {
        x if x == SERVICE_RUNNING.0 => ServiceState::Running,
        1 => ServiceState::Stopped,
        2 => ServiceState::Starting,
        3 => ServiceState::Stopping,
        7 => ServiceState::Paused,
        _ => ServiceState::Other,
    }
}

fn map_start(start: u32) -> ServiceStartType {
    match start {
        x if x == SERVICE_AUTO_START.0 => ServiceStartType::Auto,
        x if x == SERVICE_DEMAND_START.0 => ServiceStartType::Manual,
        x if x == SERVICE_DISABLED.0 => ServiceStartType::Disabled,
        x if x == SERVICE_BOOT_START.0 || x == SERVICE_SYSTEM_START.0 => ServiceStartType::System,
        _ => ServiceStartType::Other,
    }
}

unsafe fn wide_ptr_to_string(p: *const u16) -> String {
    if p.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while *p.add(len) != 0 {
        len += 1;
    }
    let slice = std::slice::from_raw_parts(p, len);
    String::from_utf16_lossy(slice)
}

fn to_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}
