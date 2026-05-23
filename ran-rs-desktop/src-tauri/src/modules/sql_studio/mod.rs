// modules/sql-studio/mod.rs — SQL Studio 模块入口
// 多数据库 SQL 编辑器和管理工具
// 支持 PostgreSQL、MySQL、MariaDB、TiDB、SQLite

pub mod connection;
pub mod drivers;
pub mod plugin;
pub mod query;
pub mod storage;
pub mod tunnel;

use std::sync::Arc;
use tauri::Manager;

use connection::SqlConnectionManager;
use tunnel::SqlTunnelService;
use crate::modules::redis_desktop::tunnel::SshTunnelManager;

/// 初始化 SQL Studio 模块状态
/// 在 Tauri Builder 的 setup 中调用
pub fn setup(app: &tauri::App) {
    let manager = Arc::new(SqlConnectionManager::new());
    app.manage(manager);
    log::info!("SQL Studio 模块已加载");
}

/// 初始化 SQL Studio 模块（带 SSH 隧道支持）
/// 接收共享的 SshTunnelManager 实例
pub fn setup_with_tunnel(
    app: &tauri::App,
    ssh_tunnel_manager: Arc<SshTunnelManager>,
) -> Result<(), Box<dyn std::error::Error>> {
    // 初始化存储服务
    let data_dir = app.path().app_data_dir()?;
    let sql_storage = Arc::new(
        crate::modules::sql_studio::storage::service::StorageService::new(
            data_dir.join("sql_studio")
        )?
    );
    app.manage(sql_storage.clone());
    log::info!("SQL Studio 存储已初始化");

    // 初始化隧道服务（包装共享的 SshTunnelManager）
    let tunnel_service = Arc::new(SqlTunnelService::new(ssh_tunnel_manager));
    app.manage(tunnel_service.clone());
    log::info!("SQL Studio SSH 隧道服务已初始化");

    // 初始化连接管理器（预加载配置）
    let configs = sql_storage.list_connection_configs()?;
    let config_count = configs.len();
    let mut sql_manager = SqlConnectionManager::new_with_configs(configs);
    sql_manager.set_tunnel_service(tunnel_service);
    let sql_manager = Arc::new(sql_manager);
    app.manage(sql_manager);
    log::info!("SQL Studio 模块已加载（已加载 {} 个连接配置，SSH 隧道已启用）", config_count);

    // 初始化插件系统
    let plugin_data_store = Arc::new(
        plugin::store::PluginDataStore::new(
            data_dir.join("plugins")
        )?
    );
    app.manage(plugin_data_store.clone());

    let plugin_manager = Arc::new(
        plugin::manager::PluginManager::new(
            data_dir.join("plugins"),
            plugin_data_store,
        )
    );
    let plugin_count = plugin_manager.discover_plugins().unwrap_or(0);
    app.manage(plugin_manager);
    log::info!("SQL Studio 插件系统已初始化（发现 {} 个插件）", plugin_count);

    Ok(())
}
