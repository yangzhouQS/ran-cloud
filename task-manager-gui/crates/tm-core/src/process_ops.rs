//! 进程操作:结束/挂起/恢复/效率模式(EcoQoS)/优先级/打开文件位置。
#![cfg(windows)]

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows::core::{w, PCSTR, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, HMODULE};
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows::Win32::System::Threading::{
    OpenProcess, SetPriorityClass, SetProcessInformation, TerminateProcess, ABOVE_NORMAL_PRIORITY_CLASS,
    BELOW_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS, IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
    ProcessPowerThrottling, PROCESS_ACCESS_RIGHTS, PROCESS_INFORMATION_CLASS, PROCESS_SET_INFORMATION,
    PROCESS_SUSPEND_RESUME, PROCESS_TERMINATE, REALTIME_PRIORITY_CLASS,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::error::OpsError;
use crate::models::PriorityClass;

/// 把 OpenProcess / TerminateProcess 等返回的 windows::core::Error 映射为 OpsError。
fn map_err(err: windows::core::Error) -> OpsError {
    // Win32 错误的 HRESULT 形如 0x8007xxxx,低 16 位即 Win32 错误码。
    let hr = err.code().0 as u32;
    let win32 = if (hr >> 16) & 0x7FFF == 7 { hr & 0xFFFF } else { 0 };
    match win32 {
        5 => OpsError::AccessDenied, // ERROR_ACCESS_DENIED
        87 => OpsError::NotFound,    // ERROR_INVALID_PARAMETER(进程不存在时 OpenProcess 返回此码)
        _ => OpsError::Windows(err),
    }
}

fn open(pid: u32, access: u32) -> Result<HANDLE, OpsError> {
    unsafe { OpenProcess(PROCESS_ACCESS_RIGHTS(access), false, pid).map_err(map_err) }
}

pub fn kill(pid: u32) -> Result<(), OpsError> {
    unsafe {
        let h = open(pid, PROCESS_TERMINATE.0)?;
        let r = TerminateProcess(h, 1).map_err(map_err);
        let _ = CloseHandle(h);
        r
    }
}

pub fn suspend(pid: u32) -> Result<(), OpsError> {
    let h = open(pid, PROCESS_SUSPEND_RESUME.0)?;
    let f = nt_proc_fn(b"NtSuspendProcess\0")?;
    unsafe {
        let status = f(h);
        let _ = CloseHandle(h);
        nt_result(status)
    }
}

pub fn resume(pid: u32) -> Result<(), OpsError> {
    let h = open(pid, PROCESS_SUSPEND_RESUME.0)?;
    let f = nt_proc_fn(b"NtResumeProcess\0")?;
    unsafe {
        let status = f(h);
        let _ = CloseHandle(h);
        nt_result(status)
    }
}

/// 效率模式(EcoQoS):开启=限制执行速度(节能),关闭=恢复默认。
pub fn set_efficiency_mode(pid: u32, enable: bool) -> Result<(), OpsError> {
    // PROCESS_POWER_THROTTLING_STATE 的 Win32 原始布局(三个 ULONG),自建以避开 bitflags 细节。
    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct PowerThrottlingState {
        version: u32,      // PROCESS_POWER_THROTTLING_CURRENT = 1
        control_mask: u32, // PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 1
        state_mask: u32,
    }

    unsafe {
        let h = open(pid, PROCESS_SET_INFORMATION.0)?;
        let st = PowerThrottlingState {
            version: 1,
            control_mask: 1,
            state_mask: if enable { 1 } else { 0 },
        };
        // SetProcessInformation 在 0.58 返回 BOOL。
        let _ = SetProcessInformation(
            h,
            PROCESS_INFORMATION_CLASS(ProcessPowerThrottling.0),
            &st as *const _ as *const _,
            std::mem::size_of::<PowerThrottlingState>() as u32,
        );
        let _ = CloseHandle(h);
        Ok(())
    }
}

pub fn set_priority(pid: u32, prio: PriorityClass) -> Result<(), OpsError> {
    unsafe {
        let h = open(pid, PROCESS_SET_INFORMATION.0)?;
        let class = match prio {
            PriorityClass::Realtime => REALTIME_PRIORITY_CLASS,
            PriorityClass::High => HIGH_PRIORITY_CLASS,
            PriorityClass::AboveNormal => ABOVE_NORMAL_PRIORITY_CLASS,
            PriorityClass::Normal => NORMAL_PRIORITY_CLASS,
            PriorityClass::BelowNormal => BELOW_NORMAL_PRIORITY_CLASS,
            PriorityClass::Idle => IDLE_PRIORITY_CLASS,
        };
        let r = SetPriorityClass(h, class).map_err(map_err);
        let _ = CloseHandle(h);
        r
    }
}

/// 用 explorer.exe /select,"<path>" 打开文件所在文件夹。
pub fn open_file_location(exe_path: &str) -> Result<(), OpsError> {
    let param = to_wide(&format!("/select,\"{}\"", exe_path));
    unsafe {
        let _ = ShellExecuteW(
            None,
            w!("open"),
            w!("explorer.exe"),
            PCWSTR(param.as_ptr()),
            None,
            SW_SHOWNORMAL,
        );
    }
    Ok(())
}

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// 从 ntdll 动态获取 NtSuspendProcess / NtResumeProcess 函数指针。
fn nt_proc_fn(name: &[u8]) -> Result<unsafe extern "system" fn(HANDLE) -> i32, OpsError> {
    unsafe {
        let ntdll: HMODULE = GetModuleHandleW(w!("ntdll.dll")).map_err(map_err)?;
        let addr = GetProcAddress(ntdll, PCSTR(name.as_ptr()));
        match addr {
            Some(f) => Ok(std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                unsafe extern "system" fn(HANDLE) -> i32,
            >(f)),
            None => Err(OpsError::Other(0)),
        }
    }
}

/// NTSTATUS >= 0 视为成功。
fn nt_result(status: i32) -> Result<(), OpsError> {
    if status >= 0 {
        Ok(())
    } else {
        Err(OpsError::Other(status as u32))
    }
}
