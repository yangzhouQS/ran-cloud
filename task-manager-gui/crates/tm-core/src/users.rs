//! 用户页:WTS 会话枚举 + 按用户聚合资源。
#![cfg(windows)]

use windows::core::PWSTR;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::RemoteDesktop::{
    WTS_CONNECTSTATE_CLASS, WTSUserName, WTSEnumerateSessionsW, WTSFreeMemory,
    WTSQuerySessionInformationW, WTS_SESSION_INFOW,
};

use crate::models::SystemSnapshot;

#[derive(Debug, Clone)]
pub struct UserInfo {
    pub name: String,
    pub session_id: u32,
    pub state: String,
    pub cpu: f32,
    pub memory: u64,
}

pub fn enumerate(snap: &SystemSnapshot) -> Vec<UserInfo> {
    unsafe { enumerate_inner(snap).unwrap_or_default() }
}

unsafe fn enumerate_inner(snap: &SystemSnapshot) -> Result<Vec<UserInfo>, ()> {
    let mut pinfo: *mut WTS_SESSION_INFOW = std::ptr::null_mut();
    let mut count: u32 = 0;
    let res = WTSEnumerateSessionsW(HANDLE::default(), 0, 1, &mut pinfo, &mut count);
    if res.is_err() {
        return Ok(Vec::new());
    }

    let mut out: Vec<UserInfo> = Vec::new();
    for i in 0..count as usize {
        let s = &*pinfo.add(i);
        let session_id = s.SessionId;
        let state = map_state(s.State);
        let name = query_username(session_id);
        if name.is_empty() {
            continue;
        }
        let (cpu, memory) = aggregate(snap, &name);
        out.push(UserInfo {
            name,
            session_id,
            state,
            cpu,
            memory,
        });
    }
    WTSFreeMemory(pinfo as *const _ as *mut _);
    Ok(out)
}

unsafe fn query_username(session_id: u32) -> String {
    let mut buf = PWSTR::null();
    let mut bytes: u32 = 0;
    let res = WTSQuerySessionInformationW(
        HANDLE::default(),
        session_id,
        WTSUserName,
        &mut buf,
        &mut bytes,
    );
    if res.is_err() {
        return String::new();
    }
    let s = pwstr_to_string(buf);
    WTSFreeMemory(buf.as_ptr() as *const _ as *mut _);
    s
}

/// 按用户名聚合进程的 CPU% 与内存(工作集)。
fn aggregate(snap: &SystemSnapshot, user: &str) -> (f32, u64) {
    let mut cpu = 0.0f32;
    let mut mem = 0u64;
    for p in &snap.processes {
        if p.user.as_deref() == Some(user) {
            cpu += p.cpu_usage;
            mem += p.memory_bytes;
        }
    }
    (cpu, mem)
}

fn map_state(state: WTS_CONNECTSTATE_CLASS) -> String {
    match state.0 {
        0 => "活动".into(),
        4 => "已断开".into(),
        _ => "其他".into(),
    }
}

unsafe fn pwstr_to_string(p: PWSTR) -> String {
    if p.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while *p.0.add(len) != 0 {
        len += 1;
    }
    let slice = std::slice::from_raw_parts(p.0, len);
    String::from_utf16_lossy(slice)
}

#[cfg(not(windows))]
#[derive(Debug, Clone)]
pub struct UserInfo {
    pub name: String,
    pub session_id: u32,
    pub state: String,
    pub cpu: f32,
    pub memory: u64,
}

#[cfg(not(windows))]
pub fn enumerate(_snap: &SystemSnapshot) -> Vec<UserInfo> {
    Vec::new()
}
