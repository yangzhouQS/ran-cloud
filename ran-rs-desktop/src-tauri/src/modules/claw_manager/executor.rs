// modules/claw_manager/executor.rs — 命令执行器
// 封装 std::process::Command，支持超时、工作目录、环境变量

use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};

use crate::modules::claw_manager::models::{ClawCliInfo, CommandResult};

/// 默认超时时间（秒）
const DEFAULT_TIMEOUT_SECS: u64 = 30;

/// 允许执行的命令前缀白名单
const ALLOWED_PREFIXES: &[&str] = &["openclaw"];

/// 校验命令是否在白名单中
fn validate_command(cmd: &str) -> Result<(), String> {
    let trimmed = cmd.trim();
    let is_allowed = ALLOWED_PREFIXES
        .iter()
        .any(|prefix| trimmed.starts_with(prefix));

    if !is_allowed {
        return Err(format!(
            "命令不被允许: '{}'。只允许执行以下前缀的命令: {:?}",
            trimmed, ALLOWED_PREFIXES
        ));
    }
    Ok(())
}

/// 将命令字符串解析为 (程序名, 参数列表)
fn parse_command(cmd: &str) -> Result<(String, Vec<String>), String> {
    let parts: Vec<&str> = cmd
        .trim()
        .split_whitespace()
        .collect();

    if parts.is_empty() {
        return Err("命令不能为空".to_string());
    }

    let program = parts[0].to_string();
    let args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();

    Ok((program, args))
}

/// 构建跨平台的进程命令
///
/// Windows 特殊处理：
/// - npm 全局安装的命令生成 `.cmd` 文件（如 openclaw.cmd），而非 .exe
/// - `CreateProcess` API 只搜索 `.exe`，不会自动解析 `.cmd`
/// - 因此在 Windows 上使用 `cmd.exe /C` 包装命令来执行
/// - `CREATE_NO_WINDOW` 标志隐藏控制台窗口
///
/// Unix/macOS 上直接执行命令（PATH 中可找到二进制或 shell 脚本）
fn build_process_command(program: &str, args: &[String]) -> std::process::Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("cmd.exe");
        cmd.arg("/C")
            .arg(program)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("TERM", "dumb");

        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = std::process::Command::new(program);
        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("TERM", "dumb");

        cmd
    }
}

/// 执行命令并返回结果
///
/// # 参数
/// - `command`: 完整命令字符串
/// - `cwd`: 可选的工作目录
/// - `env`: 可选的环境变量
/// - `timeout_secs`: 可选的超时时间（秒）
pub fn execute(
    command: &str,
    cwd: Option<&str>,
    env: Option<&HashMap<String, String>>,
    timeout_secs: Option<u64>,
) -> Result<CommandResult, String> {
    // 1. 校验命令白名单
    validate_command(command)?;

    // 2. 解析命令
    let (program, args) = parse_command(command)?;

    // 3. 构建进程
    let mut cmd = std::process::Command::new(&program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("TERM", "dumb"); // 避免终端颜色码干扰输出

    // Windows 下隐藏控制台窗口
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    // 设置工作目录
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    // 设置环境变量
    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    // 4. 执行并计时
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));
    let start = Instant::now();

    let output_result = cmd.output();

    let duration_ms = start.elapsed().as_millis() as u64;

    // 5. 处理结果
    match output_result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let success = output.status.success();
            let exit_code = output.status.code();

            // 合并输出：优先 stdout，追加 stderr
            let mut combined = String::new();
            if !stdout.is_empty() {
                combined.push_str(&stdout);
            }
            if !stderr.is_empty() {
                if !combined.is_empty() {
                    combined.push('\n');
                }
                combined.push_str(&stderr);
            }

            // 检查是否超时（虽然 std::process::Command::output 不直接支持超时，
            // 但通过 spawn + wait_with_timeout 可以实现，这里用 elapsed 做近似判断）
            if duration_ms >= timeout.as_millis() as u64 {
                log::warn!(
                    "命令执行耗时 {}ms，接近或超过超时阈值 {}ms: {}",
                    duration_ms,
                    timeout.as_millis(),
                    command
                );
            }

            log::info!(
                "命令执行完成: {} (exit_code={:?}, duration={}ms)",
                command,
                exit_code,
                duration_ms
            );

            Ok(CommandResult {
                success,
                stdout,
                stderr,
                exit_code,
                output: combined,
                duration_ms,
            })
        }
        Err(e) => {
            let error_msg = if e.kind() == std::io::ErrorKind::NotFound {
                format!(
                    "找不到命令 '{}'。请确保 openclaw 已安装并添加到 PATH 环境变量。",
                    program
                )
            } else {
                format!("执行命令失败: {} — {}", command, e)
            };

            log::error!("{}", error_msg);

            Ok(CommandResult {
                success: false,
                stdout: String::new(),
                stderr: error_msg.clone(),
                exit_code: None,
                output: error_msg,
                duration_ms,
            })
        }
    }
}

/// 检查 openclaw CLI 是否可用
pub fn check_cli() -> ClawCliInfo {
    // 尝试执行 `openclaw --version`
    let result = std::process::Command::new("openclaw")
        .arg("--version")
        .output();

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let success = output.status.success();

            if success {
                // 尝试获取路径
                let path = which_openclaw();

                ClawCliInfo {
                    available: true,
                    version: Some(stdout.trim().to_string()),
                    path,
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                ClawCliInfo {
                    available: false,
                    version: None,
                    path: None,
                    error: Some(if stderr.is_empty() {
                        "openclaw 命令执行失败".to_string()
                    } else {
                        stderr
                    }),
                }
            }
        }
        Err(e) => ClawCliInfo {
            available: false,
            version: None,
            path: None,
            error: Some(format!(
                "找不到 openclaw 命令: {}。请确保已安装并添加到 PATH。",
                e
            )),
        },
    }
}

/// 尝试获取 openclaw 可执行文件路径
fn which_openclaw() -> Option<String> {
    // 在 Windows 上使用 `where`，Unix 上使用 `which`
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("where")
        .arg("openclaw")
        .output();

    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new("which")
        .arg("openclaw")
        .output();

    match result {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(|s| s.trim().to_string());
            path
        }
        _ => None,
    }
}
