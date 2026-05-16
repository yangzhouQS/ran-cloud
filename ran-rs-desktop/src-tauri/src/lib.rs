// lib.rs — 应用入口
// 使用直接命令注册模式（非 Plugin），避免 Tauri 2 权限系统复杂性

mod modules;
mod shared;

use std::sync::Arc;
use tauri::Manager;
use modules::redis_desktop::connection::RedisConnectionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // 业务模块 — 直接注册命令（无需 Plugin 权限配置）
        .invoke_handler(tauri::generate_handler![
            // ===== 连接管理命令 =====
            modules::redis_desktop::connection::commands::redis_connection_create,
            modules::redis_desktop::connection::commands::redis_connection_close,
            modules::redis_desktop::connection::commands::redis_connection_close_all,
            modules::redis_desktop::connection::commands::redis_connection_status,
            modules::redis_desktop::connection::commands::redis_connection_list,
            modules::redis_desktop::connection::commands::redis_connection_ping,
            modules::redis_desktop::connection::commands::redis_connection_save,
            modules::redis_desktop::connection::commands::redis_connection_delete,
            modules::redis_desktop::connection::commands::redis_connection_select_db,
            modules::redis_desktop::connection::commands::redis_connection_get_config,
            modules::redis_desktop::connection::commands::redis_connection_list_info,
            modules::redis_desktop::connection::commands::redis_connection_test,
            modules::redis_desktop::connection::commands::redis_connection_get_database_list,
            modules::redis_desktop::connection::commands::redis_connection_save_all,
            // ===== 存储命令 =====
            modules::redis_desktop::storage::commands::redis_storage_load_connections,
            modules::redis_desktop::storage::commands::redis_storage_save_connections,
            modules::redis_desktop::storage::commands::redis_storage_save_connection,
            modules::redis_desktop::storage::commands::redis_storage_delete_connection,
            modules::redis_desktop::storage::commands::redis_storage_load_settings,
            modules::redis_desktop::storage::commands::redis_storage_save_settings,
            modules::redis_desktop::storage::commands::redis_storage_load_cli_history,
            modules::redis_desktop::storage::commands::redis_storage_save_cli_history,
            // ===== Key 操作命令 =====
            modules::redis_desktop::key::commands::redis_key_scan,
            modules::redis_desktop::key::commands::redis_key_scan_start,
            modules::redis_desktop::key::commands::redis_key_scan_cancel,
            modules::redis_desktop::key::commands::redis_key_scan_continue,
            modules::redis_desktop::key::commands::redis_key_detail,
            modules::redis_desktop::key::commands::redis_key_delete,
            modules::redis_desktop::key::commands::redis_key_rename,
            modules::redis_desktop::key::commands::redis_key_expire,
            modules::redis_desktop::key::commands::redis_key_type,
            // ===== 数据类型操作命令 =====
            modules::redis_desktop::data::commands::redis_data_string_get,
            modules::redis_desktop::data::commands::redis_data_string_set,
            modules::redis_desktop::data::commands::redis_data_hash_page,
            modules::redis_desktop::data::commands::redis_data_hash_add,
            modules::redis_desktop::data::commands::redis_data_hash_update,
            modules::redis_desktop::data::commands::redis_data_hash_delete,
            modules::redis_desktop::data::commands::redis_data_list_page,
            modules::redis_desktop::data::commands::redis_data_list_add,
            modules::redis_desktop::data::commands::redis_data_list_update,
            modules::redis_desktop::data::commands::redis_data_list_delete,
            modules::redis_desktop::data::commands::redis_data_set_page,
            modules::redis_desktop::data::commands::redis_data_set_add,
            modules::redis_desktop::data::commands::redis_data_set_delete,
            modules::redis_desktop::data::commands::redis_data_zset_page,
            modules::redis_desktop::data::commands::redis_data_zset_add,
            modules::redis_desktop::data::commands::redis_data_zset_update,
            modules::redis_desktop::data::commands::redis_data_zset_delete,
            modules::redis_desktop::data::commands::redis_data_stream_page,
            modules::redis_desktop::data::commands::redis_data_stream_add,
            modules::redis_desktop::data::commands::redis_data_stream_delete,
            modules::redis_desktop::data::commands::redis_data_stream_groups,
            // ===== CLI 命令 =====
            modules::redis_desktop::cli::commands::redis_cli_exec,
            modules::redis_desktop::cli::commands::redis_cli_complete,
            modules::redis_desktop::cli::commands::redis_cli_syntax,
            modules::redis_desktop::cli::commands::redis_cli_commands,
            modules::redis_desktop::cli::commands::redis_cli_commands_by_group,
            // ===== 运维工具命令 =====
            modules::redis_desktop::tool::commands::redis_tool_command_log_init,
            modules::redis_desktop::tool::commands::redis_tool_command_log_list,
            modules::redis_desktop::tool::commands::redis_tool_command_log_clear,
            modules::redis_desktop::tool::commands::redis_tool_command_log_clear_all,
            modules::redis_desktop::tool::commands::redis_tool_slow_log,
            modules::redis_desktop::tool::commands::redis_tool_memory_analysis,
            modules::redis_desktop::tool::commands::redis_tool_server_status,
            modules::redis_desktop::tool::commands::redis_tool_database_list,
            modules::redis_desktop::tool::commands::redis_tool_server_info,
            modules::redis_desktop::tool::commands::redis_tool_client_list,
            modules::redis_desktop::tool::commands::redis_tool_flush_db,
            modules::redis_desktop::tool::commands::redis_tool_flush_all,
        ])
        .setup(|app| {
            // 初始化 Redis 连接管理器
            let manager = Arc::new(RedisConnectionManager::new());
            app.manage(manager);
            log::info!("Redis Desktop 模块已加载（直接命令注册模式）");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
