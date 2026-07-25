//! 进程列表排序:按列 + 方向;主键相同则按名称(再按 PID)兜底,保证稳定顺序。

use crate::models::{ProcColumn, ProcInfo, SortDir};

pub fn sort_processes(v: &mut [ProcInfo], col: ProcColumn, dir: SortDir) {
    v.sort_by(|a, b| {
        let primary = match col {
            ProcColumn::Name => {
                a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase())
            }
            ProcColumn::Cpu => cmp_f32(a.cpu_usage, b.cpu_usage),
            ProcColumn::Memory => a.memory_bytes.cmp(&b.memory_bytes),
            ProcColumn::Disk => cmp_f64(
                a.disk_read_bps + a.disk_write_bps,
                b.disk_read_bps + b.disk_write_bps,
            ),
            ProcColumn::Net => cmp_f64(
                a.net_send_bps + a.net_recv_bps,
                b.net_send_bps + b.net_recv_bps,
            ),
            ProcColumn::Power => (a.power_usage as u8).cmp(&(b.power_usage as u8)),
            ProcColumn::Pid => a.pid.cmp(&b.pid),
            ProcColumn::Status => (a.status as u8).cmp(&(b.status as u8)),
        };
        let primary = flip(primary, dir);
        if primary != std::cmp::Ordering::Equal {
            primary
        } else {
            // 兜底:名称 → PID,固定升序,保证稳定。
            a.name
                .to_ascii_lowercase()
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
