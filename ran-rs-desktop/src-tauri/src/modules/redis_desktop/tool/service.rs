// modules/redis_desktop/tool/service.rs — command log service
// In-memory ring buffer for Redis command logging, emits events to frontend

use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter};

use crate::shared::error::AppError;
use crate::shared::event::redis_event;

use super::models::{CommandLogEntry, CommandLogQueryParams};

/// Max log entries per connection
const MAX_LOG_ENTRIES: usize = 1000;

/// Global command log storage: connection_id -> VecDeque<CommandLogEntry>
static COMMAND_LOGS: Lazy<DashMap<String, VecDeque<CommandLogEntry>>> =
    once_cell::sync::Lazy::new(DashMap::new);

/// Global AppHandle storage for emitting events
static LOG_APP_HANDLE: once_cell::sync::Lazy<std::sync::Mutex<Option<AppHandle>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

/// Get current timestamp in milliseconds since Unix epoch
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Command log service
pub struct CommandLogService;

impl CommandLogService {
    /// Set the AppHandle for emitting events (called during plugin setup)
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

        // Emit event to frontend
        Self::emit_log_event(&entry);

        // Store in ring buffer
        let mut logs = COMMAND_LOGS
            .entry(connection_id.to_string())
            .or_insert_with(|| VecDeque::with_capacity(MAX_LOG_ENTRIES));

        if logs.len() >= MAX_LOG_ENTRIES {
            logs.pop_front();
        }
        logs.push_back(entry);
    }

    /// Execute a closure with command logging
    /// This is the primary API for other services to use
    pub async fn with_log<F, Fut, T>(
        connection_id: &str,
        db: u32,
        command: &str,
        args: Vec<String>,
        f: F,
    ) -> Result<T, AppError>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T, AppError>>,
    {
        let start = Instant::now();
        let result = f().await;
        let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

        match &result {
            Ok(_) => {
                Self::log_command(connection_id, db, command, args, duration_ms, true, None);
            }
            Err(e) => {
                Self::log_command(
                    connection_id,
                    db,
                    command,
                    args,
                    duration_ms,
                    false,
                    Some(e.to_string()),
                );
            }
        }

        result
    }

    /// Get recent command logs for a connection
    pub fn get_logs(params: &CommandLogQueryParams) -> Vec<CommandLogEntry> {
        let limit = params.limit.unwrap_or(100);

        if let Some(logs) = COMMAND_LOGS.get(&params.connection_id) {
            logs.iter()
                .rev()
                .take(limit)
                .cloned()
                .collect()
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
                let _ = handle.emit(
                    &redis_event("tool:command-log"),
                    entry,
                );
            }
        }
    }
}
