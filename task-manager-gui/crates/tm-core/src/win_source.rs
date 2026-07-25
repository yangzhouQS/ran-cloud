//! windows 补缺:枚举可见顶层窗口,收集其拥有者 PID(用于进程分组 App/Background)。

use std::collections::HashSet;

#[cfg(windows)]
pub fn window_pids() -> HashSet<u32> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, TRUE};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible,
    };

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let set = &mut *(lparam.0 as *mut HashSet<u32>);
        if IsWindowVisible(hwnd).as_bool() {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
            if pid != 0 {
                set.insert(pid);
            }
        }
        TRUE
    }

    let mut set: HashSet<u32> = HashSet::new();
    let ptr = &mut set as *mut HashSet<u32> as isize;
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(ptr));
    }
    set
}

#[cfg(not(windows))]
pub fn window_pids() -> HashSet<u32> {
    HashSet::new()
}

#[cfg(windows)]
pub fn session_id(pid: u32) -> Option<u32> {
    use windows::Win32::System::RemoteDesktop::ProcessIdToSessionId;
    unsafe {
        let mut sid: u32 = 0;
        if ProcessIdToSessionId(pid, &mut sid).is_ok() {
            Some(sid)
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
pub fn session_id(_pid: u32) -> Option<u32> {
    None
}
