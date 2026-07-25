use tm_core::sysinfo_source::{NetAccum, SysState};

fn main() {
    let su = tm_core::startup::enumerate();
    println!("startup entries = {}", su.len());
    for e in su.iter().take(6) {
        println!("  [{}] {} -> {}", e.location, e.name, e.command);
    }

    let mut s = SysState::new();
    let _ = s.snapshot(false, &mut NetAccum::new());
    std::thread::sleep(std::time::Duration::from_secs(1));
    let snap = s.snapshot(false, &mut NetAccum::new());

    let u = tm_core::users::enumerate(&snap);
    println!("users = {}", u.len());
    for x in u.iter().take(6) {
        println!(
            "  session={} {} | {} | cpu={:.1}% | mem={:.0}MB",
            x.session_id,
            x.name,
            x.state,
            x.cpu,
            x.memory as f64 / 1e6
        );
    }
    println!("app_history entries = {}", snap.app_history.len());
    for a in snap.app_history.iter().take(5) {
        println!("  {} cpu={:.1}s net={}B", a.name, a.cpu_secs, a.net_bytes);
    }
}
