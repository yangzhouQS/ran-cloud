//! 运行新任务:解析命令 + ShellExecuteW(可选提权)。

#[cfg(windows)]
pub fn run_new_task(command: &str, elevated: bool) -> Result<(), crate::error::OpsError> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    use crate::error::OpsError;

    let (exe, params) = split_command(command);
    if exe.is_empty() {
        return Err(OpsError::InvalidParameter);
    }
    let verb = to_wide(if elevated { "runas" } else { "open" });
    let file = to_wide(&exe);
    let pw = to_wide(&params); // 空参数也指向 "\0"
    unsafe {
        let h: HINSTANCE = ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR(pw.as_ptr()),
            None,
            SW_SHOWNORMAL,
        );
        // ShellExecuteW 失败时返回值 <= 32 即错误码。
        let code = h.0 as usize;
        if code <= 32 {
            Err(match code {
                2 => OpsError::NotFound,
                5 => OpsError::AccessDenied,
                _ => OpsError::Other(code as u32),
            })
        } else {
            Ok(())
        }
    }
}

/// 拆分命令为 exe + 参数(支持引号包裹的路径)。
fn split_command(s: &str) -> (String, String) {
    let s = s.trim();
    if s.is_empty() {
        return (String::new(), String::new());
    }
    if let Some(rest) = s.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            let exe = rest[..end].to_string();
            let params = rest[end + 1..].trim().to_string();
            return (exe, params);
        }
    }
    match s.find(char::is_whitespace) {
        Some(i) => (s[..i].to_string(), s[i..].trim().to_string()),
        None => (s.to_string(), String::new()),
    }
}

#[cfg(windows)]
fn to_wide(s: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(not(windows))]
pub fn run_new_task(_command: &str, _elevated: bool) -> Result<(), crate::error::OpsError> {
    Ok(())
}
