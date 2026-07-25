# ran-task-manager Phase 2 Implementation Plan

> 会话内执行,逐 task 提交。延续 tm-core(数据/操作)+ tm-ui(渲染)分层。

**Goal:** 补齐 Win11 任务管理器的剩余 5 个标签页、运行新任务对话框,并用 PDH 性能计数器补全磁盘读写速率与 GPU。

**可行性分级:**
- 高可行:运行新任务、服务、详细信息、启动应用、用户。
- best-effort:应用历史(Win11 私有存储无公开 API → 会话内累计近似)、GPU/磁盘速率(PDH)。

---

## File Structure(新增/修改)

| 文件 | 职责 |
|---|---|
| `tm-core/src/run_task.rs` | 运行新任务:解析命令 + ShellExecuteW(open/runas) | 新建 |
| `tm-core/src/services.rs` | SCM 枚举服务:名称/状态/启动类型 | 新建 |
| `tm-core/src/startup.rs` | 启动项:Run 注册表键 + Startup 目录 | 新建 |
| `tm-core/src/users.rs` | WTS 会话枚举 + 按用户聚合资源 | 新建 |
| `tm-core/src/app_history.rs` | 会话内按应用累计 CPU/网络 | 新建 |
| `tm-core/src/perf.rs` | PDH 磁盘读写速率 + GPU 利用率 | 新建 |
| `tm-core/src/sysinfo_source.rs` | 补 session_id(ProcessIdToSessionId) | 修改 |
| `tm-core/Cargo.toml` | 增加 windows features(Services/Registry/RemoteDesktop/Performance) | 修改 |
| `tm-ui/src/pages/{services,details,startup,users,app_history}_page.rs` | 各页 | 新建 |
| `tm-ui/src/app.rs` | 运行新任务对话框状态 + 路由 + 数据按需拉取 | 修改 |
| `tm-ui/src/shell.rs` | 「运行新任务」按钮触发对话框 | 修改 |

> 数据拉取策略:服务/启动项/用户变化慢,不在 collector 每秒轮询,而是在页面渲染时按 ~3s 节流调用 tm-core 拉取(避免持续开销)。应用历史累计由 collector 维护。

---

## Tasks

### P3-1 运行新任务对话框
- `run_task.rs::run_new_task(command, elevated)`:解析首个 token 为 exe(支持引号路径),其余为参数;`ShellExecuteW(verb = elevated ? "runas" : "open", file, params, SW_SHOWNORMAL)`。
- `app.rs`:加 `run_dialog: Option<RunDialogState { input, elevated }>`;命令栏按钮置位;`egui::Window` 渲染输入框 + 管理员复选框 + 确定/取消。

### P3-2 服务页
- `services.rs::enumerate() -> Vec<ServiceInfo { name, display_name, status, start_type }>`:OpenSCManager → EnumServicesStatusEx(SERVICE_WIN32, STATE_ALL) → 逐个 OpenService + QueryServiceConfig 取 dwStartType。
- 页面:列表(名称/描述/状态/启动类型),搜索过滤。

### P3-3 详细信息页
- `sysinfo_source` 补 `session_id`(win_source 加 `session_id(pid)`)。
- 页面:进程表列 = 名称/PID/状态/用户/会话/内存/CPU。复用排序。

### P3-4 启动应用页
- `startup.rs::enumerate() -> Vec<StartupEntry { name, command, location }>`:Run 键(HKLM/HKCU + Wow6432Node)+ Startup 目录(APPDATA/ProgramData)。

### P3-5 用户页
- `users.rs::enumerate(snap) -> Vec<UserInfo { name, session, state, cpu, memory }>`:WTSEnumerateSessions + WTSQuerySessionInformation;按用户名聚合 snap.processes 的 CPU/内存。
- 页面:列表(用户/会话/状态/CPU/内存)。

### P3-6 应用历史页(近似)
- collector 维护 `app_history: HashMap<String, AppHist { cpu_secs, net_bytes }>`(按进程名累计);写入 snap。
- 页面:按名称累计 CPU 时间 + 网络(会话内),标注「近似(会话内累计)」。

### P3-7 磁盘读写 + GPU(PDH,best-effort)
- `perf.rs::PerfState`:PdhOpenQuery + 添加 PhysicalDisk/GPU Engine 计数;collect 取值;失败则该资源降级为「—」。
- 性能页磁盘详情接 read/write bps;GPU 列接利用率/显存。
- 若 PDH 编译/取值不达预期 → 保留占位,不阻塞其余交付。

### P3-8 clippy + release + 验收

---

## 自检(对照 spec §2.2 范围外项)
- 应用历史/启动应用/用户/详细信息/服务 → P3-2/3/4/5/6。✅
- 运行新任务 → P3-1。✅
- GPU/磁盘读写 best-effort(spec §2.3)。✅
- 范围外:服务 启停、等待链、性能日志导出、设置面板。
