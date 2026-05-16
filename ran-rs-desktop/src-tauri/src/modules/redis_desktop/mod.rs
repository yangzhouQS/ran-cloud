// modules/redis_desktop/mod.rs — Redis Desktop 模块入口
// 使用直接命令注册（非 Plugin 架构），避免 Tauri 2 权限系统复杂性

use std::sync::Arc;
use tauri::Manager;

use connection::RedisConnectionManager;

pub mod cli;
pub mod connection;
pub mod data;
pub mod key;
pub mod shared;
pub mod storage;
pub mod tool;

/// 获取所有 Redis Desktop 命令的 invoke handler 列表
/// 用于在 lib.rs 中通过 tauri::generate_handler! 注册
#[macro_export]
macro_rules! register_redis_desktop_commands {
    () => {
        tauri::generate_handler![
            // ===== 连接管理命令 =====
            $crate::modules::redis_desktop::connection::commands::redis_connection_create,
            $crate::modules::redis_desktop::connection::commands::redis_connection_close,
            $crate::modules::redis_desktop::connection::commands::redis_connection_close_all,
            $crate::modules::redis_desktop::connection::commands::redis_connection_status,
            $crate::modules::redis_desktop::connection::commands::redis_connection_list,
            $crate::modules::redis_desktop::connection::commands::redis_connection_ping,
            $crate::modules::redis_desktop::connection::commands::redis_connection_save,
            $crate::modules::redis_desktop::connection::commands::redis_connection_delete,
            $crate::modules::redis_desktop::connection::commands::redis_connection_select_db,
            $crate::modules::redis_desktop::connection::commands::redis_connection_get_config,
            $crate::modules::redis_desktop::connection::commands::redis_connection_list_info,
            $crate::modules::redis_desktop::connection::commands::redis_connection_test,
            $crate::modules::redis_desktop::connection::commands::redis_connection_get_database_list,
            $crate::modules::redis_desktop::connection::commands::redis_connection_save_all,
            // ===== 存储命令 =====
            $crate::modules::redis_desktop::storage::commands::redis_storage_load_connections,
            $crate::modules::redis_desktop::storage::commands::redis_storage_save_connections,
            $crate::modules::redis_desktop::storage::commands::redis_storage_save_connection,
            $crate::modules::redis_desktop::storage::commands::redis_storage_delete_connection,
            $crate::modules::redis_desktop::storage::commands::redis_storage_load_settings,
            $crate::modules::redis_desktop::storage::commands::redis_storage_save_settings,
            $crate::modules::redis_desktop::storage::commands::redis_storage_load_cli_history,
            $crate::modules::redis_desktop::storage::commands::redis_storage_save_cli_history,
            // ===== Key 操作命令 =====
            $crate::modules::redis_desktop::key::commands::redis_key_scan,
            $crate::modules::redis_desktop::key::commands::redis_key_scan_start,
            $crate::modules::redis_desktop::key::commands::redis_key_scan_cancel,
            $crate::modules::redis_desktop::key::commands::redis_key_scan_continue,
            $crate::modules::redis_desktop::key::commands::redis_key_detail,
            $crate::modules::redis_desktop::key::commands::redis_key_delete,
            $crate::modules::redis_desktop::key::commands::redis_key_rename,
            $crate::modules::redis_desktop::key::commands::redis_key_expire,
            $crate::modules::redis_desktop::key::commands::redis_key_type,
            // ===== 数据类型操作命令 =====
            // -- String --
            $crate::modules::redis_desktop::data::commands::redis_data_string_get,
            $crate::modules::redis_desktop::data::commands::redis_data_string_set,
            // -- Hash --
            $crate::modules::redis_desktop::data::commands::redis_data_hash_page,
            $crate::modules::redis_desktop::data::commands::redis_data_hash_add,
            $crate::modules::redis_desktop::data::commands::redis_data_hash_update,
            $crate::modules::redis_desktop::data::commands::redis_data_hash_delete,
            // -- List --
            $crate::modules::redis_desktop::data::commands::redis_data_list_page,
            $crate::modules::redis_desktop::data::commands::redis_data_list_add,
            $crate::modules::redis_desktop::data::commands::redis_data_list_update,
            $crate::modules::redis_desktop::data::commands::redis_data_list_delete,
            // -- Set --
            $crate::modules::redis_desktop::data::commands::redis_data_set_page,
            $crate::modules::redis_desktop::data::commands::redis_data_set_add,
            $crate::modules::redis_desktop::data::commands::redis_data_set_delete,
            // -- ZSet --
            $crate::modules::redis_desktop::data::commands::redis_data_zset_page,
            $crate::modules::redis_desktop::data::commands::redis_data_zset_add,
            $crate::modules::redis_desktop::data::commands::redis_data_zset_update,
            $crate::modules::redis_desktop::data::commands::redis_data_zset_delete,
            // -- Stream --
            $crate::modules::redis_desktop::data::commands::redis_data_stream_page,
            $crate::modules::redis_desktop::data::commands::redis_data_stream_add,
            $crate::modules::redis_desktop::data::commands::redis_data_stream_delete,
            $crate::modules::redis_desktop::data::commands::redis_data_stream_groups,
            // ===== CLI 命令 =====
            $crate::modules::redis_desktop::cli::commands::redis_cli_exec,
            $crate::modules::redis_desktop::cli::commands::redis_cli_complete,
            // ===== 运维工具命令 =====
            $crate::modules::redis_desktop::tool::commands::redis_tool_command_log_init,
            $crate::modules::redis_desktop::tool::commands::redis_tool_command_log_list,
            $crate::modules::redis_desktop::tool::commands::redis_tool_command_log_clear,
            $crate::modules::redis_desktop::tool::commands::redis_tool_command_log_clear_all,
            $crate::modules::redis_desktop::tool::commands::redis_tool_slow_log,
            $crate::modules::redis_desktop::tool::commands::redis_tool_memory_analysis,
            $crate::modules::redis_desktop::tool::commands::redis_tool_server_status,
            $crate::modules::redis_desktop::tool::commands::redis_tool_database_list,
            $crate::modules::redis_desktop::tool::commands::redis_tool_server_info,
            $crate::modules::redis_desktop::tool::commands::redis_tool_client_list,
        ]
    };
}

/// 初始化 Redis Desktop 模块状态
/// 在 Tauri Builder 的 setup 中调用
pub fn setup(app: &tauri::App) {
    let manager = Arc::new(RedisConnectionManager::new());
    app.manage(manager);
    log::info!("Redis Desktop 模块已加载（直接命令注册模式）");
}
