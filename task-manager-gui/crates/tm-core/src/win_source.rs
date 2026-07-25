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

/// 提取可执行文件的小图标(SHGFI_SMALLICON),转为 RGBA 图像。
#[cfg(windows)]
pub fn exe_icon(path: &str) -> Option<image::RgbaImage> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_SMALLICON};

    unsafe {
        let wide = to_wide(path);
        let mut fi = SHFILEINFOW::default();
        let flags = SHGFI_ICON | SHGFI_SMALLICON;
        let r = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut fi as *mut _),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );
        if r == 0 || fi.hIcon.0.is_null() {
            return None;
        }
        let img = hicon_to_rgba(fi.hIcon);
        let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(fi.hIcon);
        img
    }
}

#[cfg(not(windows))]
pub fn exe_icon(_path: &str) -> Option<image::RgbaImage> {
    None
}

/// HICON -> RGBA(un-premultiplied)。
#[cfg(windows)]
unsafe fn hicon_to_rgba(
    hicon: windows::Win32::UI::WindowsAndMessaging::HICON,
) -> Option<image::RgbaImage> {
    use windows::Win32::Graphics::Gdi::{
        GetDC, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DeleteObject,
        DIB_RGB_COLORS, ReleaseDC,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    let mut ii = ICONINFO::default();
    if GetIconInfo(hicon, &mut ii).is_err() {
        return None;
    }
    let hbm = ii.hbmColor;
    let result = if hbm.0.is_null() {
        None
    } else {
        // 用 GetObjectW 取得尺寸(比 GetDIBits 空查询可靠)。
        let mut bmp = BITMAP::default();
        let _ = GetObjectW(
            hbm,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bmp as *mut _ as *mut _),
        );
        let w = bmp.bmWidth.max(1) as u32;
        let h = bmp.bmHeight.max(1) as u32;
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w as i32,
                biHeight: -(h as i32), // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };
        let hdc = GetDC(None);
        let mut bits = vec![0u8; (w as usize) * (h as usize) * 4];
        let ok = GetDIBits(
            hdc,
            hbm,
            0,
            h,
            Some(bits.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        let _ = ReleaseDC(None, hdc);
        if ok == 0 {
            None
        } else {
            // 32bpp 输出为 BGRA(预乘)→ 转 RGBA(直通)。
            let mut rgba = Vec::with_capacity(bits.len());
            for px in bits.chunks_exact(4) {
                let (b, g, r, a) = (px[0], px[1], px[2], px[3]);
                if a == 0 {
                    rgba.extend_from_slice(&[0, 0, 0, 0]);
                } else {
                    let rr = (r as u32 * 255 / a as u32).min(255) as u8;
                    let gg = (g as u32 * 255 / a as u32).min(255) as u8;
                    let bb = (b as u32 * 255 / a as u32).min(255) as u8;
                    rgba.extend_from_slice(&[rr, gg, bb, a]);
                }
            }
            image::RgbaImage::from_raw(w, h, rgba)
        }
    };
    // 释放 GetIconInfo 产生的位图
    if !ii.hbmMask.0.is_null() {
        let _ = DeleteObject(ii.hbmMask);
    }
    if !ii.hbmColor.0.is_null() {
        let _ = DeleteObject(ii.hbmColor);
    }
    result
}

#[cfg(windows)]
fn to_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}
