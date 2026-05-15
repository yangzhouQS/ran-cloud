// modules/redis_desktop/mod.rs — Redis Desktop 模块入口
// 注册为 Tauri Plugin，所有 Redis 相关功能的统一入口

use std::sync::Arc;
use tauri::{plugin::TauriPlugin, Manager};

use connection::RedisConnectionManager;

pub mod cli;
pub mod connection;
pub mod data;
pub mod key;
pub mod shared;
pub mod storage;
pub mod tool;

/// Redis Desktop Plugin 工厂函数
/// 返回一个完整的 TauriPlugin，包含所有 Redis 相关命令和状态管理
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("redis-desktop")
        .invoke_handler(tauri::generate_handler![
            // ===== 连接管理命令 =====
            connection::commands::redis_connection_create,
            connection::commands::redis_connection_close,
            connection::commands::redis_connection_close_all,
            connection::commands::redis_connection_status,
            connection::commands::redis_connection_list,
            connection::commands::redis_connection_ping,
            connection::commands::redis_connection_save,
            connection::commands::redis_connection_delete,
            connection::commands::redis_connection_select_db,
            connection::commands::redis_connection_get_config,
            connection::commands::redis_connection_list_info,
            connection::commands::redis_connection_test,
            connection::commands::redis_connection_get_database_list,
            connection::commands::redis_connection_save_all,
            // ===== 存储命令 =====
            storage::commands::redis_storage_load_connections,
            storage::commands::redis_storage_save_connections,
            storage::commands::redis_storage_save_connection,
            storage::commands::redis_storage_delete_connection,
            storage::commands::redis_storage_load_settings,
            storage::commands::redis_storage_save_settings,
            storage::commands::redis_storage_load_cli_history,
            storage::commands::redis_storage_save_cli_history,
            // ===== Key 操作命令 =====
            key::commands::redis_key_scan,
            key::commands::redis_key_scan_start,
            key::commands::redis_key_scan_cancel,
            key::commands::redis_key_scan_continue,
            key::commands::redis_key_detail,
            key::commands::redis_key_delete,
            key::commands::redis_key_rename,
            key::commands::redis_key_expire,
            key::commands::redis_key_type,
            // ===== 数据类型操作命令 =====
            // -- String --
            data::commands::redis_data_string_get,
            data::commands::redis_data_string_set,
            // -- Hash --
            data::commands::redis_data_hash_page,
            data::commands::redis_data_hash_add,
            data::commands::redis_data_hash_update,
            data::commands::redis_data_hash_delete,
            // -- List --
            data::commands::redis_data_list_page,
            data::commands::redis_data_list_add,
            data::commands::redis_data_list_update,
            data::commands::redis_data_list_delete,
            // -- Set --
            data::commands::redis_data_set_page,
            data::commands::redis_data_set_add,
            data::commands::redis_data_set_delete,
            // -- ZSet --
            data::commands::redis_data_zset_page,
            data::commands::redis_data_zset_add,
            data::commands::redis_data_zset_update,
            data::commands::redis_data_zset_delete,
            // -- Stream --
            data::commands::redis_data_stream_page,
            data::commands::redis_data_stream_add,
            data::commands::redis_data_stream_delete,
            data::commands::redis_data_stream_groups,
            // ===== CLI 命令 =====
            cli::commands::redis_cli_exec,
            cli::commands::redis_cli_complete,
            // ===== 运维工具命令 =====
            tool::commands::redis_tool_command_log_init,
            tool::commands::redis_tool_command_log_list,
            tool::commands::redis_tool_command_log_clear,
            tool::commands::redis_tool_command_log_clear_all,
            tool::commands::redis_tool_slow_log,
            tool::commands::redis_tool_memory_analysis,
            tool::commands::redis_tool_server_status,
            tool::commands::redis_tool_database_list,
            tool::commands::redis_tool_server_info,
            tool::commands::redis_tool_client_list,
        ])
        .setup(|app, _api| {
            // 初始化连接管理器
            let manager = Arc::new(RedisConnectionManager::new());
            app.manage(manager);
            log::info!("Redis Desktop Plugin 已加载");
            Ok(())
        })
        .build()
}
