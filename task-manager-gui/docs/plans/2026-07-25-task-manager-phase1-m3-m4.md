# ran-task-manager Phase 1 (M3–M4) Implementation Plan

> **For agentic workers:** 按本计划逐 task 实现,checkbox 跟踪。延续 Phase1(M0–M2)的会话内执行方式。

**Goal:** 补齐 Win11 任务管理器的性能页与权限/刷新控制,使操作体验与 Win11 一致。

**Architecture(延续):** tm-core 负责数据/操作,tm-ui 负责渲染。新增:SysState 维护磁盘/网络/GPU 历史曲线;collector 增加运行时控件(刷新速度/暂停);tm-ui 自绘 area_chart/sparkline;新增 performance_page 与 privilege 模块。

**Tech Stack:** 不变(egui 0.30 / sysinfo 0.32 / windows 0.58)。

---

## File Structure(本计划涉及)

| 文件 | 职责 | 新建/修改 |
|---|---|---|
| `crates/tm-core/src/sysinfo_source.rs` | 增加 disk/network/gpu 历史曲线维护 | 修改 |
| `crates/tm-core/src/models.rs` | 增加 `RefreshSpeed` 枚举 | 修改 |
| `crates/tm-core/src/privilege.rs` | 提权检测 + SE_DEBUG_PRIVILEGE | 新建 |
| `crates/tm-core/src/collector.rs` | 返回运行时控件(interval_ms/paused);接收 elevated | 修改 |
| `crates/tm-ui/src/widgets/charts.rs` | area_chart + sparkline 自绘 | 新建 |
| `crates/tm-ui/src/pages/performance_page.rs` | 性能页 | 新建 |
| `crates/tm-ui/src/shell.rs` | 状态栏刷新速度下拉 + 提权徽标 | 修改 |
| `crates/tm-ui/src/app.rs` | 接入控件/性能页路由/elevated | 修改 |
| `crates/tm-ui/src/lib.rs` | 导出 widgets/performance | 修改 |

---

## Task P2-1: SysState 维护磁盘/网络/GPU 历史曲线

- 给 `SysState` 增加 `disk_history: HashMap<String, VecDeque<f32>>`(按盘符)、`net_history: VecDeque<f32>`(聚合吞吐量 Mbps)。
- `snapshot()` 中对每个磁盘 push activity_pct(暂用 read_bps+write_bps 占位,后续可接真实活动%);网络 push `(send_bps+recv_bps)` 归一化;并把 history 写回各 `DiskSnapshot.history`/`NetworkSnapshot.history`。
- GPU:sysinfo 0.32 无稳定 GPU 利用率 API → `gpus` 保持空,性能页对 GPU 显示「暂不支持」(符合 spec §2.3 best-effort)。
- 验证:`dump_snapshot` 打印一条磁盘/网络历史长度=60。

## Task P2-2: charts widget(area_chart + sparkline)

- `area_chart(ui, history: &VecDeque<f32>, max: f32, line_color, fill_color)`:`ui.allocate_size` → 用 `Painter` 绘制:闭合 PathShape(fill)+ 顶部 line。max=0 时退化为 max=1 防除零。
- `sparkline(ui, history, max, color)`:同样但小尺寸、无边框/坐标轴。
- 纯绘制函数,无状态。

## Task P2-3: tm-core privilege + collector elevated

- `privilege.rs`:
  - `is_elevated() -> bool`:用 `OpenProcessToken` + `GetTokenInformation(TokenElevation)`。
  - `enable_debug_privilege()`:查找 `SeDebugPrivilege` LUID + `AdjustTokenPrivileges`。失败忽略(非提权时自然失败)。
- `collector::spawn(interval, elevated: bool, ...)`:启动时若 elevated 则 `enable_debug_privilege()`;快照的 `elevated` 字段用传入值。

## Task P2-4: collector 运行时控件 + RefreshSpeed

- `models.rs` 增加 `RefreshSpeed { Paused, Low, Normal, High }`,`to_millis()` → 0/2000/1000/500。
- `collector::spawn` 返回增加 `Controls { interval_ms: Arc<AtomicU64>, paused: Arc<AtomicBool> }`;循环读 `interval_ms.load()` 决定 sleep;`paused` 为真则跳过刷新(但保留 request_repaint?暂停时不重绘)。
- App 持有 Controls;状态栏修改它。

## Task P2-5: performance_page

- 左侧资源列表(垂直):CPU / 内存 / 磁盘×N / 网络 / GPU,每项 = sparkline + 当前值 + 名称;点击选中切换右侧大图。
- 右侧:`area_chart` 大图(60 点滚动) + 下方详情面板(随选中资源不同字段)。
- CPU:利用率%/速度GHz/逻辑核/物理核/进程数/线程/句柄/正常运行时间;内存:在用/可用/已缓存/已提交/总量;磁盘:容量/读/写/活动%;网络:发送/接收/吞吐/适配器;GPU:占位「暂不支持」。

## Task P2-6: 状态栏刷新速度切换 + 提权徽标 + app 接线

- 状态栏右侧:`ComboBox` 选「暂停/低/正常/高」,改 `Controls.interval_ms`/`paused`。
- 提权徽标:`elevated` 时显示「管理员」。
- app:`PageKind::Performance` 路由到 `PerformancePage`;elevated 检测在 `App::new` 调 `privilege::is_elevated()` 并传给 collector。

## Task P2-7: clippy + release + 验收

- `cargo clippy --all-targets -- -D warnings` 干净;`cargo build --release`;启动验证性能页图表随时间滚动、刷新速度可切换、提权重启后可结束系统进程。

---

## 自检(对照 spec §2.1 性能页 + §8 权限)
- 性能页 CPU/内存/磁盘/网络 图表 + 详情 → P2-1/2/5。✅
- GPU best-effort(spec §2.3)→ 占位。✅
- 刷新速度(暂停/低/正常/高)→ P2-4/6。✅
- 提权重启 + SE_DEBUG → P2-3/6。✅
- 范围外(后续):选中合计行、列排序状态持久化、运行新任务对话框、等待链、性能日志导出。
