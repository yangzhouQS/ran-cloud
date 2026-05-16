// modules/redis_desktop/cli/commands.rs — CLI 命令行 Tauri Commands
// Phase 4 实现：Redis CLI 交互功能

use std::sync::Arc;
use tauri::State;

use crate::shared::result::AppResult;
use crate::modules::redis_desktop::connection::service::RedisConnectionManager;
use crate::modules::redis_desktop::cli::models::{CliExecParams, CliExecResult};
use crate::modules::redis_desktop::cli::service::CliService;
use crate::modules::redis_desktop::cli::autocomplete;

/// 执行 Redis 命令
#[tauri::command]
pub async fn redis_cli_exec(
    params: CliExecParams,
    manager: State<'_, Arc<RedisConnectionManager>>,
) -> AppResult<CliExecResult> {
    let client = manager.get_client(&params.connection_id)?;
    CliService::exec_command(&client, params.db, &params.command).await
}

/// 获取命令自动补全建议
#[tauri::command]
pub async fn redis_cli_complete(
    input: String,
) -> AppResult<Vec<String>> {
    Ok(autocomplete::get_completions(&input))
}

/// 获取命令语法提示
#[tauri::command]
pub async fn redis_cli_syntax(
    command: String,
) -> AppResult<Option<String>> {
    Ok(autocomplete::get_command_syntax(&command).map(|s| s.to_string()))
}

/// 获取所有 Redis 命令列表
#[tauri::command]
pub async fn redis_cli_commands() -> AppResult<Vec<String>> {
    Ok(autocomplete::get_all_command_names().into_iter().map(|s| s.to_string()).collect())
}

/// 按分组获取 Redis 命令
#[tauri::command]
pub async fn redis_cli_commands_by_group(
    group: String,
) -> AppResult<Vec<String>> {
    Ok(autocomplete::get_commands_by_group(&group).into_iter().map(|s| s.to_string()).collect())
}
