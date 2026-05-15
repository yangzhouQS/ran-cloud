// modules/redis_desktop/shared/redis_client.rs — Redis 客户端封装
// 对 redis crate 的 MultiplexedConnection 进行封装，支持命令拦截、超时控制、重连

use std::sync::Arc;
use std::time::Duration;

use redis::aio::MultiplexedConnection;
use redis::aio::ConnectionLike;
use redis::{Cmd, RedisResult, Value};
use tokio::sync::Mutex;

use crate::shared::constants::DEFAULT_COMMAND_TIMEOUT_SECS;

/// Redis 客户端封装
/// 内部持有异步多路复用连接，提供带超时的命令执行
pub struct RedisClient {
    /// 连接名称（用于日志和调试）
    name: String,
    /// 异步多路复用连接
    conn: Arc<Mutex<Option<MultiplexedConnection>>>,
    /// 命令超时
    command_timeout: Duration,
}

impl RedisClient {
    /// 创建新的 RedisClient（尚未连接）
    pub fn new(name: String, command_timeout_secs: Option<u64>) -> Self {
        let timeout = command_timeout_secs
            .map(Duration::from_secs)
            .unwrap_or(Duration::from_secs(DEFAULT_COMMAND_TIMEOUT_SECS));

        Self {
            name,
            conn: Arc::new(Mutex::new(None)),
            command_timeout: timeout,
        }
    }

    /// 通过连接字符串建立连接
    pub async fn connect(&self, connection_string: &str) -> RedisResult<()> {
        let client = redis::Client::open(connection_string)?;
        let conn = client
            .get_multiplexed_async_connection()
            .await?;

        let mut guard = self.conn.lock().await;
        *guard = Some(conn);

        log::info!("[RedisClient:{}] 已连接: {}", self.name, connection_string);
        Ok(())
    }

    /// 通过 redis::Client 建立（支持更多配置项）
    pub async fn connect_with_client(&self, client: redis::Client) -> RedisResult<()> {
        let conn = client
            .get_multiplexed_async_connection()
            .await?;

        let mut guard = self.conn.lock().await;
        *guard = Some(conn);

        log::info!("[RedisClient:{}] 已连接", self.name);
        Ok(())
    }

    /// 执行 Redis 命令（带超时），返回原始 Value
    pub async fn run_command(&self, cmd: &Cmd) -> RedisResult<Value> {
        let mut guard = self.conn.lock().await;
        let conn = guard
            .as_mut()
            .ok_or_else(|| redis::RedisError::from(std::io::Error::new(
                std::io::ErrorKind::NotConnected,
                format!("Redis 客户端 {} 未连接", self.name),
            )))?;

        tokio::time::timeout(
            self.command_timeout,
            conn.req_packed_command(cmd),
        )
            .await
            .map_err(|_| redis::RedisError::from(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                format!("命令执行超时 ({:?})", self.command_timeout),
            )))?
    }

    /// 执行 Redis 命令并反序列化
    pub async fn run_command_async<T: redis::FromRedisValue>(&self, cmd: &Cmd) -> RedisResult<T> {
        let value = self.run_command(cmd).await?;
        redis::from_redis_value::<T>(&value)
    }

    /// 执行 Pipeline（多条命令一次性发送）
    pub async fn run_pipeline(&self, pipeline: &redis::Pipeline) -> RedisResult<Vec<Value>> {
        let mut guard = self.conn.lock().await;
        let conn = guard
            .as_mut()
            .ok_or_else(|| redis::RedisError::from(std::io::Error::new(
                std::io::ErrorKind::NotConnected,
                format!("Redis 客户端 {} 未连接", self.name),
            )))?;

        tokio::time::timeout(
            self.command_timeout,
            pipeline.query_async(conn),
        )
            .await
            .map_err(|_| redis::RedisError::from(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                format!("Pipeline 执行超时 ({:?})", self.command_timeout),
            )))?
    }

    // ==================== 连接管理 ====================

    /// 关闭连接
    pub async fn disconnect(&self) {
        let mut guard = self.conn.lock().await;
        *guard = None;
        log::info!("[RedisClient:{}] 已断开连接", self.name);
    }

    /// 检查是否已连接
    pub async fn is_connected(&self) -> bool {
        let guard = self.conn.lock().await;
        guard.is_some()
    }

    /// Ping 测试连接
    pub async fn ping(&self) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("PING");
        self.run_command_async(&cmd).await
    }

    /// 获取连接名称
    pub fn name(&self) -> &str {
        &self.name
    }

    // ==================== 数据库操作 ====================

    /// 切换数据库
    pub async fn select_db(&self, db: u32) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("SELECT").arg(db);
        self.run_command_async(&cmd).await
    }

    /// 获取数据库大小（Key 总数）
    pub async fn dbsize(&self) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("DBSIZE");
        self.run_command_async(&cmd).await
    }

    /// 获取服务器信息（INFO 命令）
    pub async fn info(&self, section: Option<&str>) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("INFO");
        if let Some(s) = section {
            cmd.arg(s);
        }
        self.run_command_async(&cmd).await
    }

    // ==================== Key 操作 ====================

    /// 获取 Key 类型
    pub async fn key_type(&self, key: &str) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("TYPE").arg(key);
        self.run_command_async(&cmd).await
    }

    /// 获取 Key TTL（秒）
    pub async fn ttl(&self, key: &str) -> RedisResult<i64> {
        let mut cmd = Cmd::new();
        cmd.arg("TTL").arg(key);
        self.run_command_async(&cmd).await
    }

    /// 删除 Key（支持批量）
    pub async fn del(&self, keys: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("DEL");
        for key in keys {
            cmd.arg(key);
        }
        self.run_command_async(&cmd).await
    }

    /// 检查 Key 是否存在
    pub async fn exists(&self, key: &str) -> RedisResult<bool> {
        let mut cmd = Cmd::new();
        cmd.arg("EXISTS").arg(key);
        let count: u64 = self.run_command_async(&cmd).await?;
        Ok(count > 0)
    }

    /// 重命名 Key
    pub async fn rename(&self, old_key: &str, new_key: &str) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("RENAME").arg(old_key).arg(new_key);
        self.run_command_async(&cmd).await
    }

    /// 设置 Key 过期时间（秒）
    pub async fn expire(&self, key: &str, seconds: i64) -> RedisResult<bool> {
        let mut cmd = Cmd::new();
        cmd.arg("EXPIRE").arg(key).arg(seconds);
        self.run_command_async(&cmd).await
    }

    /// 移除 Key 过期时间
    pub async fn persist(&self, key: &str) -> RedisResult<bool> {
        let mut cmd = Cmd::new();
        cmd.arg("PERSIST").arg(key);
        self.run_command_async(&cmd).await
    }

    /// 获取 Key 内存占用
    pub async fn memory_usage(&self, key: &str) -> RedisResult<Option<i64>> {
        let mut cmd = Cmd::new();
        cmd.arg("MEMORY").arg("USAGE").arg(key);
        let result: Option<i64> = self.run_command_async(&cmd).await.ok();
        Ok(result)
    }

    /// 获取 Key 编码格式
    pub async fn object_encoding(&self, key: &str) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("OBJECT").arg("ENCODING").arg(key);
        self.run_command_async(&cmd).await
    }

    // ==================== SCAN 操作 ====================

    /// SCAN 命令（返回 cursor + keys）
    pub async fn scan(&self, cursor: u64, pattern: Option<&str>, count: Option<u64>) -> RedisResult<(u64, Vec<String>)> {
        let mut cmd = Cmd::new();
        cmd.arg("SCAN").arg(cursor);
        if let Some(pat) = pattern {
            cmd.arg("MATCH").arg(pat);
        }
        if let Some(c) = count {
            cmd.arg("COUNT").arg(c);
        }
        self.run_command_async(&cmd).await
    }

    // ==================== String 操作 ====================

    /// GET 命令
    pub async fn get(&self, key: &str) -> RedisResult<Option<String>> {
        let mut cmd = Cmd::new();
        cmd.arg("GET").arg(key);
        self.run_command_async(&cmd).await
    }

    /// SET 命令
    pub async fn set(&self, key: &str, value: &str, ex: Option<u64>) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("SET").arg(key).arg(value);
        if let Some(seconds) = ex {
            cmd.arg("EX").arg(seconds);
        }
        self.run_command_async(&cmd).await
    }

    // ==================== Hash 操作 ====================

    /// HGETALL 命令
    pub async fn hgetall(&self, key: &str) -> RedisResult<std::collections::HashMap<String, String>> {
        let mut cmd = Cmd::new();
        cmd.arg("HGETALL").arg(key);
        self.run_command_async(&cmd).await
    }

    /// HLEN 命令
    pub async fn hlen(&self, key: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("HLEN").arg(key);
        self.run_command_async(&cmd).await
    }

    /// HSET 命令（单字段）
    pub async fn hset(&self, key: &str, field: &str, value: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("HSET").arg(key).arg(field).arg(value);
        self.run_command_async(&cmd).await
    }

    /// HDEL 命令
    pub async fn hdel(&self, key: &str, fields: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("HDEL").arg(key);
        for field in fields {
            cmd.arg(field);
        }
        self.run_command_async(&cmd).await
    }

    /// HSCAN 命令
    pub async fn hscan(&self, key: &str, cursor: u64, pattern: Option<&str>, count: Option<u64>) -> RedisResult<(u64, Vec<(String, String)>)> {
        let mut cmd = Cmd::new();
        cmd.arg("HSCAN").arg(key).arg(cursor);
        if let Some(pat) = pattern {
            cmd.arg("MATCH").arg(pat);
        }
        if let Some(c) = count {
            cmd.arg("COUNT").arg(c);
        }
        self.run_command_async(&cmd).await
    }

    // ==================== List 操作 ====================

    /// LLEN 命令
    pub async fn llen(&self, key: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("LLEN").arg(key);
        self.run_command_async(&cmd).await
    }

    /// LRANGE 命令
    pub async fn lrange(&self, key: &str, start: i64, stop: i64) -> RedisResult<Vec<String>> {
        let mut cmd = Cmd::new();
        cmd.arg("LRANGE").arg(key).arg(start).arg(stop);
        self.run_command_async(&cmd).await
    }

    /// RPUSH 命令
    pub async fn rpush(&self, key: &str, values: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("RPUSH").arg(key);
        for v in values {
            cmd.arg(v);
        }
        self.run_command_async(&cmd).await
    }

    /// LREM 命令
    pub async fn lrem(&self, key: &str, count: i64, value: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("LREM").arg(key).arg(count).arg(value);
        self.run_command_async(&cmd).await
    }

    /// LPUSH 命令
    pub async fn lpush(&self, key: &str, values: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("LPUSH").arg(key);
        for v in values {
            cmd.arg(v);
        }
        self.run_command_async(&cmd).await
    }

    /// LSET 命令
    pub async fn lset(&self, key: &str, index: i64, value: &str) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("LSET").arg(key).arg(index).arg(value);
        self.run_command_async(&cmd).await
    }

    /// LINSERT 命令（BEFORE/AFTER）
    pub async fn linsert(&self, key: &str, before: bool, pivot: &str, value: &str) -> RedisResult<i64> {
        let mut cmd = Cmd::new();
        cmd.arg("LINSERT").arg(key);
        if before {
            cmd.arg("BEFORE");
        } else {
            cmd.arg("AFTER");
        }
        cmd.arg(pivot).arg(value);
        self.run_command_async(&cmd).await
    }

    /// LTRIM 命令
    pub async fn ltrim(&self, key: &str, start: i64, stop: i64) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("LTRIM").arg(key).arg(start).arg(stop);
        self.run_command_async(&cmd).await
    }

    /// LPOP 命令
    pub async fn lpop(&self, key: &str) -> RedisResult<Option<String>> {
        let mut cmd = Cmd::new();
        cmd.arg("LPOP").arg(key);
        self.run_command_async(&cmd).await
    }

    /// RPOP 命令
    pub async fn rpop(&self, key: &str) -> RedisResult<Option<String>> {
        let mut cmd = Cmd::new();
        cmd.arg("RPOP").arg(key);
        self.run_command_async(&cmd).await
    }

    // ==================== Set 操作 ====================

    /// SCARD 命令
    pub async fn scard(&self, key: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("SCARD").arg(key);
        self.run_command_async(&cmd).await
    }

    /// SADD 命令
    pub async fn sadd(&self, key: &str, members: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("SADD").arg(key);
        for m in members {
            cmd.arg(m);
        }
        self.run_command_async(&cmd).await
    }

    /// SREM 命令
    pub async fn srem(&self, key: &str, members: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("SREM").arg(key);
        for m in members {
            cmd.arg(m);
        }
        self.run_command_async(&cmd).await
    }

    /// SSCAN 命令
    pub async fn sscan(&self, key: &str, cursor: u64, pattern: Option<&str>, count: Option<u64>) -> RedisResult<(u64, Vec<String>)> {
        let mut cmd = Cmd::new();
        cmd.arg("SSCAN").arg(key).arg(cursor);
        if let Some(pat) = pattern {
            cmd.arg("MATCH").arg(pat);
        }
        if let Some(c) = count {
            cmd.arg("COUNT").arg(c);
        }
        self.run_command_async(&cmd).await
    }

    /// SMISMEMBER 命令（检查成员是否存在）
    pub async fn smismember(&self, key: &str, members: &[&str]) -> RedisResult<Vec<i64>> {
        let mut cmd = Cmd::new();
        cmd.arg("SMISMEMBER").arg(key);
        for m in members {
            cmd.arg(m);
        }
        self.run_command_async(&cmd).await
    }

    /// SRANDMEMBER 命令（随机获取成员）
    pub async fn srandmember(&self, key: &str, count: Option<i64>) -> RedisResult<Vec<String>> {
        let mut cmd = Cmd::new();
        cmd.arg("SRANDMEMBER").arg(key);
        if let Some(c) = count {
            cmd.arg(c);
        }
        self.run_command_async(&cmd).await
    }

    // ==================== ZSet 操作 ====================

    /// ZCARD 命令
    pub async fn zcard(&self, key: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("ZCARD").arg(key);
        self.run_command_async(&cmd).await
    }

    /// ZRANGE 命令（with scores）
    pub async fn zrange_withscores(&self, key: &str, start: i64, stop: i64) -> RedisResult<Vec<(String, f64)>> {
        let mut cmd = Cmd::new();
        cmd.arg("ZRANGE").arg(key).arg(start).arg(stop).arg("WITHSCORES");
        self.run_command_async(&cmd).await
    }

    /// ZADD 命令
    pub async fn zadd(&self, key: &str, score: f64, member: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("ZADD").arg(key).arg(score).arg(member);
        self.run_command_async(&cmd).await
    }

    /// ZREM 命令
    pub async fn zrem(&self, key: &str, members: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("ZREM").arg(key);
        for m in members {
            cmd.arg(m);
        }
        self.run_command_async(&cmd).await
    }

    /// ZSCAN 命令
    pub async fn zscan(&self, key: &str, cursor: u64, pattern: Option<&str>, count: Option<u64>) -> RedisResult<(u64, Vec<(String, f64)>)> {
        let mut cmd = Cmd::new();
        cmd.arg("ZSCAN").arg(key).arg(cursor);
        if let Some(pat) = pattern {
            cmd.arg("MATCH").arg(pat);
        }
        if let Some(c) = count {
            cmd.arg("COUNT").arg(c);
        }
        self.run_command_async(&cmd).await
    }

    /// ZSCORE 命令
    pub async fn zscore(&self, key: &str, member: &str) -> RedisResult<Option<f64>> {
        let mut cmd = Cmd::new();
        cmd.arg("ZSCORE").arg(key).arg(member);
        self.run_command_async(&cmd).await
    }

    /// ZRANK 命令
    pub async fn zrank(&self, key: &str, member: &str) -> RedisResult<Option<u64>> {
        let mut cmd = Cmd::new();
        cmd.arg("ZRANK").arg(key).arg(member);
        self.run_command_async(&cmd).await
    }

    /// ZREVRANGE 命令（with scores）
    pub async fn zrevrange_withscores(&self, key: &str, start: i64, stop: i64) -> RedisResult<Vec<(String, f64)>> {
        let mut cmd = Cmd::new();
        cmd.arg("ZREVRANGE").arg(key).arg(start).arg(stop).arg("WITHSCORES");
        self.run_command_async(&cmd).await
    }

    // ==================== Stream 操作 ====================

    /// XLEN 命令
    pub async fn xlen(&self, key: &str) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("XLEN").arg(key);
        self.run_command_async(&cmd).await
    }

    /// XREVRANGE 命令
    pub async fn xrevrange(&self, key: &str, end: &str, start: &str, count: Option<u64>) -> RedisResult<Value> {
        let mut cmd = Cmd::new();
        cmd.arg("XREVRANGE").arg(key).arg(end).arg(start);
        if let Some(c) = count {
            cmd.arg("COUNT").arg(c);
        }
        self.run_command(&cmd).await
    }

    /// XRANGE 命令
    pub async fn xrange(&self, key: &str, start: &str, end: &str, count: Option<u64>) -> RedisResult<Value> {
        let mut cmd = Cmd::new();
        cmd.arg("XRANGE").arg(key).arg(start).arg(end);
        if let Some(c) = count {
            cmd.arg("COUNT").arg(c);
        }
        self.run_command(&cmd).await
    }

    /// XADD 命令
    pub async fn xadd(&self, key: &str, id: &str, fields: &[(&str, &str)]) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("XADD").arg(key).arg(id);
        for (field, value) in fields {
            cmd.arg(*field).arg(*value);
        }
        self.run_command_async(&cmd).await
    }

    /// XDEL 命令
    pub async fn xdel(&self, key: &str, ids: &[&str]) -> RedisResult<u64> {
        let mut cmd = Cmd::new();
        cmd.arg("XDEL").arg(key);
        for id in ids {
            cmd.arg(id);
        }
        self.run_command_async(&cmd).await
    }

    /// XINFO GROUPS 命令
    pub async fn xinfo_groups(&self, key: &str) -> RedisResult<Value> {
        let mut cmd = Cmd::new();
        cmd.arg("XINFO").arg("GROUPS").arg(key);
        self.run_command(&cmd).await
    }

    // ==================== 工具方法 ====================

    /// 获取 Redis 版本（从 INFO Server 解析）
    pub async fn redis_version(&self) -> RedisResult<String> {
        let info = self.info(Some("server")).await?;
        for line in info.lines() {
            if line.starts_with("redis_version:") {
                return Ok(line.trim_start_matches("redis_version:").to_string());
            }
        }
        Ok("unknown".to_string())
    }
}
