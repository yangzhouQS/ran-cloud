// shared/constants.rs — 全局常量定义

/// 应用名称
pub const APP_NAME: &str = "Ran RS Desktop";

/// 默认连接超时（秒）
pub const DEFAULT_CONNECTION_TIMEOUT_SECS: u64 = 5;

/// 默认命令执行超时（秒）
pub const DEFAULT_COMMAND_TIMEOUT_SECS: u64 = 30;

/// 最大 key 名称长度
pub const MAX_KEY_NAME_LENGTH: usize = 1024;

/// Scan 命令默认 count
pub const DEFAULT_SCAN_COUNT: u64 = 200;

/// 大 key 阈值（字节），超过此值使用分段加载
pub const BIG_KEY_THRESHOLD_BYTES: usize = 512 * 1024; // 512KB

/// 分页默认大小
pub const DEFAULT_PAGE_SIZE: usize = 50;

/// CLI 历史记录最大条数
pub const MAX_CLI_HISTORY: usize = 500;

/// Slow Log 默认查询条数
pub const DEFAULT_SLOWLOG_COUNT: i64 = 100;

/// Store 存储文件名
pub const STORE_FILENAME: &str = "ran-rs-desktop-store";

/// 连接配置存储 key
pub const STORE_KEY_CONNECTIONS: &str = "connections";

/// 应用设置存储 key
pub const STORE_KEY_SETTINGS: &str = "settings";

/// CLI 历史记录存储 key
pub const STORE_KEY_CLI_HISTORY: &str = "cli_history";
