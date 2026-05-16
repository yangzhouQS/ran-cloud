// modules/redis_desktop/shared/redis_client.rs — Redis 客户端封装
// 支持 Standalone / Cluster / Sentinel 多种连接模式
// 对 redis crate 的连接进行封装，支持命令拦截、超时控制、重连

use std::sync::Arc;
use std::time::Duration;

use redis::aio::MultiplexedConnection;
use redis::aio::ConnectionLike;
use redis::{Cmd, RedisResult, Value};
use tokio::sync::Mutex;

use crate::shared::constants::DEFAULT_COMMAND_TIMEOUT_SECS;

/// 内部连接类型枚举
/// 支持 Standalone（单机/哨兵发现的 master）和 Cluster（集群）两种模式
enum InnerConnection {
    /// 单机模式：使用 MultiplexedConnection
    Standalone(MultiplexedConnection),
    /// 集群模式：使用 ClusterConnection
    Cluster(redis::cluster_async::ClusterConnection),
}

impl InnerConnection {
    /// 执行 Redis 命令（带超时）
    async fn req_packed_command(&mut self, cmd: &Cmd) -> RedisResult<Value> {
        match self {
            InnerConnection::Standalone(conn) => conn.req_packed_command(cmd).await,
            InnerConnection::Cluster(conn) => conn.req_packed_command(cmd).await,
        }
    }

    /// 执行 Pipeline
    async fn req_packed_commands(
        &mut self,
        pipeline: &redis::Pipeline,
        offset: usize,
        count: usize,
    ) -> RedisResult<Vec<Value>> {
        match self {
            InnerConnection::Standalone(conn) => {
                pipeline.query_async(conn).await
            }
            InnerConnection::Cluster(conn) => {
                pipeline.query_async(conn).await
            }
        }
    }
}

/// Redis 客户端封装
/// 内部持有异步连接，支持 Standalone / Cluster 模式
/// 支持连接断开后自动重连
pub struct RedisClient {
    /// 连接名称（用于日志和调试）
    name: String,
    /// 异步连接
    conn: Arc<Mutex<Option<InnerConnection>>>,
    /// 命令超时
    command_timeout: Duration,
    /// 是否为集群模式
    is_cluster: bool,
    /// Standalone 模式的原始 Client（用于重连）
    standalone_client: Arc<Mutex<Option<redis::Client>>>,
    /// Cluster 模式的原始 ClusterClient（用于重连）
    cluster_client: Arc<Mutex<Option<redis::cluster::ClusterClient>>>,
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
            is_cluster: false,
            standalone_client: Arc::new(Mutex::new(None)),
            cluster_client: Arc::new(Mutex::new(None)),
        }
    }

    /// 通过连接字符串建立 Standalone 连接
    pub async fn connect(&self, connection_string: &str) -> RedisResult<()> {
        let client = redis::Client::open(connection_string)?;
        let conn = client
            .get_multiplexed_async_connection()
            .await?;

        // 缓存原始 Client 用于自动重连
        {
            let mut guard = self.standalone_client.lock().await;
            *guard = Some(client);
        }

        let mut guard = self.conn.lock().await;
        *guard = Some(InnerConnection::Standalone(conn));

        log::info!("[RedisClient:{}] 已连接 (Standalone): {}", self.name, connection_string);
        Ok(())
    }

    /// 通过 redis::Client 建立 Standalone 连接（支持更多配置项）
    pub async fn connect_with_client(&self, client: redis::Client) -> RedisResult<()> {
        let conn = client
            .get_multiplexed_async_connection()
            .await?;

        // 缓存原始 Client 用于自动重连
        {
            let mut guard = self.standalone_client.lock().await;
            *guard = Some(client);
        }

        let mut guard = self.conn.lock().await;
        *guard = Some(InnerConnection::Standalone(conn));

        log::info!("[RedisClient:{}] 已连接 (Standalone via Client)", self.name);
        Ok(())
    }

    /// 通过节点列表建立 Cluster 连接
    /// nodes 格式: ["redis://host:port", "redis://host:port"]
    pub async fn connect_cluster(&mut self, nodes: Vec<String>) -> RedisResult<()> {
        let client = redis::cluster::ClusterClient::new(nodes)?;
        let conn = client
            .get_async_connection()
            .await?;

        // 缓存原始 ClusterClient 用于自动重连
        {
            let mut guard = self.cluster_client.lock().await;
            *guard = Some(client);
        }

        let mut guard = self.conn.lock().await;
        *guard = Some(InnerConnection::Cluster(conn));
        self.is_cluster = true;

        log::info!("[RedisClient:{}] 已连接 (Cluster)", self.name);
        Ok(())
    }

    /// 通过 ClusterClientBuilder 建立带配置的 Cluster 连接
    pub async fn connect_cluster_with_builder(
        &mut self,
        builder: redis::cluster::ClusterClientBuilder,
    ) -> RedisResult<()> {
        let client = builder.build()?;
        let conn = client
            .get_async_connection()
            .await?;

        // 缓存原始 ClusterClient 用于自动重连
        {
            let mut guard = self.cluster_client.lock().await;
            *guard = Some(client);
        }

        let mut guard = self.conn.lock().await;
        *guard = Some(InnerConnection::Cluster(conn));
        self.is_cluster = true;

        log::info!("[RedisClient:{}] 已连接 (Cluster with config)", self.name);
        Ok(())
    }

    /// 通过 Sentinel 发现 master 并建立 Standalone 连接
    /// 返回 master 地址信息
    pub async fn connect_via_sentinel(
        &mut self,
        sentinel_nodes: Vec<String>,
        master_name: &str,
        sentinel_password: Option<&str>,
        sentinel_username: Option<&str>,
        node_password: Option<&str>,
        db: u32,
    ) -> RedisResult<(String, u16)> {
        // 连接到 Sentinel 并发现 master
        let master_info = discover_sentinel_master(
            &sentinel_nodes,
            master_name,
            sentinel_password,
            sentinel_username,
        ).await?;

        // 使用发现的 master 地址建立 Standalone 连接
        let auth = match node_password {
            Some(pwd) if !pwd.is_empty() => format!(":{}@", pwd),
            _ => String::new(),
        };
        let connection_string = format!("redis://{}{}:{}/{}", auth, master_info.0, master_info.1, db);
        self.connect(&connection_string).await?;

        log::info!(
            "[RedisClient:{}] 已通过 Sentinel 连接到 master {}:{}",
            self.name, master_info.0, master_info.1
        );

        Ok(master_info)
    }

    /// 执行 Redis 命令（带超时 + 自动重连），返回原始 Value
    pub async fn run_command(&self, cmd: &Cmd) -> RedisResult<Value> {
        let result = self.run_command_inner(cmd).await;
        if let Err(ref e) = result {
            if Self::is_connection_error(e) {
                log::warn!("[RedisClient:{}] 检测到连接错误: {}, 尝试自动重连...", self.name, e);
                if self.try_reconnect().await.is_ok() {
                    log::info!("[RedisClient:{}] 重连成功, 重试命令", self.name);
                    return self.run_command_inner(cmd).await;
                }
            }
        }
        result
    }

    /// 内部执行命令（不带重连逻辑）
    async fn run_command_inner(&self, cmd: &Cmd) -> RedisResult<Value> {
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

    /// 执行 Pipeline（多条命令一次性发送，带自动重连）
    pub async fn run_pipeline(&self, pipeline: &redis::Pipeline) -> RedisResult<Vec<Value>> {
        let result = self.run_pipeline_inner(pipeline).await;
        if let Err(ref e) = result {
            if Self::is_connection_error(e) {
                log::warn!("[RedisClient:{}] Pipeline 检测到连接错误: {}, 尝试自动重连...", self.name, e);
                if self.try_reconnect().await.is_ok() {
                    log::info!("[RedisClient:{}] 重连成功, 重试 Pipeline", self.name);
                    return self.run_pipeline_inner(pipeline).await;
                }
            }
        }
        result
    }

    /// 内部执行 Pipeline（不带重连逻辑）
    async fn run_pipeline_inner(&self, pipeline: &redis::Pipeline) -> RedisResult<Vec<Value>> {
        let mut guard = self.conn.lock().await;
        let conn = guard
            .as_mut()
            .ok_or_else(|| redis::RedisError::from(std::io::Error::new(
                std::io::ErrorKind::NotConnected,
                format!("Redis 客户端 {} 未连接", self.name),
            )))?;

        tokio::time::timeout(
            self.command_timeout,
            conn.req_packed_commands(pipeline, 0, 0),
        )
            .await
            .map_err(|_| redis::RedisError::from(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                format!("Pipeline 执行超时 ({:?})", self.command_timeout),
            )))?
    }

    // ==================== 连接管理 ====================

    /// 判断错误是否为连接断开类错误（需要重连）
    fn is_connection_error(e: &redis::RedisError) -> bool {
        let error_msg = e.to_string().to_lowercase();
        // 常见的连接断开错误关键词
        error_msg.contains("broken pipe")
            || error_msg.contains("connection reset")
            || error_msg.contains("connection refused")
            || error_msg.contains("not connected")
            || error_msg.contains("eof")
            || error_msg.contains("unexpected end")
            || error_msg.contains("connection aborted")
            || error_msg.contains("network unreachable")
            || error_msg.contains("no connection")
            || error_msg.contains("io error")
    }

    /// 尝试使用缓存的 Client 重新建立连接
    async fn try_reconnect(&self) -> RedisResult<()> {
        if self.is_cluster {
            // Cluster 模式重连
            let client = {
                let guard = self.cluster_client.lock().await;
                guard.as_ref()
                    .ok_or_else(|| redis::RedisError::from(std::io::Error::new(
                        std::io::ErrorKind::NotConnected,
                        format!("Redis 客户端 {} 无缓存的 ClusterClient，无法重连", self.name),
                    )))?
                    .clone()
            };
            let conn = client.get_async_connection().await?;
            let mut guard = self.conn.lock().await;
            *guard = Some(InnerConnection::Cluster(conn));
            log::info!("[RedisClient:{}] Cluster 自动重连成功", self.name);
            Ok(())
        } else {
            // Standalone 模式重连
            let client = {
                let guard = self.standalone_client.lock().await;
                guard.as_ref()
                    .ok_or_else(|| redis::RedisError::from(std::io::Error::new(
                        std::io::ErrorKind::NotConnected,
                        format!("Redis 客户端 {} 无缓存的 Client，无法重连", self.name),
                    )))?
                    .clone()
            };
            let conn = client.get_multiplexed_async_connection().await?;
            let mut guard = self.conn.lock().await;
            *guard = Some(InnerConnection::Standalone(conn));
            log::info!("[RedisClient:{}] Standalone 自动重连成功", self.name);
            Ok(())
        }
    }

    /// 关闭连接（同时清理缓存的 Client）
    pub async fn disconnect(&self) {
        {
            let mut guard = self.conn.lock().await;
            *guard = None;
        }
        {
            let mut guard = self.standalone_client.lock().await;
            *guard = None;
        }
        {
            let mut guard = self.cluster_client.lock().await;
            *guard = None;
        }
        log::info!("[RedisClient:{}] 已断开连接并清理缓存", self.name);
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

    /// 是否为集群模式
    pub fn is_cluster_mode(&self) -> bool {
        self.is_cluster
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

    // ==================== 集群节点发现 ====================

    /// 执行 CLUSTER NODES 命令，返回原始文本
    pub async fn cluster_nodes(&self) -> RedisResult<String> {
        let mut cmd = Cmd::new();
        cmd.arg("CLUSTER").arg("NODES");
        self.run_command_async(&cmd).await
    }

    /// 解析 CLUSTER NODES 输出，返回节点信息列表
    /// CLUSTER NODES 输出格式:
    /// <id> <ip:port@cport> <flags> <master> <ping-sent> <pong-recv> <config-epoch> <link-state> <slot> ...
    pub fn parse_cluster_nodes(output: &str) -> Vec<crate::modules::redis_desktop::connection::models::ClusterNodeInfo> {
        let mut nodes = Vec::new();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }

            let node_id = parts[0].to_string();

            // 解析地址: ip:port@cport 或 [ipv6]:port@cport
            let addr_part = parts[1];
            // 去掉 @cport 部分
            let addr_str = if let Some(at_pos) = addr_part.rfind('@') {
                &addr_part[..at_pos]
            } else {
                addr_part
            };

            // 解析 host:port（处理 IPv6）
            let (host, port) = if addr_str.starts_with('[') {
                // IPv6: [::1]:6379
                if let Some(bracket_end) = addr_str.find("]:") {
                    let host = addr_str[..=bracket_end].to_string();
                    let port_str = &addr_str[bracket_end + 2..];
                    let port = port_str.parse::<u16>().unwrap_or(6379);
                    (host, port)
                } else {
                    continue;
                }
            } else {
                // IPv4: 127.0.0.1:6379
                let last_colon = addr_str.rfind(':').unwrap_or(0);
                if last_colon == 0 {
                    continue;
                }
                let host = addr_str[..last_colon].to_string();
                let port = addr_str[last_colon + 1..].parse::<u16>().unwrap_or(6379);
                (host, port)
            };

            let flags = parts[2].to_string();
            let is_master = flags.contains("master");

            nodes.push(crate::modules::redis_desktop::connection::models::ClusterNodeInfo {
                node_id,
                host,
                port,
                flags,
                is_master,
            });
        }

        nodes
    }

    /// 通过节点地址列表建立 Cluster 连接（支持 NAT 映射）
    /// nodes 格式: ["redis://host:port", ...]
    /// nat_map: 内部地址 → 外部地址的映射（用于 Docker/NAT 环境）
    pub async fn connect_cluster_with_nat_map(
        &mut self,
        initial_nodes: Vec<String>,
        nat_map: Option<&std::collections::HashMap<String, crate::modules::redis_desktop::connection::models::NatMapEntry>>,
    ) -> RedisResult<()> {
        // 如果有 NAT 映射，需要将内部地址替换为外部地址
        let resolved_nodes = if let Some(map) = nat_map {
            if map.is_empty() {
                initial_nodes
            } else {
                initial_nodes
                    .into_iter()
                    .map(|node| {
                        // 从 redis://host:port 提取 host:port
                        let addr = node
                            .trim_start_matches("redis://")
                            .trim_start_matches("rediss://");
                        // 去掉认证部分
                        let addr = if let Some(at_pos) = addr.rfind('@') {
                            &addr[at_pos + 1..]
                        } else {
                            addr
                        };

                        if let Some(entry) = map.get(addr) {
                            // 替换为映射地址
                            let auth_part = if let Some(at_pos) = node.rfind('@') {
                                let prefix = if node.starts_with("redis://") {
                                    "redis://"
                                } else {
                                    "rediss://"
                                };
                                format!("{}{}", prefix, &node[prefix.len()..=at_pos])
                            } else {
                                "redis://".to_string()
                            };
                            format!("{}{}:{}", auth_part, entry.host, entry.port)
                        } else {
                            node
                        }
                    })
                    .collect()
            }
        } else {
            initial_nodes
        };

        let client = redis::cluster::ClusterClient::new(resolved_nodes)?;
        let conn = client.get_async_connection().await?;

        // 缓存原始 ClusterClient 用于自动重连
        {
            let mut guard = self.cluster_client.lock().await;
            *guard = Some(client);
        }

        let mut guard = self.conn.lock().await;
        *guard = Some(InnerConnection::Cluster(conn));
        self.is_cluster = true;

        log::info!("[RedisClient:{}] 已连接 (Cluster with NAT map)", self.name);
        Ok(())
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

// ==================== Sentinel 辅助函数 ====================

/// 通过 Sentinel 发现 master 地址
/// 返回 (host, port)
async fn discover_sentinel_master(
    sentinel_nodes: &[String],
    master_name: &str,
    password: Option<&str>,
    username: Option<&str>,
) -> RedisResult<(String, u16)> {
    // 尝试连接到任意一个 Sentinel 节点
    let mut last_error = None;

    for node in sentinel_nodes {
        // 解析节点地址
        let node_url = if let Some(pwd) = password {
            if let Some(user) = username {
                format!("redis://{}:{}@{}", user, pwd, node.replace("redis://", ""))
            } else {
                format!("redis://:{}@{}", pwd, node.replace("redis://", ""))
            }
        } else {
            if node.starts_with("redis://") {
                node.clone()
            } else {
                format!("redis://{}", node)
            }
        };

        match try_sentinel_master(&node_url, master_name).await {
            Ok(info) => return Ok(info),
            Err(e) => {
                log::warn!("[Sentinel] 连接 {} 失败: {}", node, e);
                last_error = Some(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        redis::RedisError::from(std::io::Error::new(
            std::io::ErrorKind::NotConnected,
            "所有 Sentinel 节点均不可达",
        ))
    }))
}

/// 尝试从单个 Sentinel 获取 master 地址
async fn try_sentinel_master(
    sentinel_url: &str,
    master_name: &str,
) -> RedisResult<(String, u16)> {
    let client = redis::Client::open(sentinel_url)?;
    let mut conn = client.get_multiplexed_async_connection().await?;

    // SENTINEL GET-MASTER-ADDR-BY-NAME <master_name>
    let mut cmd = Cmd::new();
    cmd.arg("SENTINEL").arg("GET-MASTER-ADDR-BY-NAME").arg(master_name);

    let value = conn.req_packed_command(&cmd).await?;
    let result: Option<(String, u16)> = redis::from_redis_value(&value)?;

    match result {
        Some((host, port)) => Ok((host, port)),
        None => Err(redis::RedisError::from(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Sentinel 未找到 master: {}", master_name),
        ))),
    }
}
