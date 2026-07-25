//! 后台采集:按 interval 轮询快照写入 Arc<RwLock>,并消费 Command channel。
//!
//! `on_tick` 每次刷新后被调用(UI 侧用它触发 egui::Context::request_repaint)。

use std::sync::Arc;
use std::time::Duration;

use crossbeam_channel::{unbounded, Receiver, Sender};
use parking_lot::RwLock;

use crate::models::*;
use crate::sysinfo_source::{NetAccum, SysState};

pub type SnapshotStore = Arc<RwLock<SystemSnapshot>>;
pub type CmdTx = Sender<Command>;
pub type CmdRx = Receiver<Command>;

/// 启动 Collector 线程。返回 (共享快照存储, 命令发送端)。
pub fn spawn(interval: Duration, elevated: bool, on_tick: Box<dyn Fn() + Send + Sync>) -> (SnapshotStore, CmdTx) {
    let store: SnapshotStore = Arc::new(RwLock::new(empty_snapshot()));
    let (tx, rx): (CmdTx, CmdRx) = unbounded::<Command>();
    let store_c = Arc::clone(&store);

    std::thread::Builder::new()
        .name("tm-collector".into())
        .spawn(move || {
            let mut state = SysState::new();
            let mut net = NetAccum::new();
            // 预热:首次 CPU≈0,丢弃结果以获得后续准确差分。
            let _ = state.snapshot(elevated, &mut net);
            loop {
                std::thread::sleep(interval);
                // 先排空命令(下个快照前执行,UI 可立即看到效果)。
                while let Ok(cmd) = rx.try_recv() {
                    let _ = exec_command(cmd);
                }
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
        network: NetworkSnapshot {
            send_bps: 0.0,
            recv_bps: 0.0,
            history: Default::default(),
            adapter: String::new(),
        },
        gpus: vec![],
        processes: vec![],
        elevated: false,
        total_processes: 0,
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
