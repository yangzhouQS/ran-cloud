// query_benchmark.rs — 性能基准测试（Tier 4）
// 运行方式: cargo bench

use std::sync::Arc;

use ran_rs_desktop_lib::modules::sql_studio::plugin::store::PluginDataStore;
use ran_rs_desktop_lib::modules::sql_studio::plugin::models::{PluginApiRequest, PluginApiResponse};

/// 简单的计时辅助函数（替代 criterion，避免额外依赖）
fn bench<F: FnMut()>(mut f: F, iterations: u64) -> std::time::Duration {
    let start = std::time::Instant::now();
    for _ in 0..iterations {
        f();
    }
    start.elapsed()
}

fn main() {
    println!("=== Phase 6 Benchmarks ===\n");

    let temp = tempfile::tempdir().unwrap();

    // --- Plugin Store set/get ---
    let store = Arc::new(PluginDataStore::new(temp.path().join("bench_store")).unwrap());

    let set_time = bench(|| {
        store.set_data("bench-plugin", "bench-key", &serde_json::json!({"value": 42})).unwrap();
    }, 1000);
    println!("Plugin Store set_data x1000: {:?}", set_time);

    let get_time = bench(|| {
        let _ = store.get_data("bench-plugin", "bench-key").unwrap();
    }, 10000);
    println!("Plugin Store get_data x10000: {:?}", get_time);

    // --- Manifest parsing ---
    let manifest_json = r#"{
        "id": "com.bench.plugin",
        "name": "Benchmark Plugin",
        "version": "1.0.0",
        "description": "Benchmark test",
        "manifestVersion": 1,
        "capabilities": { "views": [], "menu": [] }
    }"#;

    let parse_time = bench(|| {
        let _: ran_rs_desktop_lib::modules::sql_studio::plugin::models::PluginManifest =
            serde_json::from_str(manifest_json).unwrap();
    }, 10000);
    println!("Manifest parse x10000: {:?}", parse_time);

    // --- ConnectionConfig serde ---
    let config = ran_rs_desktop_lib::modules::sql_studio::connection::models::ConnectionConfig {
        id: "bench-1".to_string(),
        name: "Benchmark".to_string(),
        db_type: ran_rs_desktop_lib::modules::sql_studio::connection::models::DatabaseType::Postgresql,
        host: Some("localhost".to_string()),
        port: Some(5432),
        user: Some("root".to_string()),
        password: Some("secret".to_string()),
        database: Some("testdb".to_string()),
        url: None,
        ssl: ran_rs_desktop_lib::modules::sql_studio::connection::models::SslConfig::default(),
        ssh: ran_rs_desktop_lib::modules::sql_studio::connection::models::SshTunnelConfig::default(),
        options: None,
    };

    let serde_time = bench(|| {
        let json = serde_json::to_string(&config).unwrap();
        let _: ran_rs_desktop_lib::modules::sql_studio::connection::models::ConnectionConfig =
            serde_json::from_str(&json).unwrap();
    }, 10000);
    println!("ConnectionConfig serde roundtrip x10000: {:?}", serde_time);

    println!("\n=== Benchmarks complete ===");
}
