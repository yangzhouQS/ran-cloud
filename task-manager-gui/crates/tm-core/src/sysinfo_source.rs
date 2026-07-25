//! sysinfo → SystemSnapshot 适配。持有 SysState,供 Collector 两次采样间差分 CPU。

use std::collections::{HashMap, HashSet, VecDeque};

use sysinfo::{
    Disks, MemoryRefreshKind, Networks, ProcessRefreshKind, ProcessesToUpdate, System,
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
    pub disk_history: HashMap<String, VecDeque<f32>>,
    pub net_history: HashMap<String, VecDeque<f32>>,
    pub net_accum: HashMap<String, (u64, u64, u64)>,
}

impl Default for SysState {
    fn default() -> Self {
        Self::new()
    }
}

impl SysState {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        let disks = Disks::new_with_refreshed_list();
        let nets = Networks::new_with_refreshed_list();
        Self {
            sys,
            disks,
            nets,
            cpu_history: VecDeque::with_capacity(HISTORY_LEN),
            mem_history: VecDeque::with_capacity(HISTORY_LEN),
            disk_history: HashMap::new(),
            net_history: HashMap::new(),
            net_accum: HashMap::new(),
        }
    }

    /// 刷新并产出快照。调用方应间隔 ~1s 调用两次以获得准确 CPU%(首次 CPU≈0)。
    pub fn snapshot(&mut self, elevated: bool) -> SystemSnapshot {
        let pkind = ProcessRefreshKind::everything();
        self.sys.refresh_cpu_usage();
        self.sys.refresh_processes_specifics(ProcessesToUpdate::All, true, pkind);
        self.sys.refresh_memory_specifics(MemoryRefreshKind::everything());
        self.disks.refresh();
        self.nets.refresh();

        let mut cpu = self.build_cpu();
        let mut memory = self.build_memory();

        push(&mut self.cpu_history, cpu.overall_usage);
        push(&mut self.mem_history, mem_pct(memory.used, memory.total));
        cpu.history = self.cpu_history.clone();
        memory.history = self.mem_history.clone();

        let winset = window_pids();
        let processes = self
            .sys
            .processes()
            .values()
            .map(|p| to_proc_info(p, &winset))
            .collect::<Vec<_>>();

        SystemSnapshot {
            timestamp: std::time::Instant::now(),
            cpu,
            memory,
            disks: self.build_disks(),
            networks: self.build_networks(),
            gpus: Vec::new(),
            total_processes: processes.len(),
            elevated,
            processes,
            app_history: Vec::new(),
        }
    }

    fn build_cpu(&self) -> CpuSnapshot {
        let per_core: Vec<f32> = self.sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let overall = self.sys.global_cpu_usage();
        let logical = self.sys.cpus().len();
        let physical = self.sys.physical_core_count().unwrap_or(logical);
        let speed = self
            .sys
            .cpus()
            .first()
            .map(|c| c.frequency() as f32 / 1000.0)
            .unwrap_or(0.0);
        CpuSnapshot {
            overall_usage: overall,
            per_core,
            speed_ghz: speed,
            history: VecDeque::new(),
            logical_cores: logical,
            physical_cores: physical,
            up_time: std::time::Duration::from_secs(System::uptime()),
            model_name: self
                .sys
                .cpus()
                .first()
                .map(|c| c.brand().to_string())
                .unwrap_or_default(),
            threads: 0,
            handles: 0,
        }
    }

    fn build_memory(&self) -> MemorySnapshot {
        let total = self.sys.total_memory();
        let used = self.sys.used_memory();
        MemorySnapshot {
            used,
            total,
            available: total.saturating_sub(used),
            history: VecDeque::new(),
        }
    }

    fn build_disks(&mut self) -> Vec<DiskSnapshot> {
        // 先以不可变借用收集原始数据,再以可变借用写历史,避免同时借用 self。
        let raw: Vec<(String, u64, u64, f32)> = self
            .disks
            .list()
            .iter()
            .map(|d| {
                let total = d.total_space();
                let used = total.saturating_sub(d.available_space());
                let usage = if total == 0 {
                    0.0
                } else {
                    used as f32 * 100.0 / total as f32
                };
                (d.name().to_string_lossy().into_owned(), used, total, usage)
            })
            .collect();

        raw.into_iter()
            .map(|(name, used, total, usage)| {
                let hist = self.disk_history.entry(name.clone()).or_default();
                push(hist, usage);
                DiskSnapshot {
                    name,
                    used,
                    total,
                    read_bps: 0.0,
                    write_bps: 0.0,
                    activity_pct: usage,
                    response_time_ms: 0.0,
                    history: hist.clone(),
                }
            })
            .collect()
    }

    /// 逐网卡计算收发速率与历史,返回每个网卡的快照。
    fn build_networks(&mut self) -> Vec<NetworkSnapshot> {
        let now_up = System::uptime();
        let mut out: Vec<NetworkSnapshot> = Vec::new();
        for (name, n) in self.nets.list() {
            // 跳过回环等明显虚拟接口。
            let lname = name.to_ascii_lowercase();
            if lname.contains("loopback") {
                continue;
            }
            let send = n.transmitted();
            let recv = n.received();
            let (sps, rps) = {
                let e = self
                    .net_accum
                    .entry(name.clone())
                    .or_insert((0, 0, 0));
                let dt = (now_up.saturating_sub(e.2)).max(1) as f64;
                let s = bytes_per_sec(send, e.0, dt);
                let r = bytes_per_sec(recv, e.1, dt);
                e.0 = send;
                e.1 = recv;
                e.2 = now_up;
                (s, r)
            };
            let hist = self
                .net_history
                .entry(name.clone())
                .or_insert_with(|| VecDeque::with_capacity(HISTORY_LEN));
            push(hist, (sps + rps) as f32);
            out.push(NetworkSnapshot {
                send_bps: sps,
                recv_bps: rps,
                history: hist.clone(),
                adapter: friendly_adapter_name(name),
            });
        }
        // 排序:以太网在前、Wi-Fi 次之、其余按名。
        out.sort_by_key(|n| adapter_rank(&n.adapter));
        out
    }
}

fn adapter_rank(name: &str) -> u8 {
    let l = name.to_ascii_lowercase();
    if l.contains("以太网") || l.contains("ethernet") {
        0
    } else if l.contains("wi-fi") || l.contains("wlan") {
        1
    } else {
        2
    }
}

/// 把 sysinfo 的网卡名映射为友好名(以太网 / Wi-Fi / 原名)。
fn friendly_adapter_name(name: &str) -> String {
    let l = name.to_ascii_lowercase();
    if l.contains("wlan") || l.contains("wi-fi") || l.contains("wifi") || l.contains("wireless") {
        "Wi-Fi".into()
    } else if l.contains("以太网") || l.contains("ethernet") || l.contains("eth") {
        "以太网".into()
    } else {
        name.to_string()
    }
}

fn to_proc_info(p: &sysinfo::Process, winset: &HashSet<u32>) -> ProcInfo {
    let pid = p.pid().as_u32();
    let has_window = winset.contains(&pid);
    let du = p.disk_usage();
    let net_io = du.read_bytes as f64 + du.written_bytes as f64;
    let exe_path = p
        .exe()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();
    let name = p.name().to_string_lossy().into_owned();
    ProcInfo {
        pid,
        name: name.clone(),
        exe_path: exe_path.clone(),
        user: p.user_id().map(|u| u.to_string()),
        session_id: crate::win_source::session_id(pid),
        cpu_usage: p.cpu_usage(),
        memory_bytes: p.memory(),
        disk_read_bps: du.read_bytes as f64,
        disk_write_bps: du.written_bytes as f64,
        net_send_bps: 0.0,
        net_recv_bps: 0.0,
        power_usage: estimate_power_usage(p.cpu_usage(), net_io),
        efficiency_mode: false,
        status: ProcStatus::Running,
        kind: classify_kind(&name, &exe_path, has_window),
    }
}

fn mem_pct(used: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        used as f32 * 100.0 / total as f32
    }
}

fn bytes_per_sec(now: u64, prev: u64, dt: f64) -> f64 {
    now.saturating_sub(prev) as f64 / dt
}

fn push(buf: &mut VecDeque<f32>, v: f32) {
    if buf.len() == HISTORY_LEN {
        buf.pop_front();
    }
    buf.push_back(v);
}
