fn main() {
    let m = tm_core::gpu::GpuMonitor::new();
    match m {
        Some(m) => {
            // 速率型计数器需两次采集间隔;先睡 1s。
            std::thread::sleep(std::time::Duration::from_secs(1));
            let (util, mem) = m.sample();
            println!("GPU: util={:.1}%  dedicated={} MB", util, mem / 1024 / 1024);
            std::thread::sleep(std::time::Duration::from_secs(1));
            let (util2, mem2) = m.sample();
            println!("GPU: util={:.1}%  dedicated={} MB", util2, mem2 / 1024 / 1024);
        }
        None => println!("GPU 计数器不可用(无独显或驱动未暴露计数器)"),
    }
}
