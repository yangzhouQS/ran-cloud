// shared/event.rs — 事件命名空间工具
// 所有模块使用统一的命名空间格式：{module_prefix}:{event_name}

/// 生成命名空间事件名
/// 格式：`module:event`
///
/// # 示例
/// ```
/// use ran_rs_desktop_lib::shared::event::namespaced_event;
/// assert_eq!(namespaced_event("redis", "connection:status"), "redis:connection:status");
/// ```
pub fn namespaced_event(module: &str, event: &str) -> String {
    format!("{}:{}", module, event)
}

/// Redis 模块事件前缀
pub const MODULE_REDIS: &str = "redis";

/// Telepresence 模块事件前缀
pub const MODULE_TELEPRESENCE: &str = "telepresence";

/// Storage 模块事件前缀
pub const MODULE_STORAGE: &str = "storage";

/// 生成 Redis 模块事件名
/// 格式：`redis:{event}`
pub fn redis_event(event: &str) -> String {
    namespaced_event(MODULE_REDIS, event)
}

/// 生成 Telepresence 模块事件名
/// 格式：`telepresence:{event}`
pub fn telepresence_event(event: &str) -> String {
    namespaced_event(MODULE_TELEPRESENCE, event)
}

/// 生成 Storage 模块事件名
/// 格式：`storage:{event}`
pub fn storage_event(event: &str) -> String {
    namespaced_event(MODULE_STORAGE, event)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_namespaced_event() {
        assert_eq!(namespaced_event("redis", "connection:status"), "redis:connection:status");
        assert_eq!(namespaced_event("telepresence", "connected"), "telepresence:connected");
    }

    #[test]
    fn test_redis_event() {
        assert_eq!(redis_event("key:updated"), "redis:key:updated");
        assert_eq!(redis_event("cli:output"), "redis:cli:output");
    }

    #[test]
    fn test_telepresence_event() {
        assert_eq!(telepresence_event("connected"), "telepresence:connected");
    }
}
