// lib.rs — 应用入口
// 使用 Tauri Plugin 架构注册各业务模块

mod modules;
mod shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // 业务模块 Plugin
        .plugin(modules::redis_desktop::plugin())
        .plugin(modules::telepresence::plugin())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
