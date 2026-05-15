use std::process::Command;
use tauri::Manager;

/// 执行 Telepresence 连接
#[tauri::command]
fn telepresence_connect(
    kubeconfig: String,
    namespace: String,
    skip_tls_verify: bool,
) -> Result<String, String> {
    let mut cmd = Command::new("telepresence");
    cmd.arg("connect")
        .arg("--kubeconfig")
        .arg(&kubeconfig);

    if skip_tls_verify {
        cmd.arg("--insecure-skip-tls-verify");
    }

    cmd.arg("--namespace").arg(&namespace);

    let output = cmd.output().map_err(|e| {
        format!(
            "执行 telepresence 命令失败: {}。请确保已安装 Telepresence 并添加到 PATH。",
            e
        )
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        if stdout.is_empty() {
            Ok("连接成功".to_string())
        } else {
            Ok(stdout)
        }
    } else {
        Err(if stderr.is_empty() {
            "连接失败，未知错误".to_string()
        } else {
            stderr
        })
    }
}

/// 断开 Telepresence 连接
#[tauri::command]
fn telepresence_quit() -> Result<String, String> {
    let output = Command::new("telepresence")
        .arg("quit")
        .output()
        .map_err(|e| format!("执行 telepresence quit 失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(if stdout.is_empty() {
            "已断开连接".to_string()
        } else {
            stdout
        })
    } else {
        Err(if stderr.is_empty() {
            "断开连接失败，未知错误".to_string()
        } else {
            stderr
        })
    }
}

/// 获取 Telepresence 状态
#[tauri::command]
fn telepresence_status() -> Result<String, String> {
    let output = Command::new("telepresence")
        .arg("status")
        .output()
        .map_err(|e| format!("执行 telepresence status 失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // status 命令可能输出到 stderr
    let result = format!("{}{}", stdout, stderr);
    if result.is_empty() {
        Ok("无法获取状态".to_string())
    } else {
        Ok(result)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            telepresence_connect,
            telepresence_quit,
            telepresence_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Ran RS Desktop 🚀", name)
}
