use tm_core::sysinfo_source::SysState;

fn main() {
    let mut s = SysState::new();
    let _ = s.snapshot(false);
    std::thread::sleep(std::time::Duration::from_secs(1));
    let snap = s.snapshot(false);
    println!("network adapters:");
    for n in &snap.networks {
        println!(
            "  {} : 发送 {:.1} Kbps / 接收 {:.1} Kbps",
            n.adapter,
            n.send_bps * 8.0 / 1e3,
            n.recv_bps * 8.0 / 1e3
        );
    }
}
