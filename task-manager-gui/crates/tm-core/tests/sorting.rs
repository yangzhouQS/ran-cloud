use tm_core::models::{ProcColumn, ProcInfo, ProcKind, ProcStatus, PowerUsage, SortDir};
use tm_core::sorting::sort_processes;

fn p(
    pid: u32,
    name: &str,
    cpu: f32,
    mem: u64,
    net: f64,
    power: PowerUsage,
    status: ProcStatus,
) -> ProcInfo {
    ProcInfo {
        pid,
        name: name.into(),
        exe_path: String::new(),
        user: None,
        session_id: None,
        cpu_usage: cpu,
        memory_bytes: mem,
        disk_read_bps: 0.0,
        disk_write_bps: 0.0,
        net_send_bps: net,
        net_recv_bps: 0.0,
        power_usage: power,
        efficiency_mode: false,
        status,
        kind: ProcKind::App,
    }
}

#[test]
fn sort_by_cpu_desc() {
    let mut v = vec![
        p(1, "a", 1.0, 0, 0.0, PowerUsage::Low, ProcStatus::Running),
        p(2, "b", 50.0, 0, 0.0, PowerUsage::High, ProcStatus::Running),
    ];
    sort_processes(&mut v, ProcColumn::Cpu, SortDir::Desc);
    assert_eq!(v[0].pid, 2);
}

#[test]
fn sort_by_memory_asc() {
    let mut v = vec![
        p(1, "a", 0.0, 300, 0.0, PowerUsage::Low, ProcStatus::Running),
        p(2, "b", 0.0, 100, 0.0, PowerUsage::Low, ProcStatus::Running),
    ];
    sort_processes(&mut v, ProcColumn::Memory, SortDir::Asc);
    assert_eq!(v[0].memory_bytes, 100);
}

#[test]
fn sort_by_name_ignores_case() {
    let mut v = vec![
        p(1, "banana", 0.0, 0, 0.0, PowerUsage::Low, ProcStatus::Running),
        p(2, "Apple", 0.0, 0, 0.0, PowerUsage::Low, ProcStatus::Running),
    ];
    sort_processes(&mut v, ProcColumn::Name, SortDir::Asc);
    assert_eq!(v[0].name, "Apple"); // 'a' < 'b'
}

#[test]
fn tie_break_by_name_then_pid() {
    let mut v = vec![
        p(9, "z", 5.0, 0, 0.0, PowerUsage::Medium, ProcStatus::Running),
        p(1, "a", 5.0, 0, 0.0, PowerUsage::Medium, ProcStatus::Running),
    ];
    sort_processes(&mut v, ProcColumn::Cpu, SortDir::Desc);
    assert_eq!(v[0].name, "a"); // CPU 相同 → 按名称
}
