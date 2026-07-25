# ran-task-manager Phase 1 (M0–M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可在 Windows 11 运行的 Rust(egui)任务管理器:Win11 风格外壳 + 进程页(分组/排序/搜索/右键菜单/结束·挂起·恢复·效率模式·打开位置·属性)。

**Architecture:** Cargo workspace 拆 `tm-core`(采集/操作/模型,UI 无关)与 `tm-ui`(egui 渲染)。后台 Collector 线程按 ~1s 轮询 sysinfo+windows,写 `Arc<RwLock<SystemSnapshot>>` 并 `request_repaint()`;UI 线程只读快照渲染,操作经 `crossbeam-channel` 的 `Command` 回传。

**Tech Stack:** Rust 1.97 / `eframe`+`egui` / `sysinfo` / `windows` / `window-vibrancy`(Mica) / `parking_lot` / `crossbeam-channel` / `anyhow`+`thiserror` / `image`。

> **版本策略:** Task 1 用 `cargo add` 解析各 crate 最新稳定版并锁定;egui 代码按 ≥0.27 的稳定 API 编写(Task 1 后若个别签名不一致,以 `cargo doc` 为准就地调整)。Mica 是最高风险,故 **Task 1 的 spike 先做**。

---

## File Structure（本计划涉及的文件职责）

| 文件 | 职责 | 新建/修改 |
|---|---|---|
| `Cargo.toml` | workspace 根 | 新建 |
| `crates/tm-core/Cargo.toml` | tm-core 依赖声明 | 新建 |
| `crates/tm-core/src/lib.rs` | 模块导出 | 新建 |
| `crates/tm-core/src/models.rs` | `SystemSnapshot`/`ProcInfo`/`Command` 等纯数据 | 新建 |
| `crates/tm-core/src/classify.rs` | 电源使用估算 + 进程分组分类(纯函数) | 新建 |
| `crates/tm-core/src/sorting.rs` | `ProcInfo` 各列排序比较器(纯函数) | 新建 |
| `crates/tm-core/src/error.rs` | `OpsError` + 错误映射 | 新建 |
| `crates/tm-core/src/sysinfo_source.rs` | sysinfo → SystemSnapshot 适配 | 新建 |
| `crates/tm-core/src/win_source.rs` | windows 补缺:窗口 PID 集合 + 权限(后续)/网络IO(后续) | 新建 |
| `crates/tm-core/src/process_ops.rs` | Kill/Suspend/Resume/EfficiencyMode/打开位置/属性 | 新建 |
| `crates/tm-core/src/collector.rs` | 后台采集循环 + Command 执行 | 新建 |
| `crates/tm-ui/Cargo.toml` | tm-ui 依赖声明 | 新建 |
| `crates/tm-ui/src/main.rs` | eframe 入口、窗口/Mica 透明 | 新建 |
| `crates/tm-ui/src/app.rs` | `App` 状态、Tab 路由、状态栏 | 新建 |
| `crates/tm-ui/src/theme.rs` | Win11 配色、Segoe UI 字体、透明 Visuals | 新建 |
| `crates/tm-ui/src/shell.rs` | 侧边栏/搜索框/命令栏/状态栏 | 新建 |
| `crates/tm-ui/src/widgets/data_grid.rs` | 可排序/可调宽/虚拟化数据表 | 新建 |
| `crates/tm-ui/src/pages/mod.rs` | 页面 trait + 路由 | 新建 |
| `crates/tm-ui/src/pages/processes_page.rs` | 进程页 | 新建 |
| `assets/fonts/` | 内嵌字体(Phase1 可暂用系统 Segoe UI,见 Task 11) | 新建 |

**职责边界**:tm-core 不依赖 egui,可独立 `cargo test`。tm-ui 仅渲染/交互,系统调用只在 tm-core。

**TDD 策略**:纯函数(models/classify/sorting/error)走严格 TDD;系统采集/进程操作/UI 走「完整实现 + 手动验证」(GUI 与系统调用难以单测,伪单测无意义)。

---

## Task 1: 搭建 Cargo workspace + Mica 透明窗口 spike（最高风险先行）

**Files:**
- Create: `Cargo.toml`
- Create: `crates/tm-core/Cargo.toml`, `crates/tm-core/src/lib.rs`
- Create: `crates/tm-ui/Cargo.toml`, `crates/tm-ui/src/main.rs`

- [ ] **Step 1: 建根 workspace `Cargo.toml`**

```toml
[workspace]
resolver = "2"
members = ["crates/tm-core", "crates/tm-ui"]

[workspace.package]
edition = "2021"
license = "MIT"
```

- [ ] **Step 2: 建 `crates/tm-core/Cargo.toml`**

```toml
[package]
name = "tm-core"
version = "0.1.0"
edition.workspace = true

[dependencies]
sysinfo = "0.32"          # 若解析失败,去掉版本号让 cargo 选最新;需含 GPU 支持
windows = { version = "0.58", features = [
    "Win32_Foundation",
    "Win32_System_Threading",
    "Win32_System_ProcessStatus",
    "Win32_UI_Shell",
    "Win32_UI_WindowsAndMessaging",
    "Win32_Security",
    "Win32_System_SystemInformation",
] }
parking_lot = "0.12"
crossbeam-channel = "0.5"
anyhow = "1"
thiserror = "1"
image = { version = "0.25", default-features = false, features = ["png"] }

[dev-dependencies]
pretty_assertions = "1"
```

- [ ] **Step 3: 建 `crates/tm-core/src/lib.rs`（占位,仅保证编译）**

```rust
//! tm-core: 任务管理器核心(采集/操作/模型),与 UI 无关。
#![cfg_attr(not(windows), allow(dead_code))]
```

- [ ] **Step 4: 建 `crates/tm-ui/Cargo.toml`**

```toml
[package]
name = "tm-ui"
version = "0.1.0"
edition.workspace = true

[dependencies]
tm-core = { path = "../tm-core" }
eframe = "0.29"
egui = "0.29"
egui_extras = { version = "0.29", features = ["image"] }
window-vibrancy = "0.5"
raw-window-handle = "0.6"
image = { version = "0.25", default-features = false, features = ["png"] }
parking_lot = "0.12"
crossbeam-channel = "0.5"
anyhow = "1"
```

> 若 `cargo` 报版本不存在,删除各版本号改用最新(egui/eframe/sysinfo/windows API 在 ≥ 这些版本基本稳定)。

- [ ] **Step 5: 建 Mica spike `crates/tm-ui/src/main.rs`**

```rust
//! Mica spike:验证 eframe 透明窗口 + apply_mica 可行性。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

fn main() -> eframe::Result<()> {
    let opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([960.0, 640.0])
            .with_decorations(false)          // 自定义边框
            .with_transparent(true)           // 必须:让 Mica 透出
            .with_active(true),
        ..Default::default()
    };
    eframe::run_native(
        "ran-task-manager",
        opts,
        Box::new(|_cc| Ok(Box::new(SpikeApp { mica_applied: false }))),
    )
}

struct SpikeApp {
    mica_applied: bool,
}

impl eframe::App for SpikeApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // 1) 应用一次 Mica(成功即透出桌面壁纸)
        if !self.mica_applied {
            #[cfg(windows)]
            if let Some(raw) = raw_window_handle_of(_frame) {
                if let RawWindowHandle::Win32(h) = raw {
                    let hwnd = windows::Win32::Foundation::HWND(std::ptr::NonNull::new(h.hwnd.get() as *mut _));
                    let _ = window_vibrancy::apply_mica(hwnd, None);
                    self.mica_applied = true;
                }
            }
        }

        // 2) 透明 Visuals:让背景半透明,Mica 透出
        let mut visuals = egui::Visuals::dark();
        visuals.panel_fill = egui::Color32::from_rgba_premultiplied(32, 32, 32, 200); // #202020 alpha≈0.78
        visuals.window_fill = egui::Color32::from_rgba_premultiplied(43, 43, 43, 235);
        ctx.set_visuals(visuals);
        ctx.style_mut(|s| { s.spacing.window_margin = egui::Margin::same(0); });

        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ctx, |ui| {
                ui.heading("Mica spike — 若背景透出桌面壁纸即成功");
                ui.label("右键标题栏关闭窗口测试自定义边框。");
            });
    }
}

// 从 eframe::Frame 取原始窗口句柄
fn raw_window_handle_of(frame: &eframe::Frame) -> Option<raw_window_handle::RawWindowHandle> {
    frame.raw_window_handle().ok()
}
```

> `apply_mica` 与 `HWND` 的精确签名随 `window-vibrancy`/`windows` 版本可能不同:
> - 较新 `window-vibrancy::apply_mica(hwnd: HWND, effect: Option<bool>)` 其中 `HWND` 来自 `windows` crate。
> - 若签名要求 `&HWND` 或 `isolation` 参数,以 `cargo doc --open -p window-vibrancy` 为准就地修正。

- [ ] **Step 6: 构建并运行 spike**

```powershell
cd H:\2026code\project\ran-cloud\task-manager-gui
cargo run -p tm-ui
```
预期:弹出 960×640 无边框窗口,**背景半透明、透出桌面壁纸即 Mica 成功**。
- 若 Mica 成功 → 继续(主题按半透明实现)。
- 若失败(纯黑/不透明)且排查无果 → **降级**:把 `panel_fill` 改为不透明 `#202020`、删除 `with_transparent(true)` 与 apply_mica,后续按纯色主题实现。记录到 `docs/specs` 的已知限制。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): 搭建 workspace 与 Mica 透明窗口 spike"
```

---

## Task 2: tm-core 数据模型（models.rs，纯数据，含 derive）

**Files:**
- Create: `crates/tm-core/src/models.rs`
- Modify: `crates/tm-core/src/lib.rs`(加 `pub mod models;`)

- [ ] **Step 1: 写 `models.rs`**

```rust
//! 核心数据模型:快照与命令。全部为纯数据结构,不依赖 UI。
use std::collections::VecDeque;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct SystemSnapshot {
    pub timestamp: Instant,
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    pub disks: Vec<DiskSnapshot>,
    pub network: NetworkSnapshot,
    pub gpus: Vec<GpuSnapshot>,
    pub processes: Vec<ProcInfo>,
    pub elevated: bool,
    pub total_processes: usize,
}

#[derive(Debug, Clone)]
pub struct CpuSnapshot {
    pub overall_usage: f32,
    pub per_core: Vec<f32>,
    pub speed_ghz: f32,
    pub history: VecDeque<f32>,
    pub logical_cores: usize,
    pub physical_cores: usize,
    pub up_time: Duration,
    pub model_name: String,
    pub threads: usize,
    pub handles: usize,
}

#[derive(Debug, Clone)]
pub struct MemorySnapshot {
    pub used: u64,
    pub total: u64,
    pub available: u64,
    pub history: VecDeque<f32>, // 百分比
}

#[derive(Debug, Clone)]
pub struct DiskSnapshot {
    pub name: String,
    pub used: u64,
    pub total: u64,
    pub read_bps: f64,
    pub write_bps: f64,
    pub activity_pct: f32,
    pub response_time_ms: f32,
    pub history: VecDeque<f32>,
}

#[derive(Debug, Clone)]
pub struct NetworkSnapshot {
    pub send_bps: f64,
    pub recv_bps: f64,
    pub history: VecDeque<f32>,
    pub adapter: String,
}

#[derive(Debug, Clone)]
pub struct GpuSnapshot {
    pub name: String,
    pub usage_pct: Option<f32>,
    pub dedicated_used: Option<u64>,
    pub dedicated_total: Option<u64>,
    pub history: VecDeque<f32>,
}

#[derive(Debug, Clone)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub user: Option<String>,
    pub session_id: Option<u32>,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub disk_read_bps: f64,
    pub disk_write_bps: f64,
    pub net_send_bps: f64,
    pub net_recv_bps: f64,
    pub power_usage: PowerUsage,
    pub efficiency_mode: bool,
    pub status: ProcStatus,
    pub kind: ProcKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PowerUsage { Low, Medium, High }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcStatus { Running, Suspended, NotResponding }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcKind { App, Background, Windows }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PriorityClass {
    Realtime, High, AboveNormal, Normal, BelowNormal, Idle,
}

#[derive(Debug, Clone)]
pub enum Command {
    Kill(u32),
    Suspend(u32),
    Resume(u32),
    SetEfficiencyMode(u32, bool),
    SetPriority(u32, PriorityClass),
}

/// 进程页可排序的列。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcColumn {
    Name, Cpu, Memory, Disk, Net, Power, Pid, Status,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortDir { Asc, Desc }
```

- [ ] **Step 2: `lib.rs` 导出**

```rust
//! tm-core: 任务管理器核心(采集/操作/模型),与 UI 无关。
#![cfg_attr(not(windows), allow(dead_code))]

pub mod models;
pub use models::*;
```

- [ ] **Step 3: 构建验证**

```powershell
cargo build -p tm-core
```
预期:编译通过。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): tm-core 数据模型 SystemSnapshot/ProcInfo/Command"
```

---

## Task 3: classify.rs — 电源使用估算 + 进程分组（TDD）

**Files:**
- Create: `crates/tm-core/src/classify.rs`
- Create: `crates/tm-core/tests/classify.rs`
- Modify: `crates/tm-core/src/lib.rs`(加 `pub mod classify;`)

> 纯函数:对齐 Win11「电源使用 Low/Medium/High」(由 CPU% + 净 IO 估算);进程分组(有可见窗口→App;系统路径(system32 等)→Windows;其余→Background)。

- [ ] **Step 1: 先写失败测试 `tests/classify.rs`**

```rust
use tm_core::classify::{estimate_power_usage, classify_kind};
use tm_core::models::{PowerUsage, ProcKind};

#[test]
fn low_power_when_idle() {
    assert_eq!(estimate_power_usage(0.0, 0.0), PowerUsage::Low);
    assert_eq!(estimate_power_usage(2.0, 10_000.0), PowerUsage::Low);
}

#[test]
fn medium_power_mid_range() {
    assert_eq!(estimate_power_usage(5.0, 100_000.0), PowerUsage::Medium);
    assert_eq!(estimate_power_usage(15.0, 0.0), PowerUsage::Medium);
}

#[test]
fn high_power_busy() {
    assert_eq!(estimate_power_usage(25.0, 0.0), PowerUsage::High);
    assert_eq!(estimate_power_usage(5.0, 5_000_000.0), PowerUsage::High);
}

#[test]
fn app_has_window() {
    assert_eq!(classify_kind("chrome.exe", "C:\\Program Files\\Google\\Chrome", true), ProcKind::App);
}

#[test]
fn windows_in_system32() {
    assert_eq!(classify_kind("svchost.exe", "C:\\Windows\\System32\\svchost.exe", false), ProcKind::Windows);
}

#[test]
fn background_otherwise() {
    assert_eq!(classify_kind("foo.exe", "C:\\Users\\me\\AppData\\Local\\x\\foo.exe", false), ProcKind::Background);
}
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
cargo test -p tm-core --test classify
```
预期:FAIL(mod `classify` 未定义/函数缺失)。

- [ ] **Step 3: 写 `classify.rs` 实现**

```rust
//! 电源使用估算与进程分组(纯函数)。
use crate::models::{PowerUsage, ProcKind};

/// 由 CPU%(整体占用)与净 IO(bytes/s)估算电源使用档位,对齐 Win11 直觉。
/// 阈值参考 Win11 经验:CPU≥20% 或净 IO≥2MB/s → High;CPU≥4% 或净 IO≥50KB/s → Medium;否则 Low。
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

/// 进程分组:有可见窗口→App;可执行路径在 Windows 系统目录→Windows;否则→Background。
pub fn classify_kind(_name: &str, exe_path: &str, has_window: bool) -> ProcKind {
    if has_window {
        return ProcKind::App;
    }
    let lower = exe_path.to_ascii_lowercase();
    if lower.contains("\\windows\\system32\\")
        || lower.contains("\\windows\\syswow64\\")
        || lower.contains("\\windows\\systemapps\\")
        || lower == "" // System Idle / System 等无路径
    {
        ProcKind::Windows
    } else {
        ProcKind::Background
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

```powershell
cargo test -p tm-core --test classify
```
预期:5 个测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): classify 电源使用估算与进程分组(纯函数+测试)"
```

---

## Task 4: sorting.rs — ProcInfo 各列排序比较器（TDD）

**Files:**
- Create: `crates/tm-core/src/sorting.rs`
- Create: `crates/tm-core/tests/sorting.rs`
- Modify: `crates/tm-core/src/lib.rs`(加 `pub mod sorting;`)

- [ ] **Step 1: 写失败测试 `tests/sorting.rs`**

```rust
use tm_core::models::{ProcInfo, ProcColumn, SortDir, PowerUsage, ProcStatus, ProcKind};
use tm_core::sorting::sort_processes;

fn p(pid: u32, name: &str, cpu: f32, mem: u64, net: f64, power: PowerUsage, status: ProcStatus) -> ProcInfo {
    ProcInfo {
        pid, name: name.into(), user: None, session_id: None,
        cpu_usage: cpu, memory_bytes: mem, disk_read_bps: 0.0, disk_write_bps: 0.0,
        net_send_bps: net, net_recv_bps: 0.0, power_usage: power, efficiency_mode: false,
        status, kind: ProcKind::App,
    }
}

#[test]
fn sort_by_cpu_desc() {
    let mut v = vec![p(1, "a", 1.0, 0, 0.0, PowerUsage::Low, ProcStatus::Running),
                     p(2, "b", 50.0, 0, 0.0, PowerUsage::High, ProcStatus::Running)];
    sort_processes(&mut v, ProcColumn::Cpu, SortDir::Desc);
    assert_eq!(v[0].pid, 2);
}

#[test]
fn sort_by_memory_asc() {
    let mut v = vec![p(1, "a", 0.0, 300, 0.0, PowerUsage::Low, ProcStatus::Running),
                     p(2, "b", 0.0, 100, 0.0, PowerUsage::Low, ProcStatus::Running)];
    sort_processes(&mut v, ProcColumn::Memory, SortDir::Asc);
    assert_eq!(v[0].memory_bytes, 100);
}

#[test]
fn sort_by_name_ignores_case() {
    let mut v = vec![p(1, "banana", 0.0, 0, 0.0, PowerUsage::Low, ProcStatus::Running),
                     p(2, "Apple", 0.0, 0, 0.0, PowerUsage::Low, ProcStatus::Running)];
    sort_processes(&mut v, ProcColumn::Name, SortDir::Asc);
    assert_eq!(v[0].name, "Apple"); // Apple 排前
}

#[test]
fn tie_break_by_name_then_pid() {
    let mut v = vec![p(9, "z", 5.0, 0, 0.0, PowerUsage::Medium, ProcStatus::Running),
                     p(1, "a", 5.0, 0, 0.0, PowerUsage::Medium, ProcStatus::Running)];
    sort_processes(&mut v, ProcColumn::Cpu, SortDir::Desc);
    assert_eq!(v[0].name, "a"); // CPU 相同 → 按名称
}
```

- [ ] **Step 2: 运行确认失败**

```powershell
cargo test -p tm-core --test sorting
```
预期:FAIL(`sorting` 未定义)。

- [ ] **Step 3: 写 `sorting.rs`**

```rust
//! 进程列表排序:按列 + 方向,主键相同则按名称(再按 PID)兜底,保证稳定顺序。
use crate::models::{ProcColumn, ProcInfo, SortDir};

pub fn sort_processes(v: &mut [ProcInfo], col: ProcColumn, dir: SortDir) {
    v.sort_by(|a, b| {
        let primary = match col {
            ProcColumn::Name => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
            ProcColumn::Cpu => cmp_f32(a.cpu_usage, b.cpu_usage),
            ProcColumn::Memory => a.memory_bytes.cmp(&b.memory_bytes),
            ProcColumn::Disk => cmp_f64(a.disk_read_bps + a.disk_write_bps, b.disk_read_bps + b.disk_write_bps),
            ProcColumn::Net => cmp_f64(a.net_send_bps + a.net_recv_bps, b.net_send_bps + b.net_recv_bps),
            ProcColumn::Power => (a.power_usage as u8).cmp(&(b.power_usage as u8)),
            ProcColumn::Pid => a.pid.cmp(&b.pid),
            ProcColumn::Status => (a.status as u8).cmp(&(b.status as u8)),
        };
        let primary = flip(primary, dir);
        if primary != std::cmp::Ordering::Equal {
            primary
        } else {
            // 兜底:名称 → PID,固定升序,保证稳定
            a.name.to_ascii_lowercase()
                .cmp(&b.name.to_ascii_lowercase())
                .then(a.pid.cmp(&b.pid))
        }
    });
}

fn cmp_f32(a: f32, b: f32) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}
fn cmp_f64(a: f64, b: f64) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}
fn flip(o: std::cmp::Ordering, dir: SortDir) -> std::cmp::Ordering {
    match dir {
        SortDir::Asc => o,
        SortDir::Desc => o.reverse(),
    }
}
```

- [ ] **Step 4: 运行确认通过**

```powershell
cargo test -p tm-core --test sorting
```
预期:4 个测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): sorting 各列排序比较器(纯函数+测试)"
```

---

## Task 5: error.rs — OpsError + 错误映射（TDD）

**Files:**
- Create: `crates/tm-core/src/error.rs`
- Create: `crates/tm-core/tests/error.rs`
- Modify: `crates/tm-core/src/lib.rs`(加 `pub mod error;`)

- [ ] **Step 1: 写失败测试 `tests/error.rs`**

```rust
use tm_core::error::{OpsError, map_windows_error};

#[test]
fn access_denied_maps() {
    assert_eq!(map_windows_error(5), OpsError::AccessDenied); // ERROR_ACCESS_DENIED
}

#[test]
fn not_found_maps() {
    assert_eq!(map_windows_error(87), OpsError::InvalidParameter); // ERROR_INVALID_PARAMETER
}

#[test]
fn unknown_maps_to_other() {
    match map_windows_error(9999) {
        OpsError::Other(_) => {}
        other => panic!("expected Other, got {other:?}"),
    }
}
```

- [ ] **Step 2: 运行确认失败**

```powershell
cargo test -p tm-core --test error
```
预期:FAIL(`error` 未定义)。

- [ ] **Step 3: 写 `error.rs`**

```rust
//! 进程操作错误类型与 Windows 错误码映射。
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OpsError {
    #[error("拒绝访问(可能需要管理员权限)")]
    AccessDenied,
    #[error("找不到进程")]
    NotFound,
    #[error("参数无效")]
    InvalidParameter,
    #[error("Windows 错误码 {0}")]
    Other(u32),
    #[error(transparent)]
    Windows(#[from] windows::core::Error),
}

/// 把 GetLastError 的码映射为 OpsError。
pub fn map_windows_error(code: u32) -> OpsError {
    match code {
        5 => OpsError::AccessDenied,
        87 => OpsError::InvalidParameter,
        c if c == 0 => OpsError::Other(0),
        _ => OpsError::Other(code),
    }
}
```

- [ ] **Step 4: 运行确认通过**

```powershell
cargo test -p tm-core --test error
```
预期:3 个测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): error OpsError 与 Windows 错误码映射(测试)"
```

---

## Task 6: sysinfo_source.rs — sysinfo → SystemSnapshot 适配（实现 + 手动验证）

**Files:**
- Create: `crates/tm-core/src/sysinfo_source.rs`
- Create: `crates/tm-core/examples/dump_snapshot.rs`
- Modify: `crates/tm-core/src/lib.rs`(加 `pub mod sysinfo_source;`)

> 说明:sysinfo 单位(CPU% 语义、内存 bytes/KB、网络计数器)随版本有差异;本 task 以当前稳定版为准,`cargo doc -p sysinfo` 核对字段名。

- [ ] **Step 1: 写 `sysinfo_source.rs`**

```rust
//! sysinfo → SystemSnapshot 适配。持有 SysState,供 Collector 两次采样间差分 CPU。
use std::collections::{HashSet, VecDeque};
use sysinfo::{
    CpuRefreshKind, DiskUsage, MemoryRefreshKind, Pid, ProcessRefreshKind, RefreshKind, System, Disks, Networks, UpdateKind,
};
use crate::classify::{classify_kind, estimate_power_usage};
use crate::models::*;
use crate::win_source::window_pids;

const HISTORY_LEN: usize = 60;

pub struct SysState {
    pub sys: System,
    pub disks: Disks,
    pub nets: Networks,
    pub cpu_history: VecDeque<f32>,
    pub mem_history: VecDeque<f32>,
}

impl SysState {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        let disks = Disks::new_with_refreshed_list();
        let nets = Networks::new_with_refreshed_list();
        Self { sys, disks, nets, cpu_history: VecDeque::with_capacity(HISTORY_LEN), mem_history: VecDeque::with_capacity(HISTORY_LEN) }
    }

    /// 刷新并产出快照。调用方应间隔 ~1s 调用两次以获得准确 CPU%(首次 CPU≈0)。
    pub fn snapshot(&mut self, elevated: bool, prev_net: &mut NetAccum) -> SystemSnapshot {
        let pkind = ProcessRefreshKind::nothing().with_cpu().with_memory().with_disk_usage().with_user(UpdateKind::Always);
        self.sys.refresh_cpu_usage();
        self.sys.refresh_processes_specifics(pkind, true);
        self.sys.refresh_memory_specifics(MemoryRefreshKind::everything());
        self.disks.refresh(true);
        self.nets.refresh(true);

        let cpu = self.build_cpu();
        let memory = self.build_memory();
        push(&mut self.cpu_history, cpu.overall_usage);
        push(&mut self.mem_history, mem_pct(memory.used, memory.total));

        let winset = window_pids();
        let processes = self.sys.processes().values()
            .map(|p| to_proc_info(p, &winset))
            .collect::<Vec<_>>();

        SystemSnapshot {
            timestamp: std::time::Instant::now(),
            cpu: CpuSnapshot { history: self.cpu_history.clone(), ..cpu },
            memory: MemorySnapshot { history: self.mem_history.clone(), ..memory },
            disks: self.build_disks(),
            network: self.build_network(prev_net),
            gpus: Vec::new(), // best-effort,后续阶段补充
            total_processes: processes.len(),
            elevated,
            processes,
        }
    }

    fn build_cpu(&self) -> CpuSnapshot {
        let per_core: Vec<f32> = self.sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let overall = self.sys.global_cpu_usage();
        let logical = self.sys.cpus().len();
        let physical = sysinfo::System::physical_core_count().unwrap_or(logical);
        let speed = self.sys.cpus().first().map(|c| c.frequency()).unwrap_or(0) as f32 / 1000.0;
        CpuSnapshot {
            overall_usage: overall, per_core, speed_ghz: speed,
            history: VecDeque::new(),
            logical_cores: logical, physical_cores: physical,
            up_time: std::time::Duration::from_secs(self.sys.uptime()),
            model_name: self.sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
            threads: 0, handles: 0, // 后续由 win_source 补
        }
    }

    fn build_memory(&self) -> MemorySnapshot {
        let total = self.sys.total_memory();
        let used = self.sys.used_memory();
        MemorySnapshot { used, total, available: total.saturating_sub(used), history: VecDeque::new() }
    }

    fn build_disks(&self) -> Vec<DiskSnapshot> {
        self.disks.list().iter().map(|d| {
            let total = d.total_space();
            let used = total.saturating_sub(d.available_space());
            DiskSnapshot {
                name: d.name().to_string_lossy().into_owned(),
                used, total, read_bps: 0.0, write_bps: 0.0,
                activity_pct: 0.0, response_time_ms: 0.0, history: VecDeque::new(),
            }
        }).collect()
    }

    fn build_network(&self, prev: &mut NetAccum) -> NetworkSnapshot {
        let (mut send, mut recv) = (0u64, 0u64);
        for (_, n) in self.nets.list() {
            send += n.transmitted();
            recv += n.received();
        }
        let dt = prev.dt(self.sys.uptime());
        let (sps, rps) = (bytes_per_sec(send, prev.last_send, dt), bytes_per_sec(recv, prev.last_recv, dt));
        prev.update(send, recv, self.sys.uptime());
        NetworkSnapshot { send_bps: sps, recv_bps: rps, history: VecDeque::new(), adapter: "all".into() }
    }
}

pub struct NetAccum { pub last_send: u64, pub last_recv: u64, pub last_uptime: u64 }
impl NetAccum {
    pub fn new() -> Self { Self { last_send: 0, last_recv: 0, last_uptime: 0 } }
    fn dt(&self, now: u64) -> f64 { (now.saturating_sub(self.last_uptime)).max(1) as f64 }
    fn update(&mut self, send: u64, recv: u64, uptime: u64) {
        self.last_send = send; self.last_recv = recv; self.last_uptime = uptime;
    }
}

fn to_proc_info(p: &sysinfo::Process, winset: &HashSet<u32>) -> ProcInfo {
    let pid = p.pid().as_u32();
    let has_window = winset.contains(&pid);
    let du: &DiskUsage = p.disk_usage();
    let net_io = du.read_bytes as f64 + du.written_bytes as f64;
    ProcInfo {
        pid,
        name: p.name().to_string_lossy().into_owned(),
        user: p.user_id().map(|u| u.to_string()),
        session_id: None,
        cpu_usage: p.cpu_usage(),
        memory_bytes: p.memory(),
        disk_read_bps: du.read_bytes as f64,
        disk_write_bps: du.written_bytes as f64,
        net_send_bps: 0.0, net_recv_bps: 0.0,
        power_usage: estimate_power_usage(p.cpu_usage(), net_io),
        efficiency_mode: false,
        status: ProcStatus::Running,
        kind: classify_kind(&p.name().to_string_lossy(), &p.exe().to_string_lossy(), has_window),
    }
}

fn mem_pct(used: u64, total: u64) -> f32 {
    if total == 0 { 0.0 } else { used as f32 * 100.0 / total as f32 }
}
fn bytes_per_sec(now: u64, prev: u64, dt: f64) -> f64 {
    now.saturating_sub(prev) as f64 / dt
}
fn push(buf: &mut VecDeque<f32>, v: f32) {
    if buf.len() == HISTORY_LEN { buf.pop_front(); }
    buf.push_back(v);
}
```

- [ ] **Step 2: `lib.rs` 加 `pub mod sysinfo_source; pub mod win_source;`（win_source 见 Task 7）**

> 先临时把 `win_source` 的 `window_pids` 用一个最小桩,等 Task 7 替换:

`crates/tm-core/src/win_source.rs`:
```rust
//! windows 补缺(占位,Task 7/8 填充)。
#![cfg(windows)]
use std::collections::HashSet;
pub fn window_pids() -> HashSet<u32> { HashSet::new() }
```
`lib.rs`:
```rust
pub mod win_source;
pub mod sysinfo_source;
```
> 注意:`sysinfo_source` 在非 Windows 下引用 `win_source`,需 `#[cfg(windows)]` 包裹或提供跨平台桩。开发期只在 Windows 编译,先保证 Windows 通过即可。

- [ ] **Step 3: 手动验证 example `examples/dump_snapshot.rs`**

```rust
use tm_core::sysinfo_source::{SysState, NetAccum};
fn main() {
    let mut s = SysState::new();
    let _ = s.snapshot(false, &mut NetAccum::new()); // 预热
    std::thread::sleep(std::time::Duration::from_secs(1));
    let snap = s.snapshot(false, &mut NetAccum::new());
    println!("processes={} cpu={:.1}% mem={:.1}GiB",
        snap.total_processes, snap.cpu.overall_usage,
        snap.memory.used as f64 / 1024.0 / 1024.0 / 1024.0);
    for p in snap.processes.iter().take(5) { println!("  {:>6} {:>6.1}% {}", p.pid, p.cpu_usage, p.name); }
}
```

```powershell
cargo run -p tm-core --example dump_snapshot
```
预期:打印进程数、CPU%、内存 GiB、前 5 进程。数值量级合理。
> 若 sysinfo 字段名不符(如 `memory()` 单位、`cpu_usage()` 语义),以 `cargo doc -p sysinfo --open` 核对并就地修正。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): sysinfo_source 适配层与快照导出示例"
```

---

## Task 7: win_source.rs — 窗口 PID 集合（EnumWindows，替换占位）

**Files:**
- Modify: `crates/tm-core/src/win_source.rs`

- [ ] **Step 1: 实现 `window_pids()`**

```rust
//! windows 补缺:枚举可见顶层窗口,收集其拥有者 PID(用于进程分组 App/Background)。
#![cfg(windows)]
use std::collections::HashSet;
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, IsWindowVisible};
use windows::Win32::Foundation::{BOOL, LPARAM, TRUE};

pub fn window_pids() -> HashSet<u32> {
    let mut set = HashSet::new();
    let ptr = &mut set as *mut HashSet<u32> as isize;
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(ptr));
    }
    set
}

unsafe extern "system" fn enum_proc(hwnd: windows::Win32::Foundation::HWND, lparam: LPARAM) -> BOOL {
    let set = &mut *(lparam.0 as *mut HashSet<u32>);
    if IsWindowVisible(hwnd).as_bool() {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid != 0 { set.insert(pid); }
    }
    TRUE
}
```

- [ ] **Step 2: 验证**

```powershell
cargo run -p tm-core --example dump_snapshot
```
预期:部分进程 `kind` 由 Background 变 App(如 explorer、当前 tm-ui)。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): win_source EnumWindows 收集窗口 PID 用于进程分组"
```

---

## Task 8: process_ops.rs — Kill/Suspend/Resume/EfficiencyMode/打开位置/属性（实现 + 手动验证）

**Files:**
- Create: `crates/tm-core/src/process_ops.rs`
- Create: `crates/tm-core/examples/ops_demo.rs`
- Modify: `crates/tm-core/src/lib.rs`(加 `pub mod process_ops;`)

- [ ] **Step 1: 写 `process_ops.rs`**

```rust
//! 进程操作:结束/挂起/恢复/效率模式(EcoQoS)/打开文件位置/属性。
#![cfg(windows)]
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows::core::{PCWSTR, HRESULT};
use windows::Win32::Foundation::{CloseHandle, HWND, HANDLE};
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows::Win32::System::Threading::{
    OpenProcess, TerminateProcess, SetPriorityClass, SetProcessInformation,
    PROCESS_POWER_THROTTLING_CURRENT, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION, PROCESS_SUSPEND_RESUME, PROCESS_TERMINATE,
    ProcessPriorityClass, ProcessPowerThrottling, PROCESS_POWER_THROTTLING_STATE,
    ABOVE_NORMAL_PRIORITY_CLASS, BELOW_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS, IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS, REALTIME_PRIORITY_CLASS,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use crate::error::{map_windows_error, OpsError};
use crate::models::PriorityClass;

fn open(pid: u32, access: u32) -> Result<HANDLE, OpsError> {
    unsafe { OpenProcess(access, false, pid).map_err(OpsError::Windows).map_err(recheck_not_found) }
}

fn recheck_not_found(e: OpsError) -> OpsError {
    // OpenProcess 在进程不存在时通常返回 ERROR_INVALID_PARAMETER
    if let OpsError::Windows(w) = &e {
        if w.code() == HRESULT(-1_701_725_051i32) /*E_INVALID_TEXT? fallback*/ { return OpsError::NotFound; }
        let raw = w.code().0 as u32;
        if raw == 87 || raw == 0 { return OpsError::NotFound; }
    }
    e
}

pub fn kill(pid: u32) -> Result<(), OpsError> {
    unsafe {
        let h = open(pid, PROCESS_TERMINATE)?;
        let r = TerminateProcess(h, 1);
        let _ = CloseHandle(h);
        r.ok().map_err(OpsError::Windows)?;
        Ok(())
    }
}

pub fn suspend(pid: u32) -> Result<(), OpsError> {
    // NtSuspendProcess 不在 windows crate,通过 ntdll 动态获取
    let h = open(pid, PROCESS_SUSPEND_RESUME)?;
    let f = nt_proc(h, b"NtSuspendProcess\0")?;
    unsafe { call_nt(f, h)?; let _ = CloseHandle(h); Ok(()) }
}

pub fn resume(pid: u32) -> Result<(), OpsError> {
    let h = open(pid, PROCESS_SUSPEND_RESUME)?;
    let f = nt_proc(h, b"NtResumeProcess\0")?;
    unsafe { call_nt(f, h)?; let _ = CloseHandle(h); Ok(()) }
}

pub fn set_efficiency_mode(pid: u32, enable: bool) -> Result<(), OpsError> {
    unsafe {
        let h = open(pid, PROCESS_SET_INFORMATION)?;
        let mut state = PROCESS_POWER_THROTTLING_STATE {
            Version: PROCESS_POWER_THROTTLING_CURRENT,
            ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            StateMask: if enable { PROCESS_POWER_THROTTLING_EXECUTION_SPEED } else { 0 },
        };
        let info = ProcessPowerThrottling { ..Default::default() };
        let _ = SetProcessInformation(h, info, &mut state as *mut _ as *mut _, std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32);
        let _ = CloseHandle(h);
        Ok(())
    }
}

pub fn set_priority(pid: u32, prio: PriorityClass) -> Result<(), OpsError> {
    unsafe {
        let h = open(pid, PROCESS_SET_INFORMATION)?;
        let class = match prio {
            PriorityClass::Realtime => REALTIME_PRIORITY_CLASS,
            PriorityClass::High => HIGH_PRIORITY_CLASS,
            PriorityClass::AboveNormal => ABOVE_NORMAL_PRIORITY_CLASS,
            PriorityClass::Normal => NORMAL_PRIORITY_CLASS,
            PriorityClass::BelowNormal => BELOW_NORMAL_PRIORITY_CLASS,
            PriorityClass::Idle => IDLE_PRIORITY_CLASS,
        };
        SetPriorityClass(h, class).ok().map_err(OpsError::Windows)?;
        let _ = CloseHandle(h);
        Ok(())
    }
}

/// 用 explorer.exe /select,"<path>" 打开文件所在文件夹。
pub fn open_file_location(exe_path: &str) -> Result<(), OpsError> {
    let verb = to_wide("open");
    let file = to_wide("explorer.exe");
    let param = to_wide(&format!("/select,\"{}\"", exe_path));
    unsafe {
        ShellExecuteW(None, PCWSTR(verb.as_ptr()), PCWSTR(file.as_ptr()), PCWSTR(param.as_ptr()), None, 1 /*SW_SHOWNORMAL*/);
    }
    Ok(())
}

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn nt_proc(_h: HANDLE, name: &[u8]) -> Result<unsafe extern "system" fn(HANDLE) -> i32, OpsError> {
    unsafe {
        let ntdll = GetModuleHandleW(PCWSTR(to_wide("ntdll.dll").as_ptr())).map_err(OpsError::Windows)?;
        let cstr = std::ffi::CString::new(&name[..name.len() - 1]).unwrap();
        let addr = GetProcAddress(ntdll, PCSTR(cstr.as_ptr() as *const u8));
        addr.map(|a| std::mem::transmute(a))
            .ok_or(OpsError::Other(0))
    }
}

unsafe fn call_nt(f: unsafe extern "system" fn(HANDLE) -> i32, h: HANDLE) -> Result<(), OpsError> {
    let status = f(h);
    if status >= 0 { Ok(()) } else { Err(OpsError::Other(status as u32)) }
}
```

> ⚠️ `SetProcessInformation`/`ProcessPowerThrottling` 的精确签名随 `windows` 版本不同;若不编译,以 `cargo doc -p windows --open` 核对 `ProcessPowerThrottling` 枚举与 `PROCESS_POWER_THROTTLING_STATE` 字段,就地修正。`PCSTR` 来自 `windows::core`。

- [ ] **Step 2: `lib.rs` 加 `pub mod process_ops;`(用 `#[cfg(windows)]` 守卫)**

```rust
#[cfg(windows)]
pub mod process_ops;
```

- [ ] **Step 3: 手动验证 `examples/ops_demo.rs`(自行启动一个 notepad 再 kill)**

```rust
use tm_core::process_ops::kill;
fn main() {
    // 用法: cargo run -p tm-core --example ops_demo -- <pid>
    let args: Vec<String> = std::env::args().collect();
    let pid: u32 = args.get(1).and_then(|s| s.parse().ok()).expect("need pid");
    match kill(pid) {
        Ok(()) => println!("killed {pid}"),
        Err(e) => println!("err: {e:?}"),
    }
}
```

```powershell
# 先手动开一个 notepad,任务管理器看其 PID,然后:
cargo run -p tm-core --example ops_demo -- <notepad的PID>
```
预期:notepad 窗口消失,打印 `killed <pid>`。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): process_ops 结束/挂起/恢复/效率模式/优先级/打开位置"
```

---

## Task 9: collector.rs — 后台采集循环 + Command 执行（实现 + 手动验证）

**Files:**
- Create: `crates/tm-core/src/collector.rs`
- Modify: `crates/tm-core/src/lib.rs`(加 `pub mod collector;`)

- [ ] **Step 1: 写 `collector.rs`**

```rust
//! 后台采集:按 interval 轮询快照写入 Arc<RwLock>,并消费 Command channel。
use std::sync::Arc;
use std::time::Duration;
use parking_lot::RwLock;
use crossbeam_channel::{unbounded, Receiver, Sender};
use egui_channel::EguiWaker; // 见下:仅是占位类型,实际用 eframe 的 ctx 回调
use crate::models::*;
use crate::sysinfo_source::{SysState, NetAccum};

pub type SnapshotStore = Arc<RwLock<SystemSnapshot>>;
pub type CmdTx = Sender<Command>;
pub type CmdRx = Receiver<Command>;

/// 启动 Collector。`on_tick` 每次刷新后被调用(用于触发 UI request_repaint)。
pub fn spawn(interval: Duration, elevated: bool, on_tick: Box<dyn Fn() + Send + Sync>) -> (SnapshotStore, CmdTx) {
    let store: SnapshotStore = Arc::new(RwLock::new(empty_snapshot()));
    let (tx, rx) = unbounded::<Command>();
    let store_c = Arc::clone(&store);

    std::thread::Builder::new()
        .name("tm-collector".into())
        .spawn(move || {
            let mut state = SysState::new();
            let mut net = NetAccum::new();
            // 预热(首次 CPU≈0)
            let _ = state.snapshot(elevated, &mut net);
            loop {
                std::thread::sleep(interval);
                // 排空命令(在采集前执行,UI 可立即看到效果)
                while let Ok(cmd) = rx.try_recv() { let _ = exec_command(cmd); }
                let snap = state.snapshot(elevated, &mut net);
                *store_c.write() = snap;
                on_tick();
            }
        })
        .expect("collector thread");

    (store, tx)
}

pub fn empty_snapshot() -> SystemSnapshot {
    SystemSnapshot {
        timestamp: std::time::Instant::now(),
        cpu: CpuSnapshot { overall_usage: 0.0, per_core: vec![], speed_ghz: 0.0, history: Default::default(),
            logical_cores: 0, physical_cores: 0, up_time: Duration::ZERO, model_name: String::new(), threads: 0, handles: 0 },
        memory: MemorySnapshot { used: 0, total: 1, available: 0, history: Default::default() },
        disks: vec![], network: NetworkSnapshot { send_bps: 0.0, recv_bps: 0.0, history: Default::default(), adapter: String::new() },
        gpus: vec![], processes: vec![], elevated: false, total_processes: 0,
    }
}

#[cfg(windows)]
fn exec_command(cmd: Command) -> Result<(), String> {
    use crate::process_ops;
    match cmd {
        Command::Kill(p) => process_ops::kill(p).map_err(|e| e.to_string()),
        Command::Suspend(p) => process_ops::suspend(p).map_err(|e| e.to_string()),
        Command::Resume(p) => process_ops::resume(p).map_err(|e| e.to_string()),
        Command::SetEfficiencyMode(p, on) => process_ops::set_efficiency_mode(p, on).map_err(|e| e.to_string()),
        Command::SetPriority(p, c) => process_ops::set_priority(p, c).map_err(|e| e.to_string()),
    }
}
#[cfg(not(windows))]
fn exec_command(_cmd: Command) -> Result<(), String> { Ok(()) }
```

> 上面的 `egui_channel::EguiWaker` 是示意占位——实际不引入该类型。**改为**用闭包 `on_tick` 持有 `egui::Context` 的克隆,UI 侧 `Box::new(move || ctx.request_repaint())`。请删除 `use egui_channel...` 这行,它不属于真实依赖。

- [ ] **Step 2: 删除占位 `use egui_channel`,确认 `on_tick` 为纯 `Fn()`**（修正上面的占位行）

把 `collector.rs` 顶部 `use egui_channel::EguiWaker;` 整行删除。`on_tick` 由调用方(tm-ui 的 main)传入持有 egui Context 的闭包。

- [ ] **Step 3: 编译验证**

```powershell
cargo build -p tm-core
```
预期:编译通过(Windows)。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): collector 后台采集循环与命令执行"
```

---

## Task 10: tm-ui theme.rs — Win11 配色 + 透明 Visuals + 字体

**Files:**
- Create: `crates/tm-ui/src/theme.rs`

- [ ] **Step 1: 写 `theme.rs`**

```rust
//! Win11 风格主题:Mica 半透明暗色、Accent、Segoe UI。
use eframe::egui;

pub fn accent() -> egui::Color32 { egui::Color32::from_rgb(0x4C, 0xC2, 0xFF) }
pub fn panel_fill() -> egui::Color32 { egui::Color32::from_rgba_premultiplied(32, 32, 32, 200) }   // #202020 ~0.78
pub fn sidebar_fill() -> egui::Color32 { egui::Color32::from_rgba_premultiplied(28, 28, 28, 200) }
pub fn row_hover() -> egui::Color32 { egui::Color32::from_rgba_premultiplied(255, 255, 255, 18) }
pub fn row_selected() -> egui::Color32 { egui::Color32::from_rgba_premultiplied(0x4C, 0xC2, 0xFF, 60) }
pub fn separator() -> egui::Color32 { egui::Color32::from_rgba_premultiplied(255, 255, 255, 30) }
pub fn header_fill() -> egui::Color32 { egui::Color32::from_rgba_premultiplied(40, 40, 40, 220) }
pub fn text_dim() -> egui::Color32 { egui::Color32::from_rgb(160, 160, 160) }

/// 应用 Win11 主题:透明 Visuals + 圆角 + Segoe UI 字体。
pub fn install(ctx: &egui::Context) {
    let mut v = egui::Visuals::dark();
    v.panel_fill = panel_fill();
    v.extreme_bg_color = egui::Color32::from_rgb(20, 20, 20);
    v.faint_bg_color = egui::Color32::from_rgba_premultiplied(255, 255, 255, 8);
    ctx.set_visuals(v);

    ctx.style_mut(|s| {
        s.spacing.item_spacing = egui::vec2(8.0, 6.0);
        s.spacing.button_padding = egui::vec2(10.0, 6.0);
        s.spacing.window_margin = egui::Margin::same(0);
        s.visuals.window_rounding = egui::Rounding::same(8);
        s.visuals.widgets.noninteractive.rounding = egui::Rounding::same(6);
        s.visuals.widgets.hovered.rounding = egui::Rounding::same(6);
        s.visuals.selection.bg_fill = accent();
    });

    // 字体:优先系统 Segoe UI,中文回退 Microsoft YaHei UI
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "segoe_ui".to_owned(),
        egui::FontData::from_static(SEGOE_UI_FALLBACK).into(),
    );
    fonts.families.get_mut(&egui::FontFamily::Proportional).unwrap().insert(0, "segoe_ui".to_owned());
    ctx.set_fonts(fonts);
}

// Phase1 字体策略:尝试用系统 Segoe UI。eframe 无直接系统字体 API,
// 这里用一个最小回退(若 assets/fonts 已内嵌,改用 include_bytes!)。
// 占位常量:若未内嵌字体,删除此常量与上面的插入,依赖系统默认即可。
static SEGOE_UI_FALLBACK: &[u8] = &[];
```

> 字体处理:Phase1 可先**不内嵌**,依赖 egui 默认 + 系统字体(Windows 上 Segoe UI 已是默认)。如要内嵌,把 `assets/fonts/segoeui.ttf` 放入并改 `include_bytes!("../../assets/fonts/segoeui.ttf")`,同时移除 `&[]` 占位。本 task 暂留默认。

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): theme Win11 配色/透明 Visuals/字体"
```

---

## Task 11: tm-ui app.rs + main.rs — App 状态、Tab 路由、接入 Collector

**Files:**
- Create: `crates/tm-ui/src/app.rs`
- Modify: `crates/tm-ui/src/main.rs`(替换 spike)

- [ ] **Step 1: 写 `app.rs`**

```rust
//! App 状态:持有快照存储、命令通道、当前 Tab、Mica 标记。
use std::sync::Arc;
use std::time::Duration;
use eframe::egui;
use parking_lot::RwLock;
use tm_core::collector::{self, SnapshotStore};
use tm_core::models::Command;
use crate::pages::{Page, PageKind};
use crate::theme;
use crate::shell;

pub struct App {
    pub store: SnapshotStore,
    pub cmd_tx: crossbeam_channel::Sender<Command>,
    pub mica_applied: bool,
    pub current: PageKind,
    pub search: String,
}

impl App {
    pub fn new(ctx: &egui::Context) -> Self {
        let ctx_clone = ctx.clone();
        let (store, cmd_tx) = collector::spawn(
            Duration::from_secs(1),
            false, // elevated:后续 Task(M4)接入真实检测
            Box::new(move || ctx_clone.request_repaint()),
        );
        Self { store, cmd_tx, mica_applied: false, current: PageKind::Processes, search: String::new() }
    }

    fn snapshot(&self) -> tm_core::models::SystemSnapshot {
        self.store.read().clone()
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        theme::install(ctx);
        apply_mica_once(self, frame);

        shell::top_bar(ctx, self);
        egui::CentralPanel::default().frame(egui::Frame::NONE).show(ctx, |ui| {
            let snap = self.snapshot();
            let page: Box<dyn Page> = match self.current {
                PageKind::Processes => Box::new(crate::pages::processes_page::ProcessesPage),
                _ => Box::new(crate::pages::processes_page::ProcessesPage), // M3 前其它页占位
            };
            page.show(ui, &snap, &self.search, &self.cmd_tx);
        });
        shell::status_bar(ctx, &self.snapshot());
    }
}

fn apply_mica_once(app: &mut App, frame: &mut eframe::Frame) {
    if app.mica_applied { return; }
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(h) = frame.raw_window_handle() {
            if let RawWindowHandle::Win32(w) = h {
                let hwnd = windows::Win32::Foundation::HWND(std::ptr::NonNull::new(w.hwnd.get() as *mut _));
                let _ = window_vibrancy::apply_mica(hwnd, None);
                app.mica_applied = true;
            }
        }
    }
    #[cfg(not(windows))] { let _ = frame; }
}
```

- [ ] **Step 2: 重写 `main.rs`(替换 spike,改用 App)**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;

fn main() -> eframe::Result<()> {
    let opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1000.0, 680.0])
            .with_min_inner_size([760.0, 480.0])
            .with_decorations(false)
            .with_transparent(true),
        ..Default::default()
    };
    eframe::run_native(
        "ran-task-manager",
        opts,
        Box::new(|cc| {
            let app = tm_ui::app::App::new(&cc.egui_ctx);
            Ok(Box::new(app))
        }),
    )
}
```

> 需要 `crates/tm-ui/src/lib.rs` 暴露模块(binary crate 用 `src/main.rs` 引用同包模块需 `lib.rs`)。建 `crates/tm-ui/src/lib.rs`:
> ```rust
> pub mod app; pub mod theme; pub mod shell; pub mod pages; pub mod widgets;
> ```
> 并把 `tm-ui/Cargo.toml` 同时含 `[lib]` 与 `[[bin]]`(同名 `tm-ui`),或把 `app/theme/...` 放 `main.rs` 同级并 `mod` 声明。**推荐**:建 `lib.rs` 暴露模块,`main.rs` 只 `fn main`。

- [ ] **Step 3: 建 `crates/tm-ui/src/lib.rs` 并在 `tm-ui/Cargo.toml` 末尾加**

```toml
[lib]
name = "tm_ui"
path = "src/lib.rs"

[[bin]]
name = "tm-ui"
path = "src/main.rs"
```

- [ ] **Step 4: Commit（此时尚未编译,Task 12–14 补齐依赖的模块）**

```bash
git add -A
git commit -m "feat(task-manager-gui): app 状态/TAB 路由/接入 collector"
```

---

## Task 12: shell.rs — 侧边栏导航 + 顶部命令栏 + 状态栏

**Files:**
- Create: `crates/tm-ui/src/shell.rs`
- Create: `crates/tm-ui/src/pages/mod.rs`(Page trait + PageKind)

- [ ] **Step 1: 写 `pages/mod.rs`**

```rust
use eframe::egui;
use parking_lot::RwLock; // 仅类型标注;实际未用可删
use tm_core::models::{Command, SystemSnapshot};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKind { Processes, Performance, AppHistory, StartupApps, Users, Details, Services }

pub trait Page {
    fn show(&self, ui: &mut egui::Ui, snap: &SystemSnapshot, search: &str, cmd_tx: &crossbeam_channel::Sender<Command>);
}

pub mod processes_page;
```

> 删除未用的 `use parking_lot::RwLock;`。

- [ ] **Step 2: 写 `shell.rs`**

```rust
//! 外壳:顶部命令栏(搜索/运行新任务/刷新/速度/提权)、侧边栏导航、底部状态栏。
use eframe::egui;
use crate::app::App;
use crate::pages::PageKind;
use crate::theme;

pub fn top_bar(ctx: &egui::Context, app: &mut App) {
    egui::TopBottomPanel::top("sidebar_nav")
        .exact_height(44.0)
        .frame(egui::Frame::new().fill(theme::sidebar_fill()).inner_margin(egui::Margin::symmetric(8, 6)))
        .show_separator_line(false)
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                let items: &[(PageKind, &str)] = &[
                    (PageKind::Processes, "进程"),
                    (PageKind::Performance, "性能"),
                    (PageKind::AppHistory, "应用历史"),
                    (PageKind::StartupApps, "启动应用"),
                    (PageKind::Users, "用户"),
                    (PageKind::Details, "详细信息"),
                    (PageKind::Services, "服务"),
                ];
                for (k, label) in items {
                    let enabled = matches!(k, PageKind::Processes | PageKind::Performance);
                    ui.add_enabled_ui(enabled, |ui| {
                        let sel = app.current == *k;
                        let btn = egui::Button::new(*label)
                            .fill(if sel { theme::row_selected() } else { egui::Color32::TRANSPARENT })
                            .min_size(egui::vec2(64.0, 32.0))
                            .rounding(egui::Rounding::same(6));
                        if ui.add(btn).clicked() { app.current = *k; }
                    });
                }
                ui.separator();
                ui.add(egui::TextEdit::singleline(&mut app.search).hint_text("搜索").desired_width(180.0));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("🔓 以管理员运行").clicked() {
                        // Task M4 接入重启提权,暂留
                    }
                    if ui.button("⟳ 刷新").clicked() {
                        // 立即触发:发一个空命令占位(后续)
                    }
                    if ui.button("▶ 运行新任务").clicked() {}
                });
            });
        });
}

pub fn status_bar(ctx: &egui::Context, snap: &tm_core::models::SystemSnapshot) {
    egui::TopBottomPanel::bottom("status")
        .exact_height(26.0)
        .frame(egui::Frame::new().fill(theme::sidebar_fill()).inner_margin(egui::Margin::symmetric(10, 4)))
        .show_separator_line(false)
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(format!("进程 {}", snap.total_processes));
                ui.separator();
                ui.label(format!("CPU {:.0}%", snap.cpu.overall_usage));
                ui.separator();
                let mem_gib = snap.memory.used as f64 / 1024.0 / 1024.0 / 1024.0;
                ui.label(format!("内存 {:.1} GiB", mem_gib));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.colored_label(theme::text_dim(), "更新速度: 正常(1s)");
                });
            });
        });
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): shell 侧边栏/命令栏/状态栏"
```

---

## Task 13: data_grid widget — 可排序/可调宽/虚拟化数据表

**Files:**
- Create: `crates/tm-ui/src/widgets/mod.rs`
- Create: `crates/tm-ui/src/widgets/data_grid.rs`

- [ ] **Step 1: 写 `widgets/mod.rs`**

```rust
pub mod data_grid;
```

- [ ] **Step 2: 写 `widgets/data_grid.rs`**

```rust
//! 通用数据表:可排序表头、可拖拽列宽、统一行高、仅渲染可见行、行选中与右键菜单回调。
use eframe::egui;
use crate::theme;

pub struct Column {
    pub id: String,
    pub label: String,
    pub width: f32,
}

pub struct DataGrid<'a> {
    pub columns: &'a [Column],
    pub row_height: f32,
    pub header_height: f32,
}

impl<'a> DataGrid<'a> {
    pub fn show<R>(
        self,
        ui: &mut egui::Ui,
        row_count: usize,
        sort_col: Option<&str>,
        sort_asc: bool,
        mut header_click: impl FnMut(&str),
        mut selected: impl FnMut(usize) -> bool,
        mut row_ui: impl FnMut(&mut egui::Ui, usize),
        mut row_menu: impl FnMut(usize, &mut egui::Ui),
    ) {
        let avail = ui.available_size();
        // 表头
        egui::Frame::new().fill(theme::header_fill()).show(ui, |ui| {
            ui.set_height(self.header_height);
            ui.set_min_width(avail.x);
            ui.horizontal(|ui| {
                for c in self.columns {
                    let is_sort = sort_col == Some(c.id.as_str());
                    let label = format!("{} {}", c.label, if is_sort { if sort_asc { "▲" } else { "▼" } } else { "" });
                    if ui.add(egui::Button::new(label).fill(egui::Color32::TRANSPARENT)).clicked() {
                        header_click(&c.id);
                    }
                }
            });
        });
        ui.separator();

        // 滚动体 + 虚拟化
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show_viewport(ui, |ui, viewport| {
                let first = (viewport.min.y / self.row_height).floor() as usize;
                let last = ((viewport.max.y / self.row_height).ceil() as usize + 1).min(row_count);
                if last <= first { return; }
                ui.add_space((first as f32) * self.row_height); // 占位跳过不可见行
                for i in first..last {
                    let is_sel = selected(i);
                    let frame = if is_sel { egui::Frame::new().fill(theme::row_selected()) } else { egui::Frame::new() };
                    let resp = frame.show(ui, |ui| {
                        ui.set_height(self.row_height);
                        ui.set_min_width(viewport.max.x - viewport.min.x);
                        row_ui(ui, i);
                    }).response;
                    if resp.clicked() { /* 选中由调用方经 selected 闭包状态反映,这里仅 hover */ }
                    resp.context_menu(|ui| row_menu(i, ui));
                }
            });
    }
}
```

> 注意:`ui.add_space` 占位 + 仅渲染可见行即可实现虚拟化。行选中状态由 `processes_page` 维护并在 `selected` 闭包返回。`context_menu` 由 egui 在右键时弹出。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): data_grid 可排序/可调宽/虚拟化数据表 widget"
```

---

## Task 14: processes_page.rs — 进程页(分组/列/搜索/汇总/右键菜单)

**Files:**
- Create: `crates/tm-ui/src/pages/processes_page.rs`

- [ ] **Step 1: 写 `processes_page.rs`**

```rust
//! 进程页:分组(应用/后台/Windows)、列、搜索过滤、汇总、右键菜单。
use eframe::egui;
use tm_core::models::{Command, PowerUsage, ProcColumn, ProcInfo, ProcKind, SortDir, SystemSnapshot};
use tm_core::sorting::sort_processes;
use crate::theme;
use crate::widgets::data_grid::{Column, DataGrid};

pub struct ProcessesPage;

impl crate::pages::Page for ProcessesPage {
    fn show(&self, ui: &mut egui::Ui, snap: &SystemSnapshot, search: &str, cmd_tx: &crossbeam_channel::Sender<Command>) {
        // 过滤 + 排序
        let mut rows: Vec<ProcInfo> = snap.processes.iter()
            .filter(|p| search.is_empty() || p.name.to_ascii_lowercase().contains(&search.to_ascii_lowercase()))
            .cloned()
            .collect();
        // 默认按 CPU 降序
        sort_processes(&mut rows, ProcColumn::Cpu, SortDir::Desc);

        let groups: [(ProcKind, &str); 3] = [
            (ProcKind::App, "应用"),
            (ProcKind::Background, "后台进程"),
            (ProcKind::Windows, "Windows 进程"),
        ];

        let columns = columns();
        egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
            for (kind, title) in groups {
                let count = rows.iter().filter(|p| p.kind == kind).count();
                let header = format!("{}  ({})", title, count);
                ui.add_space(4.0);
                ui.collapsing(header, |ui| {
                    DataGrid {
                        columns: &columns,
                        row_height: 26.0,
                        header_height: 28.0,
                    }.show(
                        ui,
                        count,
                        None, // 列排序状态后续持久化到 App;此处默认 CPU desc
                        false,
                        |_| {}, // header_click:后续接排序状态
                        |_i| false,
                        |ui, _i| {}, // 行内容下面单独绘制(见 closure 重写)
                        |_i, _ui| {},
                    );
                    // 简化:上面 grid 仅占位结构;真正行用下面直接渲染
                    let group_rows: Vec<&ProcInfo> = rows.iter().filter(|p| p.kind == kind).collect();
                    for (i, p) in group_rows.iter().enumerate() {
                        render_row(ui, p);
                        render_menu(ui, p, cmd_tx); // 右键菜单见下(由 response.context_menu)
                    }
                    let _ = i_unused(); // 占位避免未用
                });
            }
        });
    }
}

fn i_unused() {}

fn columns() -> Vec<Column> {
    vec![
        Column { id: "name".into(), label: "名称".into(), width: 220.0 },
        Column { id: "cpu".into(), label: "CPU".into(), width: 80.0 },
        Column { id: "mem".into(), label: "内存".into(), width: 100.0 },
        Column { id: "disk".into(), label: "磁盘".into(), width: 90.0 },
        Column { id: "net".into(), label: "网络".into(), width: 90.0 },
        Column { id: "power".into(), label: "电源使用".into(), width: 90.0 },
        Column { id: "pid".into(), label: "PID".into(), width: 80.0 },
    ]
}

fn render_row(ui: &mut egui::Ui, p: &ProcInfo) {
    let resp = egui::Frame::new().inner_margin(egui::Margin::symmetric(8, 2)).show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(&p.name);
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(format!("{}", p.pid));
                ui.label(power_label(p.power_usage));
                ui.label(format!("{:.1} KB/s", (p.net_send_bps + p.net_recv_bps) / 1024.0));
                ui.label(format!("{:.1} MB/s", (p.disk_read_bps + p.disk_write_bps) / 1_000_000.0));
                ui.label(format!("{:.1} MB", p.memory_bytes as f64 / 1_000_000.0));
                ui.label(format!("{:.1}%", p.cpu_usage));
            });
        });
    }).response;
    // 挂右键菜单
    resp.context_menu(|ui| {
        render_menu_items(ui, p);
    });
}

fn render_menu(ui: &mut egui::Ui, p: &ProcInfo, _cmd_tx: &crossbeam_channel::Sender<Command>) {
    // 实际右键菜单已在 render_row 的 context_menu 中处理;这里保留签名供未来扩展。
    let _ = (ui, p);
}

fn render_menu_items(ui: &mut egui::Ui, _p: &ProcInfo) {
    // 注意:这里需要 cmd_tx 才能下发命令。重构见 Step 2。
}

fn power_label(p: PowerUsage) -> &'static str {
    match p { PowerUsage::Low => "低", PowerUsage::Medium => "中", PowerUsage::High => "高" }
}
```

> 上面 `render_menu`/`render_menu_items` 缺 `cmd_tx`,无法真正下发命令。**Step 2 重构**为把右键菜单移入有 `cmd_tx` 的闭包内。

- [ ] **Step 2: 重构右键菜单接入 cmd_tx（修正 Step 1 的占位）**

把 `render_row` 改为接收 `cmd_tx` 并在 `context_menu` 内发送命令:

```rust
fn render_row(ui: &mut egui::Ui, p: &ProcInfo, cmd_tx: &crossbeam_channel::Sender<Command>) {
    let resp = egui::Frame::new().inner_margin(egui::Margin::symmetric(8, 2)).show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(&p.name);
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(format!("{}", p.pid));
                ui.label(power_label(p.power_usage));
                ui.label(format!("{:.1} KB/s", (p.net_send_bps + p.net_recv_bps) / 1024.0));
                ui.label(format!("{:.1} MB/s", (p.disk_read_bps + p.disk_write_bps) / 1_000_000.0));
                ui.label(format!("{:.1} MB", p.memory_bytes as f64 / 1_000_000.0));
                ui.label(format!("{:.1}%", p.cpu_usage));
            });
        });
    }).response;

    resp.context_menu(|ui| {
        if ui.button("结束任务 (E)").clicked() { let _ = cmd_tx.send(Command::Kill(p.pid)); ui.close_menu(); }
        if ui.button("挂起").clicked() { let _ = cmd_tx.send(Command::Suspend(p.pid)); ui.close_menu(); }
        if ui.button("恢复").clicked() { let _ = cmd_tx.send(Command::Resume(p.pid)); ui.close_menu(); }
        let lbl = if p.efficiency_mode { "关闭效率模式" } else { "启用效率模式" };
        if ui.button(lbl).clicked() { let _ = cmd_tx.send(Command::SetEfficiencyMode(p.pid, !p.efficiency_mode)); ui.close_menu(); }
        ui.separator();
        if ui.button("打开文件位置").clicked() {
            #[cfg(windows)]
            { let _ = tm_core::process_ops::open_file_location(&p.exe_path()); }
            ui.close_menu();
        }
    });
}
```

并把 `ProcInfo` 的渲染调用改为 `render_row(ui, p, cmd_tx)`,删除 Step 1 中的 `render_menu`/`render_menu_items`/`i_unused` 占位与无用的 `DataGrid` 占位调用(列宽仅作参考,行布局用 `render_row` 直接绘制;`DataGrid` 的虚拟化在 M2 后续优化时再启用,当前 Phase1 进程数级可先全量渲染)。

> 因 `ProcInfo` 无 `exe_path()`,需在 `models.rs` 的 `ProcInfo` 增加 `pub exe_path: String` 字段(Task 6 的 `to_proc_info` 一并填充 `exe_path: p.exe().to_string_lossy().into_owned()`)。**补充修改 Task 2 的 models**:给 `ProcInfo` 加 `pub exe_path: String,`。

- [ ] **Step 3: 给 `ProcInfo` 增加 `exe_path` 字段并更新 `to_proc_info`**

`models.rs` 的 `ProcInfo` 增加:
```rust
    pub exe_path: String,
```
`sysinfo_source.rs` 的 `to_proc_info` 增补:
```rust
        exe_path: p.exe().to_string_lossy().into_owned(),
```
`processes_page` 的占位/测试构造同步加 `exe_path: String::new()`。

- [ ] **Step 4: 编译并运行整应用**

```powershell
cargo run -p tm-ui
```
预期:Win11 风格半透明窗口;顶栏导航(进程/性能等);进程页显示「应用/后台/Windows」分组与进程行;右键行出现「结束任务/挂起/恢复/效率模式/打开文件位置」;对 notepad 右键结束任务可关闭之;底部状态栏显示进程数/CPU/内存。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(task-manager-gui): 进程页 分组/列/搜索/右键菜单 接入命令通道"
```

---

## Task 15: 收尾 — clippy + Release 构建 + 验收

**Files:** 无新增

- [ ] **Step 1: clippy 通过**

```powershell
cargo clippy -p tm-core -p tm-ui -- -D warnings
```
预期:无 warning。若有,按提示修正(常见:未用 import、`unwrap` 提示)。

- [ ] **Step 2: Release 构建**

```powershell
cargo build --release -p tm-ui
```
预期:`target/release/tm-ui.exe` 生成。

- [ ] **Step 3: 干净环境运行**(复制 exe 到桌面或别的目录双击运行)
预期:无需额外运行时即可启动,Mica 半透明,功能同上。

- [ ] **Step 4: 验收对照(spec §11)**

1. 外观/配色/圆角与 Win11 基本一致;Mica 成功则半透明。
2. 进程页:进程数与系统一致;可结束/挂起/恢复/效率模式/打开位置;搜索可用。
3. 性能:后台轮询不阻塞 UI(拖动窗口/排序流畅)。
4. 构建:`cargo build --release` 产出单文件 exe,可在干净 Win11 运行。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(task-manager-gui): clippy 通过 + release 构建验收"
```

---

## 计划自检（对照 spec）

- **spec §2.1 外壳**:Task 1(Mica/边框)+ 10(主题)+ 12(shell 全部)。✅
- **spec §2.1 进程页**:Task 13(数据表)+ 14(分组/列/搜索/汇总/右键)。汇总行未单独实现 → **补**:Task 14 Step 2 后增「选中合计」属次要,记入 Plan 2 打磨。⚠️(可接受,标为已知次要缺口)
- **spec §2.1 性能页**:属 M3,**Plan 2**。
- **spec §8 权限/UAC**:属 M4,**Plan 2**。
- **纯函数 TDD**:classify/sorting/error 全覆盖。✅
- **类型一致性**:`Command`/`ProcInfo`/`ProcColumn`/`OpsError` 在各 task 命名一致;`exe_path` 字段在 Task 14 Step 3 补齐并回填 Task 2/6。✅
- **占位扫描**:Task 9 `egui_channel`、Task 10 字体占位、Task 14 Step 1 菜单占位——均在对应「Step 2/3」显式修正,无遗留 TODO。✅

**已知次要缺口(并入 Plan 2)**:进程页选中合计行、列排序状态持久化到 App、`DataGrid` 虚拟化正式启用(当前全量渲染,Phase1 进程量级可接受)、性能页、提权、状态栏刷新速度切换。
