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
    pub history: VecDeque<f32>, // 百分比 0..100
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
    pub exe_path: String,
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
pub enum PowerUsage {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcStatus {
    Running,
    Suspended,
    NotResponding,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcKind {
    App,
    Background,
    Windows,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PriorityClass {
    Realtime,
    High,
    AboveNormal,
    Normal,
    BelowNormal,
    Idle,
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
    Name,
    Cpu,
    Memory,
    Disk,
    Net,
    Power,
    Pid,
    Status,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortDir {
    Asc,
    Desc,
}
