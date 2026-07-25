fn main() {
    let svcs = tm_core::services::enumerate();
    println!("services count = {}", svcs.len());
    let running = svcs.iter().filter(|s| s.status == tm_core::services::ServiceState::Running).count();
    println!("running = {}", running);
    for s in svcs.iter().take(8) {
        println!("  {:?} | {:?} | {} | {}", s.status, s.start_type, s.name, s.display_name);
    }
}
