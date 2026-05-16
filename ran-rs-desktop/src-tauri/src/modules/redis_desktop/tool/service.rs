// modules/redis_desktop/tool/service.rs — 运维工具服务
// INFO 解析、慢日志、内存分析、客户端列表、命令日志

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter};

use crate::shared::error::AppError;
use crate::shared::event::redis_event;
use crate::modules::redis_desktop::shared::redis_client::RedisClient;

use super::models::{
    CommandLogEntry, CommandLogQueryParams, DatabaseInfo, MemoryAnalysisEntry,
    MemoryAnalysisResult, ServerInfo, ServerStatus, SlowLogEntry,
};

// ==================== 常量 ====================

/// Max log entries per connection
const MAX_LOG_ENTRIES: usize = 1000;
/// Memory analysis default sample count
const DEFAULT_MEMORY_SAMPLE_COUNT: u64 = 1000;
/// Memory analysis batch size for SCAN
const MEMORY_SCAN_BATCH: u64 = 200;

// ==================== 全局存储 ====================

/// Global command log storage: connection_id -> VecDeque<CommandLogEntry>
static COMMAND_LOGS: Lazy<DashMap<String, VecDeque<CommandLogEntry>>> =
    once_cell::sync::Lazy::new(DashMap::new);

/// Global AppHandle storage for emitting events
static LOG_APP_HANDLE: once_cell::sync::Lazy<std::sync::Mutex<Option<AppHandle>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

// ==================== 辅助函数 ====================

/// Get current timestamp in milliseconds since Unix epoch
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Parse a single value from INFO line: `key:value`
fn parse_info_value(line: &str, prefix: &str) -> Option<String> {
    line.strip_prefix(prefix).map(|v| v.to_string())
}

/// Parse a u64 value from INFO line
fn parse_info_u64(line: &str, prefix: &str) -> u64 {
    line.strip_prefix(prefix)
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

// ==================== CommandLogService ====================

/// Command log service
pub struct CommandLogService;

impl CommandLogService {
    /// Set the AppHandle for emitting events
    pub fn set_app_handle(handle: AppHandle) {
        if let Ok(mut guard) = LOG_APP_HANDLE.lock() {
            *guard = Some(handle);
        }
    }

    /// Record a command execution
    pub fn log_command(
        connection_id: &str,
        db: u32,
        command: &str,
        args: Vec<String>,
        duration_ms: f64,
        success: bool,
        error: Option<String>,
    ) {
        let entry = CommandLogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            connection_id: connection_id.to_string(),
            db,
            command: command.to_uppercase(),
            args,
            duration_ms,
            success,
            error,
            timestamp: now_millis(),
        };

        Self::emit_log_event(&entry);

        let mut logs = COMMAND_LOGS
            .entry(connection_id.to_string())
            .or_insert_with(|| VecDeque::with_capacity(MAX_LOG_ENTRIES));

        if logs.len() >= MAX_LOG_ENTRIES {
            logs.pop_front();
        }
        logs.push_back(entry);
    }

    /// Get recent command logs for a connection
    pub fn get_logs(params: &CommandLogQueryParams) -> Vec<CommandLogEntry> {
        let limit = params.limit.unwrap_or(100);

        if let Some(logs) = COMMAND_LOGS.get(&params.connection_id) {
            logs.iter().rev().take(limit).cloned().collect()
        } else {
            Vec::new()
        }
    }

    /// Clear command logs for a connection
    pub fn clear_logs(connection_id: &str) -> Result<(), AppError> {
        COMMAND_LOGS.remove(connection_id);
        Ok(())
    }

    /// Clear all command logs
    pub fn clear_all_logs() -> Result<(), AppError> {
        COMMAND_LOGS.clear();
        Ok(())
    }

    /// Emit command log event to frontend
    fn emit_log_event(entry: &CommandLogEntry) {
        if let Ok(guard) = LOG_APP_HANDLE.lock() {
            if let Some(ref handle) = *guard {
                let _ = handle.emit(&redis_event("tool:command-log"), entry);
            }
        }
    }
}

// ==================== InfoService ====================

/// Server info service — parse INFO command output
pub struct InfoService;

impl InfoService {
    /// Get server status overview
    pub async fn get_server_status(client: &RedisClient) -> Result<ServerStatus, AppError> {
        let info_all = client.info(None).await.map_err(|e| AppError::Redis(e))?;

        let mut status = ServerStatus {
            redis_version: String::new(),
            mode: String::new(),
            uptime_days: 0,
            connected_clients: 0,
            used_memory: 0,
            used_memory_peak: 0,
            total_keys: 0,
            expired_keys: 0,
            instantaneous_ops_per_sec: 0,
            total_net_input_bytes: 0,
            total_net_output_bytes: 0,
            keyspace_hits: 0,
            keyspace_misses: 0,
            hit_rate: 0.0,
        };

        for line in info_all.lines() {
            let line = line.trim();

            if let Some(v) = parse_info_value(line, "redis_version:") {
                status.redis_version = v;
            } else if let Some(v) = parse_info_value(line, "redis_mode:") {
                status.mode = v;
            } else if line.starts_with("uptime_in_seconds:") {
                let secs = parse_info_u64(line, "uptime_in_seconds:");
                status.uptime_days = secs / 86400;
            } else if line.starts_with("connected_clients:") {
                status.connected_clients = parse_info_u64(line, "connected_clients:");
            } else if line.starts_with("used_memory:") {
                status.used_memory = parse_info_u64(line, "used_memory:");
            } else if line.starts_with("used_memory_peak:") {
                status.used_memory_peak = parse_info_u64(line, "used_memory_peak:");
            } else if line.starts_with("expired_keys:") {
                status.expired_keys = parse_info_u64(line, "expired_keys:");
            } else if line.starts_with("instantaneous_ops_per_sec:") {
                status.instantaneous_ops_per_sec =
                    parse_info_u64(line, "instantaneous_ops_per_sec:");
            } else if line.starts_with("total_net_input_bytes:") {
                status.total_net_input_bytes = parse_info_u64(line, "total_net_input_bytes:");
            } else if line.starts_with("total_net_output_bytes:") {
                status.total_net_output_bytes = parse_info_u64(line, "total_net_output_bytes:");
            } else if line.starts_with("keyspace_hits:") {
                status.keyspace_hits = parse_info_u64(line, "keyspace_hits:");
            } else if line.starts_with("keyspace_misses:") {
                status.keyspace_misses = parse_info_u64(line, "keyspace_misses:");
            }
        }

        // Calculate hit rate
        let total = status.keyspace_hits + status.keyspace_misses;
        if total > 0 {
            status.hit_rate = (status.keyspace_hits as f64 / total as f64) * 100.0;
        }

        // Get total keys from DBSIZE
        status.total_keys = client.dbsize().await.map_err(|e| AppError::Redis(e))?;

        Ok(status)
    }

    /// Get full server info (parsed into sections)
    pub async fn get_server_info(
        client: &RedisClient,
        section: Option<&str>,
    ) -> Result<ServerInfo, AppError> {
        let info = client.info(section).await.map_err(|e| AppError::Redis(e))?;
        let sections = Self::parse_info_sections(&info);
        Ok(ServerInfo { sections })
    }

    /// Parse INFO output into sections
    /// INFO format: `# Section\r\nkey:value\r\n...`
    fn parse_info_sections(info: &str) -> HashMap<String, HashMap<String, String>> {
        let mut sections = HashMap::new();
        let mut current_section = String::from("General");

        for line in info.lines() {
            let line = line.trim();

            // Section header: # SectionName
            if let Some(name) = line.strip_prefix("# ") {
                current_section = name.trim().to_string();
                sections
                    .entry(current_section.clone())
                    .or_insert_with(HashMap::new);
            } else if !line.is_empty() && line.contains(':') {
                let parts: Vec<&str> = line.splitn(2, ':').collect();
                if parts.len() == 2 {
                    let section = sections
                        .entry(current_section.clone())
                        .or_insert_with(HashMap::new);
                    section.insert(parts[0].to_string(), parts[1].to_string());
                }
            }
        }

        sections
    }

    /// Get database list from INFO KEYSPACE
    pub async fn get_database_list(client: &RedisClient) -> Result<Vec<DatabaseInfo>, AppError> {
        let info = client
            .info(Some("keyspace"))
            .await
            .map_err(|e| AppError::Redis(e))?;

        let mut databases = Vec::new();

        for line in info.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("db") {
                let parts: Vec<&str> = rest.splitn(2, ':').collect();
                if parts.len() == 2 {
                    if let Ok(db) = parts[0].parse::<u32>() {
                        let mut keys: u64 = 0;
                        let mut expires: u64 = 0;
                        let mut avg_ttl: i64 = 0;

                        for kv in parts[1].split(',') {
                            let kv_parts: Vec<&str> = kv.splitn(2, '=').collect();
                            if kv_parts.len() == 2 {
                                match kv_parts[0] {
                                    "keys" => keys = kv_parts[1].parse().unwrap_or(0),
                                    "expires" => expires = kv_parts[1].parse().unwrap_or(0),
                                    "avg_ttl" => avg_ttl = kv_parts[1].parse().unwrap_or(0),
                                    _ => {}
                                }
                            }
                        }

                        databases.push(DatabaseInfo {
                            db,
                            keys,
                            expires,
                            avg_ttl,
                        });
                    }
                }
            }
        }

        Ok(databases)
    }
}

// ==================== SlowLogService ====================

/// Slow log service
pub struct SlowLogService;

impl SlowLogService {
    /// Get slow log entries
    pub async fn get_slow_log(
        client: &RedisClient,
        count: u64,
    ) -> Result<Vec<SlowLogEntry>, AppError> {
        let mut cmd = redis::Cmd::new();
        cmd.arg("SLOWLOG").arg("GET").arg(count);

        let value = client
            .run_command(&cmd)
            .await
            .map_err(|e| AppError::Redis(e))?;

        let entries = Self::parse_slow_log(&value);
        Ok(entries)
    }

    /// Parse SLOWLOG GET response
    /// Response is an array of arrays:
    /// [id, timestamp, duration_us, [command_args], client_addr, client_name]
    fn parse_slow_log(value: &redis::Value) -> Vec<SlowLogEntry> {
        let mut entries = Vec::new();

        if let redis::Value::Array(arr) = value {
            for item in arr {
                if let redis::Value::Array(fields) = item {
                    let id = Self::extract_i64(&fields, 0);
                    let timestamp = Self::extract_i64(&fields, 1);
                    let duration_us = Self::extract_i64(&fields, 2);
                    let command = Self::extract_command(&fields, 3);
                    let client_address = Self::extract_string(&fields, 4);
                    let client_name = Self::extract_string(&fields, 5);

                    entries.push(SlowLogEntry {
                        id,
                        timestamp,
                        duration_us,
                        command,
                        client_address,
                        client_name,
                    });
                }
            }
        }

        entries
    }

    /// Extract i64 from array field
    fn extract_i64(fields: &[redis::Value], index: usize) -> i64 {
        fields.get(index).and_then(|v| {
            match v {
                redis::Value::Int(n) => Some(*n),
                redis::Value::BulkString(s) => String::from_utf8_lossy(s).parse().ok(),
                _ => None,
            }
        }).unwrap_or(0)
    }

    /// Extract String from array field
    fn extract_string(fields: &[redis::Value], index: usize) -> String {
        fields.get(index).and_then(|v| {
            match v {
                redis::Value::BulkString(s) => Some(String::from_utf8_lossy(s).to_string()),
                redis::Value::SimpleString(s) => Some(s.clone()),
                _ => None,
            }
        }).unwrap_or_default()
    }

    /// Extract command array from SLOWLOG entry
    fn extract_command(fields: &[redis::Value], index: usize) -> Vec<String> {
        fields.get(index).and_then(|v| {
            if let redis::Value::Array(arr) = v {
                Some(
                    arr.iter()
                        .filter_map(|item| match item {
                            redis::Value::BulkString(s) => {
                                Some(String::from_utf8_lossy(s).to_string())
                            }
                            redis::Value::SimpleString(s) => Some(s.clone()),
                            _ => None,
                        })
                        .collect(),
                )
            } else {
                None
            }
        }).unwrap_or_default()
    }
}

// ==================== MemoryAnalysisService ====================

/// Memory analysis service — scan keys and analyze memory usage
pub struct MemoryAnalysisService;

impl MemoryAnalysisService {
    /// Execute memory analysis (scan keys and check MEMORY USAGE)
    pub async fn analyze(
        client: &RedisClient,
        sample_count: Option<u64>,
    ) -> Result<MemoryAnalysisResult, AppError> {
        let start = Instant::now();
        let max_samples = sample_count.unwrap_or(DEFAULT_MEMORY_SAMPLE_COUNT);

        let mut total_keys: u64 = 0;
        let mut total_memory: i64 = 0;
        let mut entries: Vec<MemoryAnalysisEntry> = Vec::new();

        // SCAN all keys and collect samples
        let mut cursor: u64 = 0;
        loop {
            let (new_cursor, keys) = client
                .scan(cursor, None, Some(MEMORY_SCAN_BATCH))
                .await
                .map_err(|e| AppError::Redis(e))?;

            total_keys += keys.len() as u64;

            // Analyze each key
            for key in &keys {
                if entries.len() as u64 >= max_samples {
                    break;
                }

                // Get key type
                let key_type = client
                    .key_type(key)
                    .await
                    .unwrap_or_else(|_| "unknown".to_string());

                // Get memory usage
                let mem_usage = client.memory_usage(key).await.ok().flatten().unwrap_or(0);
                total_memory += mem_usage;

                // Get encoding
                let encoding = client
                    .object_encoding(key)
                    .await
                    .unwrap_or_else(|_| "unknown".to_string());

                // Get length based on type
                let length = Self::get_key_length(client, key, &key_type).await;

                entries.push(MemoryAnalysisEntry {
                    key: key.clone(),
                    key_type,
                    memory_usage: mem_usage,
                    encoding,
                    length,
                });
            }

            cursor = new_cursor;
            if cursor == 0 || entries.len() as u64 >= max_samples {
                break;
            }
        }

        // Sort by memory usage descending (big keys first)
        entries.sort_by(|a, b| b.memory_usage.cmp(&a.memory_usage));

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(MemoryAnalysisResult {
            total_keys,
            total_memory,
            big_keys: entries,
            duration_ms,
        })
    }

    /// Get key element count based on type
    async fn get_key_length(client: &RedisClient, key: &str, key_type: &str) -> i64 {
        match key_type {
            "string" => client
                .get(key)
                .await
                .ok()
                .flatten()
                .map(|s| s.len() as i64)
                .unwrap_or(0),
            "hash" => client.hlen(key).await.unwrap_or(0) as i64,
            "list" => client.llen(key).await.unwrap_or(0) as i64,
            "set" => client.scard(key).await.unwrap_or(0) as i64,
            "zset" => client.zcard(key).await.unwrap_or(0) as i64,
            "stream" => client.xlen(key).await.unwrap_or(0) as i64,
            _ => 0,
        }
    }
}

// ==================== ClientListService ====================

/// Client list service
pub struct ClientListService;

impl ClientListService {
    /// Get client list (CLIENT LIST command)
    pub async fn get_client_list(
        client: &RedisClient,
    ) -> Result<Vec<HashMap<String, String>>, AppError> {
        let mut cmd = redis::Cmd::new();
        cmd.arg("CLIENT").arg("LIST");

        let result: String = client
            .run_command_async(&cmd)
            .await
            .map_err(|e| AppError::Redis(e))?;

        let mut clients = Vec::new();

        for line in result.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let mut client_info = HashMap::new();
            for field in line.split_whitespace() {
                let parts: Vec<&str> = field.splitn(2, '=').collect();
                if parts.len() == 2 {
                    client_info.insert(parts[0].to_string(), parts[1].to_string());
                } else {
                    client_info.insert(parts[0].to_string(), String::new());
                }
            }

            if !client_info.is_empty() {
                clients.push(client_info);
            }
        }

        Ok(clients)
    }
}

// ==================== FlushDbService ====================

/// Database flush service
pub struct FlushDbService;

impl FlushDbService {
    /// Flush current database (FLUSHDB)
    pub async fn flush_db(client: &RedisClient) -> Result<String, AppError> {
        let mut cmd = redis::Cmd::new();
        cmd.arg("FLUSHDB");
        client
            .run_command_async(&cmd)
            .await
            .map_err(|e| AppError::Redis(e))
    }

    /// Flush all databases (FLUSHALL)
    pub async fn flush_all(client: &RedisClient) -> Result<String, AppError> {
        let mut cmd = redis::Cmd::new();
        cmd.arg("FLUSHALL");
        client
            .run_command_async(&cmd)
            .await
            .map_err(|e| AppError::Redis(e))
    }
}
