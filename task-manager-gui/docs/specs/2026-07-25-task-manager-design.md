# 设计规格：ran-task-manager（Rust + egui 还原 Windows 11 任务管理器）

- **日期**：2026-07-25
- **状态**：已确认（待实现）
- **目标平台**：Windows 11（开发与验证机：22621 / 22H2），单一 target `x86_64-pc-windows-msvc`
- **语言**：中文界面为主，英文为辅（可切换）

---

## 1. 背景与目标

用 **纯 Rust** 实现一个桌面任务管理器，**操作体验与 Windows 11 任务管理器一致**：
Mica 半透明外壳、左侧侧边栏导航、进程页（分组/排序/结束/挂起/效率模式/右键菜单）、
性能页（CPU/内存/磁盘/网络/GPU 实时图表）、状态栏、非提权启动 + 可选重启提权。

采用**分期增量**：Phase 1 先交付「进程页 + 性能页 + 外壳 + 权限」，其余标签页后续阶段补充。

### 1.1 已确认的关键决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| GUI 技术栈 | **纯 Rust + egui** | 用户选择；全 Rust 原生二进制 |
| 功能范围 | **分期：先做进程页 + 性能页** | 控制 egui 自绘工作量与风险 |
| 权限模型 | **非提权 + 可选重启提权** | 不每次弹 UAC，需要时再提权，对齐 Win11 体验 |

---

## 2. 范围（Phase 1）

### 2.1 范围内（In Scope）

**外壳**
- Mica 半透明背景（透明窗口 + egui 透明 Visuals + `window-vibrancy::apply_mica`）
- 自定义窗口边框、圆角 8px（借鉴 egui `custom_window_frame` 示例）
- 左侧侧边栏导航：汉堡菜单（折叠/展开）、账号区；Phase1 启用「进程」「性能」两项，其余（应用历史/启动应用/用户/详细信息/服务）置灰占位
- 顶部搜索框（进程页按名称实时过滤）
- 顶部命令栏：`运行新任务`、`刷新`、更新速度下拉、`以管理员身份运行`（非提权时显示盾牌）
- 底部状态栏：进程总数、CPU% 总计、内存占用、当前刷新速度

**进程页**
- 分组列表「应用 / 后台进程 / Windows 进程」，分组可折叠
- 列：名称、CPU、内存、磁盘、网络、电源使用、电源使用趋势、PID、状态
- 列头点击排序（升/降），列宽可拖拽，统一行高虚拟化渲染
- 行右键菜单（Phase1 实现核心子集）：
  - 结束任务 (E)
  - 运行新任务
  - 效率模式切换（开启/关闭）
  - 挂起 / 恢复
  - 打开文件位置
  - 属性（调用 shell 属性页）
  - 其余（创建转储文件、分析等待链、调试、提供反馈）占位显示
- 顶部汇总行（选中进程合计 CPU/内存）

**性能页**
- 左侧资源竖排列表（CPU、内存、磁盘×N、网络、GPU）：每项 = 迷你 sparkline + 当前值 + 名称
- 右侧选中资源大图：滚动填充面积图 + 网格线 + 当前值/最大值
- 图下方详情面板：
  - CPU：速度、进程数、线程数、句柄数、正常运行时间、缓存、逻辑/物理核心、型号
  - 内存：在用、可用、已缓存、已提交、分页文件、速度、插槽
  - 磁盘：活动时间%、读取速度、写入速度、平均响应时间、容量
  - 网络：发送、接收、吞吐量、连接类型、适配器
  - GPU：专用 GPU 内存、共享内存、GPU 使用率、引擎利用率（best-effort）

**权限**
- 非提权启动（无 UAC）
- 「以管理员身份运行」通过 `ShellExecuteW(..., "runas", ...)` 重启自身，启用 `SE_DEBUG_PRIVILEGE`
- 受保护操作捕获「拒绝访问」，UI 友好提示并引导提权

**基础设施**
- 采集线程与 UI 解耦；中英文文案

### 2.2 范围外（Out of Scope，后续阶段）

应用历史、启动应用、用户、详细信息（高级视图）、服务（完整 SCM 管理）、等待链分析、
性能日志/导出、完整设置面板（默认页、开机自启、窗口位置记忆）、应用图标的高保真提取（Phase1 用首字母色块占位）。

### 2.3 降级约定（关键风险项）

- **若 Mica/透明渲染在验收前无法达标**：降级为 Win11 纯色主题（不阻塞功能交付），并记录为已知限制。
- **每进程网络 IO 若无法稳定获取**：性能页网络列显示聚合值并标注（不阻塞 Phase1）。
- **GPU 指标若不可靠**：性能页 GPU 列 best-effort，取不到时显示「—」，不阻塞 Phase1。

---

## 3. 数据层选型

| 方案 | 结论 |
|---|---|
| A. sysinfo 为主（主干） | **采用**：覆盖进程/CPU/内存/磁盘/网络/GPU、每进程磁盘 IO、CPU% 差分 |
| B. 纯 windows（PDH/WMI/SCM/ETW） | 不采用为唯一来源：代码量大、开发慢 |
| C. WMI 为主 | 不采用：延迟高，不适合 1s 轮询 |

**最终：Hybrid**——sysinfo 作主干，`windows` 官方 crate 仅补缺：
- 服务（SCM，后续阶段）
- 每进程网络 IO（IO/网络计数器或 IP Helper）
- 进程所有者 / 会话 ID
- Efficiency mode（EcoQoS，`SetProcessInformation` + `ProcessPowerThrottling`）
- UAC 重启提权（`ShellExecuteW`）、`SE_DEBUG_PRIVILEGE`（`RtlAdjustPrivilege`）

---

## 4. 整体架构

```
┌──────────────────────────────────────────────────┐
│  Collector 线程（后台，独立于 UI）                │
│  loop: 按 refresh_interval 轮询（默认 1s）         │
│   ├─ sysinfo 刷新（进程/CPU/内存/磁盘/网络/GPU）    │
│   ├─ windows 补缺（网络IO/会话/所有者...）         │
│   ├─ 组装 SystemSnapshot（不可变快照）             │
│   ├─ 写入 Arc<RwLock<SystemSnapshot>>              │
│   ├─ 持有上一次采样（供 CPU% 差分）                │
│   └─ ctx.request_repaint() 唤醒 UI                │
└────────────────┬─────────────────────────────────┘
                 │ 只读快照（持锁极短）
┌────────────────▼─────────────────────────────────┐
│  UI 线程（egui/eframe）                            │
│   读最新 Snapshot → 渲染进程页/性能页              │
│   用户操作 → 经 Command channel 回传 Collector     │
└──────────────────────────────────────────────────┘
```

- **采集与渲染解耦**：UI 卡顿不影响数据连续性；数据轮询不被重绘拖累。
- **CPU% 依赖两次采样差分**：Collector 持有上一帧状态，自然满足 sysinfo 要求。
- **刷新速度**：对齐 Win11 —— `Paused / 低(2s) / 正常(1s) / 高(0.5s)`，默认「正常」，状态栏可切换。
- **并发原语**：`std::thread` + `parking_lot::RwLock` + `crossbeam-channel`，不引入 tokio。
- **操作通道**：UI 把「结束/挂起/恢复/效率模式/优先级」等命令投递到 `Command` channel，
  Collector（或专用执行器）在后台线程执行，避免阻塞 UI 线程。

---

## 5. 项目结构（Cargo workspace）

> 约定：Rust 源文件遵循 Rust 惯例使用 **snake_case**。
> TS 规范中的 kebab-case 仅适用于前端 TS/Vue，本工程为 `.rs` 原生代码，故采用 Rust 约定。

```
task-manager-gui/
├─ Cargo.toml                    # workspace（members: tm-core, tm-ui）
├─ crates/
│  ├─ tm-core/                   # 纯逻辑：采集、进程操作、模型、权限
│  │  ├─ Cargo.toml
│  │  └─ src/
│  │     ├─ lib.rs
│  │     ├─ models.rs            # SystemSnapshot / ProcInfo / CpuSnapshot ...
│  │     ├─ collector.rs         # 后台采集循环、Command 执行
│  │     ├─ sysinfo_source.rs    # sysinfo 适配层
│  │     ├─ win_source.rs        # windows 补缺（cfg target_os="windows"）
│  │     ├─ process_ops.rs       # 结束/挂起/恢复/优先级/亲和性/Efficiency mode
│  │     ├─ privilege.rs         # UAC 重启提权 + SE_DEBUG_PRIVILEGE
│  │     └─ error.rs             # thiserror 错误类型
│  └─ tm-ui/                     # egui 前端（binary crate）
│     ├─ Cargo.toml
│     └─ src/
│        ├─ main.rs              # eframe 入口、窗口/Mica 透明设置
│        ├─ app.rs               # App 状态、Tab 路由、状态栏
│        ├─ theme.rs             # Win11 配色、Segoe UI 字体、圆角
│        ├─ shell.rs             # 侧边栏/搜索框/命令栏/状态栏
│        ├─ pages/
│        │   ├─ mod.rs
│        │   ├─ processes_page.rs
│        │   └─ performance_page.rs
│        └─ widgets/
│            ├─ mod.rs
│            ├─ data_grid.rs     # 可排序/可调宽/统一行高的虚拟化数据表
│            ├─ sparkline_chart.rs
│            └─ area_chart.rs    # 自绘填充折线（性能页大图）
├─ assets/
│  └─ fonts/                     # 内嵌 Segoe UI 字体（避免目标机缺失）
└─ docs/specs/                   # 本规格文档所在
```

### 5.1 crate 职责边界

- **tm-core**：与 UI 无关。输入=系统调用，输出=`SystemSnapshot` 与操作结果。
  可独立单测（用假数据源），不依赖 egui。
- **tm-ui**：仅渲染与交互，不含系统调用逻辑。通过 `tm-core` 的公共 API 取数/下发命令。
- 边界判定：能否在不读 UI 内部的情况下理解并单测 tm-core？能否替换 UI 而不动 tm-core？是 → 边界合理。

---

## 6. 核心数据模型（tm-core/models.rs）

```rust
pub struct SystemSnapshot {
    pub timestamp: std::time::Instant,
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    pub disks: Vec<DiskSnapshot>,
    pub network: NetworkSnapshot,
    pub gpus: Vec<GpuSnapshot>,       // best-effort，可能为空
    pub processes: Vec<ProcInfo>,
    pub elevated: bool,               // 当前进程是否已提权
    pub total_processes: usize,
}

pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub user: Option<String>,         // windows: 进程所有者
    pub session_id: Option<u32>,
    pub cpu_usage: f32,               // %（sysinfo 差分）
    pub memory_bytes: u64,            // 工作集
    pub disk_read_bps: f64,
    pub disk_write_bps: f64,
    pub net_send_bps: f64,            // windows 补缺
    pub net_recv_bps: f64,
    pub power_usage: PowerUsage,      // Low/Medium/High（由 CPU% + 净 IO 估算）
    pub efficiency_mode: bool,
    pub status: ProcStatus,           // Running / Suspended / NotResponding
    pub kind: ProcKind,               // App / Background / Windows（分组依据）
    pub icon: Option<image::RgbaImage>, // Phase1 暂用首字母色块占位
}

pub struct CpuSnapshot {
    pub overall_usage: f32,
    pub per_core: Vec<f32>,
    pub speed_ghz: f32,
    pub history: std::collections::VecDeque<f32>, // 性能图历史（如 60 点）
    pub logical_cores: usize,
    pub physical_cores: usize,
    pub up_time: std::time::Duration,
    pub model_name: String,
    pub threads: usize,
    pub handles: usize,
}
// MemorySnapshot / DiskSnapshot / NetworkSnapshot / GpuSnapshot 同样持有 history

pub enum PowerUsage { Low, Medium, High }
pub enum ProcStatus { Running, Suspended, NotResponding }
pub enum ProcKind { App, Background, Windows }
```

**操作命令**（UI → Collector）：

```rust
pub enum Command {
    Kill(u32),
    Suspend(u32),
    Resume(u32),
    SetEfficiencyMode(u32, bool),
    SetPriority(u32, PriorityClass),
    SetAffinity(u32, u64),
}
```

---

## 7. UI 结构（egui 自绘还原 Win11）

### 7.1 主题（theme.rs）
- 配色：Mica 暗色为主（背景半透明 `#202020`、面板 `#2B2B2B`、强调 Accent `#4CC2FF`），
  支持亮色切换；表头、分割线、hover、选中态对齐 Win11。
- 字体：内嵌 Segoe UI（含中文回退字体）；控件圆角 8px；用 `Stroke`/阴影表达层级。
- egui `Visuals` 设为半透明以让 Mica 透出（Mica spike 验证后确定 alpha 策略）。

### 7.2 进程页（processes_page.rs）
- 三个可折叠分组 + 统一 `data_grid`。
- 列头点击切换排序键与方向；列宽可拖拽；统一行高 + 虚拟化（仅渲染可见行）。
- 右键菜单核心子集（见 §2.1）；操作经 Command channel 下发。
- 顶部汇总行：选中行的 CPU/内存合计。
- 搜索框：名称实时过滤（大小写不敏感、包含匹配）。

### 7.3 性能页（performance_page.rs）
- 左资源列表项 = sparkline + 当前值 + 名称；点击切换右侧大图与详情面板。
- 大图：`area_chart`，环形缓冲（默认 60 点）、网格线、当前值/峰值标注。
- 详情面板字段见 §2.1。

### 7.4 自绘 widget
- `data_grid`：排序状态（列 + 方向）、列宽数组、行高、可见行裁剪、行选中、右键菜单挂载。
- `area_chart` / `sparkline_chart`：基于 `egui::Painter` 的填充折线，自适应尺寸。

---

## 8. 权限 / UAC（tm-core/privilege.rs）

- 启动检测 `elevated`（判断令牌是否属于管理员组）。
- 重启提权：`ShellExecuteW(NULL, "runas", exe_path, params, ...)`；通过命令行参数恢复窗口状态。
- 提权后 `RtlAdjustPrivilege(SE_DEBUG_PRIVILEGE, true, ...)`，可结束系统进程、读取全部进程。
- 非提权下受保护操作返回错误 → `tm-core::error` 定义 `OpsError::AccessDenied` → UI 提示「需要管理员权限」。

---

## 9. 技术栈与版本

| crate | 用途 | 版本策略 |
|---|---|---|
| `eframe` + `egui` | GUI 主框架 | latest stable（脚手架时 `cargo add` 解析） |
| `egui_extras` | 额外控件 | latest |
| `sysinfo` | 系统指标主干 | latest（需含 GPU 支持） |
| `windows`（features: `Win32_Foundation`, `Win32_System_Threading`, `Win32_System_ProcessStatus`, `Win32_UI_Shell`, `Win32_Security`, `Win32_System_SystemInformation`, `Win32_System_ProcessStatus`...） | 服务/网络IO/会话/EcoQoS/UAC | latest |
| `window-vibrancy` | Mica/Blur 材质 | latest |
| `parking_lot` | RwLock | latest |
| `crossbeam-channel` | Command 通道 | latest |
| `anyhow` / `thiserror` | 错误处理 | latest |
| `image` | 图标/位图 | latest |

> 非 Windows 平台：`win_source`/`privilege` 以 `cfg` 条件编译返回空实现，仅保证**可编译**，不承诺运行。

---

## 10. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| egui Mica 透明渲染不达预期 | **高** | 列为**首个里程碑**：先做最小 spike（eframe + apply_mica + 透明 Visuals）；不过则按 §2.3 降级纯色主题 |
| 进程图标提取性能 | 中 | 默认按需 + LRU 缓存 + 异步；Phase1 用首字母色块占位 |
| 每进程网络 IO 缺口 | 中 | `windows` IO 计数器/IP Helper；按 §2.3 聚合降级 |
| 大量进程列表卡顿 | 中 | `data_grid` 虚拟化 + 统一行高 + 复用 Vec、减少每帧分配 |
| egui 无原生可排序数据表 | 中 | 自写 `data_grid` widget（Phase1 核心） |
| 权限边界 | 低 | 所有受保护操作统一走 `process_ops`，捕获并降级提示 |
| sysinfo 版本 API 变动 | 低 | 锁定版本；`sysinfo_source` 适配层隔离 |

---

## 11. Phase 1 验收标准

1. **外观**：配色/布局/圆角与 Win11 TM 基本一致；Mica 成功则半透明。
2. **进程页**：进程数与系统一致；列可排序；可结束/挂起/恢复/效率模式/打开位置；搜索可用。
3. **性能页**：CPU/内存/磁盘/网络 图表随时间滚动，数值与 Win11 TM 量级吻合；GPU best-effort。
4. **性能**：后台轮询不阻塞 UI（拖动窗口/排序流畅，主线程无明显卡顿）。
5. **权限**：「以管理员身份运行」可重启提权，提权后可结束系统进程。
6. **构建**：`cargo build --release` 产出单文件 `tm-ui.exe`，可在干净 Win11 上运行（无额外运行时依赖）。

---

## 12. 里程碑（建议）

- **M0 — Mica spike**：最小 eframe 透明窗口 + apply_mica，验证材质可行性（决定是否降级）。
- **M1 — 骨架 + 数据层**：workspace、tm-core 采集循环、SystemSnapshot、tm-ui 基本窗口/主题。
- **M2 — 进程页**：data_grid、分组、排序、右键菜单核心、操作通道。
- **M3 — 性能页**：area_chart/sparkline、资源列表、详情面板。
- **M4 — 权限 + 状态栏 + 打磨**：UAC 重启、SE_DEBUG、刷新速度、文案、图标占位。

---

## 13. 假设与待定项

- **假设**：开发机已有 Rust 1.97 + MSVC 工具链；egui/sysinfo/windows 在脚手架时取最新稳定版。
- **待定（实现时定，不阻塞）**：性能图历史点数（默认 60）、刷新速度档位精确数值、电源使用估算阈值、亮色主题是否 Phase1 提供。
