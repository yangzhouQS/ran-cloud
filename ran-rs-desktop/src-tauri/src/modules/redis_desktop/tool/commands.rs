// modules/redis_desktop/tool/commands.rs — tool Tauri Commands
// slow log, memory analysis, status monitoring, command log, flush db

use std::sync::Arc;
use tauri::AppHandle;

use crate::shared::error::AppError;
use crate::shared::result::AppResult;
use crate::modules::redis_desktop::connection::RedisConnectionManager;
use crate::modules::redis_desktop::tool::models::*;
use crate::modules::redis_desktop::tool::service::{
    ClientListService, CommandLogService, FlushDbService, InfoService,
    MemoryAnalysisService, SlowLogService,
};

// ==================== command log ====================

/// get command logs for a connection
#[tauri::command]
pub async fn redis_tool_command_log_list(
    params: CommandLogQueryParams,
) -> AppResult<Vec<CommandLogEntry>> {
    Ok(CommandLogService::get_logs(&params))
}

/// clear command logs for a connection
#[tauri::command]
pub async fn redis_tool_command_log_clear(
    connection_id: String,
) -> AppResult<()> {
    CommandLogService::clear_logs(&connection_id)
}

/// clear all command logs
#[tauri::command]
pub async fn redis_tool_command_log_clear_all() -> AppResult<()> {
    CommandLogService::clear_all_logs()
}

/// init command log service with AppHandle
#[tauri::command]
pub async fn redis_tool_command_log_init(
    app_handle: AppHandle,
) -> AppResult<()> {
    CommandLogService::set_app_handle(app_handle);
    Ok(())
}

// ==================== slow log ====================

/// get slow log list
#[tauri::command]
pub async fn redis_tool_slow_log(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    _db: u32,
    count: u64,
) -> AppResult<Vec<SlowLogEntry>> {
    let client = manager.get_client(&connection_id)?;
    SlowLogService::get_slow_log(&client, count).await
}

// ==================== memory analysis ====================

/// execute memory analysis (scan big keys)
#[tauri::command]
pub async fn redis_tool_memory_analysis(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    _db: u32,
    sample_count: Option<u64>,
) -> AppResult<MemoryAnalysisResult> {
    let client = manager.get_client(&connection_id)?;
    MemoryAnalysisService::analyze(&client, sample_count).await
}

// ==================== server status ====================

/// get server status overview
#[tauri::command]
pub async fn redis_tool_server_status(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<ServerStatus> {
    let client = manager.get_client(&connection_id)?;
    InfoService::get_server_status(&client).await
}

/// get database list with details
#[tauri::command]
pub async fn redis_tool_database_list(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<Vec<DatabaseInfo>> {
    let client = manager.get_client(&connection_id)?;
    InfoService::get_database_list(&client).await
}

/// get full server info (INFO command)
#[tauri::command]
pub async fn redis_tool_server_info(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    section: Option<String>,
) -> AppResult<ServerInfo> {
    let client = manager.get_client(&connection_id)?;
    InfoService::get_server_info(&client, section.as_deref()).await
}

/// get client list
#[tauri::command]
pub async fn redis_tool_client_list(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<Vec<std::collections::HashMap<String, String>>> {
    let client = manager.get_client(&connection_id)?;
    ClientListService::get_client_list(&client).await
}

// ==================== flush database ====================

/// flush current database (FLUSHDB)
#[tauri::command]
pub async fn redis_tool_flush_db(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<String> {
    let client = manager.get_client(&connection_id)?;
    FlushDbService::flush_db(&client).await
}

/// flush all databases (FLUSHALL)
#[tauri::command]
pub async fn redis_tool_flush_all(
    manager: tauri::State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
) -> AppResult<String> {
    let client = manager.get_client(&connection_id)?;
    FlushDbService::flush_all(&client).await
}
