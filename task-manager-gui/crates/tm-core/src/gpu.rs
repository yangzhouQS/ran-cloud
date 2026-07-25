//! GPU 利用率/显存:PDH 性能计数器(通配扩展 GPU Engine/GPU Adapter Memory)。
#![cfg(windows)]

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::System::Performance::{
    PdhAddCounterW, PdhCloseQuery, PdhCollectQueryData, PdhExpandWildCardPathW, PdhGetFormattedCounterValue,
    PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE, PERF_DETAIL_WIZARD,
};

const PDH_SUCCESS: u32 = 0;

/// GPU 监视器(单 query)。new() 失败(无 GPU 计数器)返回 None。
pub struct GpuMonitor {
    query: isize,
    util_counters: Vec<isize>,
    mem_counters: Vec<isize>,
}

impl Drop for GpuMonitor {
    fn drop(&mut self) {
        unsafe {
            let _ = PdhCloseQuery(self.query);
        }
    }
}

impl GpuMonitor {
    pub fn new() -> Option<Self> {
        unsafe {
            let mut query = 0isize;
            if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != PDH_SUCCESS {
                return None;
            }
            let mut util_counters = Vec::new();
            for path in expand(r"\GPU Engine(*)\Utilization Percentage") {
                let mut c = 0isize;
                if PdhAddCounterW(query, PCWSTR(to_wide(&path).as_ptr()), 0, &mut c) == PDH_SUCCESS {
                    util_counters.push(c);
                }
            }
            let mut mem_counters = Vec::new();
            for path in expand(r"\GPU Adapter Memory(*)\Dedicated Usage") {
                let mut c = 0isize;
                if PdhAddCounterW(query, PCWSTR(to_wide(&path).as_ptr()), 0, &mut c) == PDH_SUCCESS {
                    mem_counters.push(c);
                }
            }
            if util_counters.is_empty() {
                let _ = PdhCloseQuery(query);
                return None;
            }
            // 预热(速率型计数器首采无效)。
            let _ = PdhCollectQueryData(query);
            Some(GpuMonitor {
                query,
                util_counters,
                mem_counters,
            })
        }
    }

    /// 采样:返回 (最忙引擎利用率%, 专用显存字节数合计)。
    pub fn sample(&self) -> (f32, u64) {
        unsafe {
            if PdhCollectQueryData(self.query) != PDH_SUCCESS {
                return (0.0, 0);
            }
            let mut util = 0.0f32;
            for &c in &self.util_counters {
                if let Some(v) = read_double(c) {
                    if (v as f32) > util {
                        util = v as f32;
                    }
                }
            }
            let mut mem = 0u64;
            for &c in &self.mem_counters {
                if let Some(v) = read_double(c) {
                    mem += v as u64;
                }
            }
            (util, mem)
        }
    }
}

unsafe fn read_double(counter: isize) -> Option<f64> {
    let mut val = PDH_FMT_COUNTERVALUE::default();
    if PdhGetFormattedCounterValue(counter, PDH_FMT_DOUBLE, None, &mut val) != PDH_SUCCESS {
        return None;
    }
    Some(val.Anonymous.doubleValue)
}

/// 展开通配计数器路径为多实例路径列表。
unsafe fn expand(pattern: &str) -> Vec<String> {
    let pat = to_wide(pattern);
    let mut len: u32 = 0;
    let _ = PdhExpandWildCardPathW(
        PCWSTR::null(),
        PCWSTR(pat.as_ptr()),
        PWSTR::null(),
        &mut len,
        PERF_DETAIL_WIZARD.0,
    );
    if len == 0 {
        return Vec::new();
    }
    let mut buf = vec![0u16; len as usize];
    let r = PdhExpandWildCardPathW(
        PCWSTR::null(),
        PCWSTR(pat.as_ptr()),
        PWSTR(buf.as_mut_ptr()),
        &mut len,
        PERF_DETAIL_WIZARD.0,
    );
    if r != PDH_SUCCESS {
        return Vec::new();
    }
    parse_multi_sz(&buf)
}

fn parse_multi_sz(buf: &[u16]) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    for &c in buf {
        if c == 0 {
            if cur.is_empty() {
                break;
            }
            out.push(String::from_utf16_lossy(&cur));
            cur.clear();
        } else {
            cur.push(c);
        }
    }
    out
}

fn to_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}
