// modules/claw_manager/commands.rs — Tauri 命令函数
// 暴露给前端的 Tauri 命令入口

use std::collections::HashMap;

use crate::modules::claw_manager::executor;
use crate::modules::claw_manager::models::{ClawCliInfo, CommandResult};

/// 执行 openclaw 命令
///
/// 通过 `spawn_blocking` 在独立线程中执行，避免阻塞 Tauri 异步运行时。
///
/// # 参数
/// - `command`: 完整命令字符串，如 "openclaw gateway start"
/// - `cwd`: 可选的工作目录
/// - `env`: 可选的环境变量
/// - `timeout_secs`: 可选的超时时间（秒），默认 30
#[tauri::command]
pub async fn claw_execute_command(
    command: String,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    timeout_secs: Option<u64>,
) -> Result<CommandResult, String> {
    let cmd = command.clone();
    let result = tokio::task::spawn_blocking(move || {
        executor::execute(
            &cmd,
            cwd.as_deref(),
            env.as_ref(),
            timeout_secs,
        )
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))??;

    Ok(result)
}

/// 检查 openclaw CLI 是否可用
///
/// 返回 CLI 的可用性、版本号和路径信息。
#[tauri::command]
pub fn claw_check_cli() -> Result<ClawCliInfo, String> {
    let info = executor::check_cli();
    Ok(info)
}

/// 在系统文件管理器中打开指定文件夹
///
/// 跨平台支持：
/// - Windows: `explorer <path>`
/// - macOS: `open <path>`
/// - Linux: `xdg-open <path>`
#[tauri::command]
pub fn claw_open_folder(path: String) -> Result<(), String> {
    // 验证路径存在
    let p = std::path::Path::new(&path);
    if !p.exists() {
        // 如果路径不存在，尝试打开父目录
        if let Some(parent) = p.parent() {
            if parent.exists() {
                return open_path(parent.to_string_lossy().to_string());
            }
        }
        return Err(format!("路径不存在: {}", path));
    }

    open_path(path)
}

/// 使用系统文件管理器打开路径
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    Ok(())
}
