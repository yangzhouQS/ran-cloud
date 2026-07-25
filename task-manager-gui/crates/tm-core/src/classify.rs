//! 电源使用估算与进程分组(纯函数)。

use crate::models::{PowerUsage, ProcKind};

/// 由 CPU%(整体占用)与净 IO(bytes/s)估算电源使用档位,对齐 Win11 直觉。
///
/// 阈值参考 Win11 经验:
/// - CPU >= 20% 或 净 IO >= 2MB/s → High
/// - CPU >= 4%  或 净 IO >= 50KB/s → Medium
/// - 否则 → Low
pub fn estimate_power_usage(cpu_pct: f32, net_io_bps: f64) -> PowerUsage {
    let io = net_io_bps as f32;
    if cpu_pct >= 20.0 || io >= 2_000_000.0 {
        PowerUsage::High
    } else if cpu_pct >= 4.0 || io >= 50_000.0 {
        PowerUsage::Medium
    } else {
        PowerUsage::Low
    }
}

/// 进程分组:
/// - 有可见窗口 → App
/// - 可执行路径在 Windows 系统目录 → Windows
/// - 否则 → Background
pub fn classify_kind(_name: &str, exe_path: &str, has_window: bool) -> ProcKind {
    if has_window {
        return ProcKind::App;
    }
    let lower = exe_path.to_ascii_lowercase();
    if lower.contains(r"\windows\system32\")
        || lower.contains(r"\windows\syswow64\")
        || lower.contains(r"\windows\systemapps\")
        || lower.is_empty()
    {
        ProcKind::Windows
    } else {
        ProcKind::Background
    }
}
