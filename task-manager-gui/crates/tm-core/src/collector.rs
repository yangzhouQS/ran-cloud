//! 后台采集:按 interval 轮询快照写入 Arc<RwLock>,并消费 Command channel。
//!
//! `on_tick` 每次刷新后被调用(UI 侧用它触发 egui::Context::request_repaint)。

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crossbeam_channel::{unbounded, Receiver, Sender};
use parking_lot::RwLock;

use crate::models::*;
use crate::privilege::enable_debug_privilege;
use crate::sysinfo_source::SysState;

pub type SnapshotStore = Arc<RwLock<SystemSnapshot>>;
pub type CmdTx = Sender<Command>;
pub type CmdRx = Receiver<Command>;

/// 运行时控件:刷新速度(毫秒)与暂停标志。
#[derive(Clone)]
pub struct Controls {
    pub interval_ms: Arc<AtomicU64>,
    pub paused: Arc<AtomicBool>,
}

impl Controls {
    fn new(speed: RefreshSpeed) -> Self {
        Self {
            interval_ms: Arc::new(AtomicU64::new(speed.millis())),
            paused: Arc::new(AtomicBool::new(speed == RefreshSpeed::Paused)),
        }
    }
    pub fn set_speed(&self, speed: RefreshSpeed) {
        self.interval_ms.store(speed.millis(), Ordering::Relaxed);
        self.paused.store(speed == RefreshSpeed::Paused, Ordering::Relaxed);
    }
    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }
}

/// 启动 Collector 线程。返回 (共享快照存储, 命令发送端, 运行时控件)。
pub fn spawn(
    elevated: bool,
    speed: RefreshSpeed,
    on_tick: Box<dyn Fn() + Send + Sync>,
) -> (SnapshotStore, CmdTx, Controls) {
    let store: SnapshotStore = Arc::new(RwLock::new(empty_snapshot()));
    let (tx, rx): (CmdTx, CmdRx) = unbounded::<Command>();
    let store_c = Arc::clone(&store);
    let controls = Controls::new(speed);
    let controls_c = controls.clone();

    std::thread::Builder::new()
        .name("tm-collector".into())
        .spawn(move || {
            if elevated {
                enable_debug_privilege();
            }
            let mut state = SysState::new();
            // 应用历史累计(会话内近似)。
            let mut app_hist: HashMap<String, (f64, u64)> = HashMap::new();
            let mut last_time = Instant::now();
            // GPU(PDH,可能不可用)。
            let gpu = crate::gpu::GpuMonitor::new();
            let mut gpu_history: VecDeque<f32> = VecDeque::with_capacity(60);
            // 预热:首次 CPU≈0,丢弃结果以获得后续准确差分。
            let _ = state.snapshot(elevated);
            loop {
                let ms = controls_c.interval_ms.load(Ordering::Relaxed);
                if ms > 0 {
                    std::thread::sleep(Duration::from_millis(ms));
                } else {
                    // 暂停时短眠,避免忙等。
                    std::thread::sleep(Duration::from_millis(200));
                }
                if controls_c.paused.load(Ordering::Relaxed) {
                    continue;
                }
                // 先排空命令(下个快照前执行,UI 可立即看到效果)。
                while let Ok(cmd) = rx.try_recv() {
                    let _ = exec_command(cmd);
                }
                let mut snap = state.snapshot(elevated);
                let now = Instant::now();
                let dt = now.duration_since(last_time).as_secs_f64().max(0.0);
                last_time = now;
                for p in &snap.processes {
                    let e = app_hist.entry(p.name.clone()).or_insert((0.0, 0));
                    e.0 += (p.cpu_usage as f64 / 100.0) * dt;
                    e.1 += ((p.net_send_bps + p.net_recv_bps) * dt) as u64;
                }
                let mut hist: Vec<AppHistEntry> = app_hist
                    .iter()
                    .map(|(k, (c, n))| AppHistEntry {
                        name: k.clone(),
                        cpu_secs: *c,
                        net_bytes: *n,
                    })
                    .collect();
                hist.sort_by(|a, b| {
                    b.cpu_secs
                        .partial_cmp(&a.cpu_secs)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                snap.app_history = hist;
                // GPU 采样(若可用)。
                if let Some(m) = &gpu {
                    let (util, mem) = m.sample();
                    if gpu_history.len() == 60 {
                        gpu_history.pop_front();
                    }
                    gpu_history.push_back(util);
                    snap.gpus = vec![GpuSnapshot {
                        name: "GPU".into(),
                        usage_pct: Some(util),
                        dedicated_used: Some(mem),
                        dedicated_total: None,
                        history: gpu_history.clone(),
                    }];
                }
                *store_c.write() = snap;
                on_tick();
            }
        })
        .expect("collector thread");

    (store, tx, controls)
}

pub fn empty_snapshot() -> SystemSnapshot {
    SystemSnapshot {
        timestamp: std::time::Instant::now(),
        cpu: CpuSnapshot {
            overall_usage: 0.0,
            per_core: vec![],
            speed_ghz: 0.0,
            history: Default::default(),
            logical_cores: 0,
            physical_cores: 0,
            up_time: Duration::ZERO,
            model_name: String::new(),
            threads: 0,
            handles: 0,
        },
        memory: MemorySnapshot {
            used: 0,
            total: 1,
            available: 0,
            history: Default::default(),
        },
        disks: vec![],
        networks: vec![],
        gpus: vec![],
        processes: vec![],
        elevated: false,
        total_processes: 0,
        app_history: vec![],
    }
}

#[cfg(windows)]
fn exec_command(cmd: Command) -> Result<(), String> {
    use crate::process_ops;
    match cmd {
        Command::Kill(p) => process_ops::kill(p).map_err(|e| e.to_string()),
        Command::Suspend(p) => process_ops::suspend(p).map_err(|e| e.to_string()),
        Command::Resume(p) => process_ops::resume(p).map_err(|e| e.to_string()),
        Command::SetEfficiencyMode(p, on) => {
            process_ops::set_efficiency_mode(p, on).map_err(|e| e.to_string())
        }
        Command::SetPriority(p, c) => process_ops::set_priority(p, c).map_err(|e| e.to_string()),
    }
}

#[cfg(not(windows))]
fn exec_command(_cmd: Command) -> Result<(), String> {
    Ok(())
}
