use tm_core::sysinfo_source::{NetAccum, SysState};

fn main() {
    let mut s = SysState::new();
    let _ = s.snapshot(false, &mut NetAccum::new()); // 预热(首次 CPU≈0)
    std::thread::sleep(std::time::Duration::from_secs(1));
    let snap = s.snapshot(false, &mut NetAccum::new());

    println!(
        "processes={} cpu={:.1}% mem={:.2}GiB / {:.2}GiB",
        snap.total_processes,
        snap.cpu.overall_usage,
        snap.memory.used as f64 / 1024.0 / 1024.0 / 1024.0,
        snap.memory.total as f64 / 1024.0 / 1024.0 / 1024.0,
    );
    for p in snap.processes.iter().take(8) {
        println!("  pid={:>6} cpu={:>5.1}% mem={:>6.0}MB  kind={:?}  {}", p.pid, p.cpu_usage, p.memory_bytes as f64 / 1024.0 / 1024.0, p.kind, p.name);
    }
}
