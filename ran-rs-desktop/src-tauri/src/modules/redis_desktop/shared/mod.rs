// modules/redis-desktop/shared/mod.rs — Redis 模块内部共享
// Redis 模块专用工具、类型、客户端封装

pub mod redis_client;

pub use redis_client::RedisClient;
