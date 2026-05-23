// modules/redis_desktop/cli/service.rs — CLI 命令执行服务
// 解析用户输入的命令文本，执行 Redis 命令，格式化返回结果

use std::sync::Arc;
use std::time::Instant;

use redis::Cmd;

use crate::shared::error::AppError;
use crate::shared::result::AppResult;
use crate::modules::redis_desktop::shared::redis_client::RedisClient;

use super::models::CliExecResult;
use super::parser;

/// CLI 服务
pub struct CliService;

impl CliService {
    /// 执行 Redis 命令
    /// 解析命令文本 → 构建 Cmd → 执行 → 格式化结果
    pub async fn exec_command(
        client: &Arc<RedisClient>,
        db: u32,
        command_text: &str,
    ) -> AppResult<CliExecResult> {
        let start = Instant::now();

        // 1. 切换到指定数据库
        if db > 0 {
            client.select_db(db).await.map_err(|e| {
                AppError::Redis(e)
            })?;
        }

        // 2. 解析命令
        let parsed = parser::parse_command(command_text)
            .map_err(|e| AppError::Internal(e))?;

        // 3. 构建 Redis Cmd
        let mut cmd = Cmd::new();
        cmd.arg(&parsed.command);
        for arg in &parsed.args {
            cmd.arg(arg);
        }

        // 4. 执行命令
        let value = client.run_command(&cmd).await.map_err(|e| {
            AppError::Redis(e)
        })?;

        let duration_ms = start.elapsed().as_millis() as u64;

        // 5. 格式化结果
        let (result, result_type) = format_redis_value(&value);

        Ok(CliExecResult {
            command: command_text.to_string(),
            result,
            result_type,
            duration_ms,
        })
    }
}

/// 格式化 Redis 返回值为可读字符串
/// 返回 (格式化字符串, 类型标识)
fn format_redis_value(value: &redis::Value) -> (String, String) {
    match value {
        redis::Value::Nil => ("(nil)".to_string(), "nil".to_string()),
        redis::Value::SimpleString(s) => {
            if s.is_empty() {
                ("\"\"".to_string(), "string".to_string())
            } else {
                (format!("\"{}\"", s), "string".to_string())
            }
        }
        redis::Value::Okay => ("OK".to_string(), "status".to_string()),
        redis::Value::Int(n) => (format!("(integer) {}", n), "integer".to_string()),
        redis::Value::BulkString(data) => {
            match String::from_utf8(data.clone()) {
                Ok(s) if !s.is_empty() => {
                    // 尝试格式化为 JSON
                    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&s) {
                        (serde_json::to_string_pretty(&json_val).unwrap_or_else(|_| format!("\"{}\"", s)), "string".to_string())
                    } else {
                        (format!("\"{}\"", s), "string".to_string())
                    }
                }
                Ok(_) => ("\"\"".to_string(), "string".to_string()),
                Err(_) => {
                    // 二进制数据，显示十六进制
                    let hex: Vec<String> = data.iter().take(64).map(|b| format!("{:02x}", b)).collect();
                    let hex_str = hex.join(" ");
                    if data.len() > 64 {
                        (format!("\"\\\"{} ...\\\"\" ({} bytes)", hex_str, data.len()), "binary".to_string())
                    } else {
                        (format!("\"{}\" ({} bytes)", hex_str, data.len()), "binary".to_string())
                    }
                }
            }
        }
        redis::Value::Array(items) => {
            if items.is_empty() {
                ("(empty array)".to_string(), "array".to_string())
            } else {
                let mut lines = Vec::new();
                for (i, item) in items.iter().enumerate() {
                    let (formatted, _) = format_redis_value(item);
                    lines.push(format!("{}) {}", i + 1, formatted));
                }
                (lines.join("\n"), "array".to_string())
            }
        }
        redis::Value::ServerError(err) => {
            (format!("(error) {:?}", err), "error".to_string())
        }
        _ => {
            (format!("{:?}", value), "unknown".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_nil() {
        let (s, t) = format_redis_value(&redis::Value::Nil);
        assert_eq!(s, "(nil)");
        assert_eq!(t, "nil");
    }

    #[test]
    fn format_simple_string() {
        let (s, t) = format_redis_value(&redis::Value::SimpleString("hello".to_string()));
        assert_eq!(s, "\"hello\"");
        assert_eq!(t, "string");
    }

    #[test]
    fn format_empty_string() {
        let (s, t) = format_redis_value(&redis::Value::SimpleString(String::new()));
        assert_eq!(s, "\"\"");
        assert_eq!(t, "string");
    }

    #[test]
    fn format_okay() {
        let (s, t) = format_redis_value(&redis::Value::Okay);
        assert_eq!(s, "OK");
        assert_eq!(t, "status");
    }

    #[test]
    fn format_integer() {
        let (s, t) = format_redis_value(&redis::Value::Int(42));
        assert_eq!(s, "(integer) 42");
        assert_eq!(t, "integer");
    }

    #[test]
    fn format_bulk_string_text() {
        let (s, t) = format_redis_value(&redis::Value::BulkString(b"hello".to_vec()));
        assert_eq!(s, "\"hello\"");
        assert_eq!(t, "string");
    }

    #[test]
    fn format_bulk_string_json() {
        let (s, t) = format_redis_value(&redis::Value::BulkString(b"{\"a\":1}".to_vec()));
        assert!(s.contains("\"a\""));
        assert_eq!(t, "string");
    }

    #[test]
    fn format_bulk_string_empty() {
        let (s, t) = format_redis_value(&redis::Value::BulkString(b"".to_vec()));
        assert_eq!(s, "\"\"");
        assert_eq!(t, "string");
    }

    #[test]
    fn format_bulk_string_binary() {
        let (s, t) = format_redis_value(&redis::Value::BulkString(vec![0x00, 0xFF, 0xAB]));
        assert!(s.contains("00"));
        assert_eq!(t, "binary");
    }

    #[test]
    fn format_empty_array() {
        let (s, t) = format_redis_value(&redis::Value::Array(vec![]));
        assert_eq!(s, "(empty array)");
        assert_eq!(t, "array");
    }

    #[test]
    fn format_array_with_items() {
        let arr = redis::Value::Array(vec![
            redis::Value::Int(1),
            redis::Value::SimpleString("ok".to_string()),
        ]);
        let (s, t) = format_redis_value(&arr);
        assert!(s.contains("1)"));
        assert!(s.contains("2)"));
        assert_eq!(t, "array");
    }

    #[test]
    fn format_bulk_string_non_utf8() {
        // Non-UTF-8 bulk string should display as hex or lossy string
        let binary = vec![0xFF, 0xFE, 0x00, 0x01];
        let (s, t) = format_redis_value(&redis::Value::BulkString(binary));
        assert_eq!(t, "binary");
        assert!(!s.is_empty());
    }
}
