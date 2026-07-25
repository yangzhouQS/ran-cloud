use tm_core::process_ops::kill;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let pid: u32 = args.get(1).and_then(|s| s.parse().ok()).expect("usage: ops_demo <pid>");
    match kill(pid) {
        Ok(()) => println!("killed {pid}"),
        Err(e) => println!("err: {e:?}"),
    }
}
