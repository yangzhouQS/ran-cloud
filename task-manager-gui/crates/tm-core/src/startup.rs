//! 启动项枚举:注册表 Run 键 + Startup 文件夹。
#![cfg(windows)]

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ,
};

#[derive(Debug, Clone)]
pub struct StartupEntry {
    pub name: String,
    pub command: String,
    pub location: String,
}

const ERROR_NO_MORE_ITEMS: u32 = 259;
const ERROR_MORE_DATA: u32 = 234;

pub fn enumerate() -> Vec<StartupEntry> {
    let mut out = Vec::new();
    let run_keys: [(HKEY, &str, &str); 3] = [
        (
            HKEY_LOCAL_MACHINE,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            "注册表 (HKLM)",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
            "注册表 (HKLM 32位)",
        ),
        (
            HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            "注册表 (HKCU)",
        ),
    ];
    for (root, sub, loc) in run_keys {
        enum_run_key(root, sub, loc, &mut out);
    }
    enum_startup_folder("Startup 文件夹 (用户)", "APPDATA", &mut out);
    enum_startup_folder("Startup 文件夹 (公用)", "ProgramData", &mut out);
    out
}

#[allow(clippy::too_many_arguments)]
fn enum_run_key(root: HKEY, sub: &str, loc: &str, out: &mut Vec<StartupEntry>) {
    unsafe {
        let sub_w = to_wide(sub);
        let mut hkey = HKEY::default();
        let r = RegOpenKeyExW(root, PCWSTR(sub_w.as_ptr()), 0, KEY_READ, &mut hkey);
        if r.0 != 0 {
            return;
        }
        let mut index = 0u32;
        loop {
            let mut name_buf = [0u16; 512];
            let mut name_len = name_buf.len() as u32;
            let mut data_buf = [0u8; 2048];
            let mut data_len = data_buf.len() as u32;
            let ret = RegEnumValueW(
                hkey,
                index,
                PWSTR(name_buf.as_mut_ptr()),
                &mut name_len,
                None,
                None,
                Some(data_buf.as_mut_ptr()),
                Some(&mut data_len),
            );
            match ret.0 {
                0 => {
                    let name = from_wide(&name_buf[..name_len as usize]);
                    let command = from_wide_bytes(&data_buf[..data_len as usize]);
                    out.push(StartupEntry {
                        name,
                        command,
                        location: loc.to_string(),
                    });
                    index += 1;
                }
                ERROR_NO_MORE_ITEMS => break,
                ERROR_MORE_DATA => {
                    index += 1;
                }
                _ => break,
            }
        }
        let _ = RegCloseKey(hkey);
    }
}

fn enum_startup_folder(loc: &str, env_var: &str, out: &mut Vec<StartupEntry>) {
    let base = match std::env::var(env_var) {
        Ok(v) => v,
        Err(_) => return,
    };
    let path = format!(
        "{}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
        base
    );
    let dir = match std::fs::read_dir(&path) {
        Ok(d) => d,
        Err(_) => return,
    };
    for entry in dir.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let cmd = entry.path().to_string_lossy().into_owned();
        out.push(StartupEntry {
            name,
            command: cmd,
            location: loc.to_string(),
        });
    }
}

fn to_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn from_wide(b: &[u16]) -> String {
    let v: Vec<u16> = b.iter().copied().take_while(|&x| x != 0).collect();
    String::from_utf16_lossy(&v)
}

fn from_wide_bytes(b: &[u8]) -> String {
    let v: Vec<u16> = b
        .chunks_exact(2)
        .map(|c| u16::from_ne_bytes([c[0], c[1]]))
        .take_while(|&x| x != 0)
        .collect();
    String::from_utf16_lossy(&v)
}

#[cfg(not(windows))]
#[derive(Debug, Clone)]
pub struct StartupEntry {
    pub name: String,
    pub command: String,
    pub location: String,
}

#[cfg(not(windows))]
pub fn enumerate() -> Vec<StartupEntry> {
    Vec::new()
}
