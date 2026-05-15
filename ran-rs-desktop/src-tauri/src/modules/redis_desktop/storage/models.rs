// modules/redis_desktop/storage/models.rs — 存储相关数据模型

use serde::{Deserialize, Serialize};

/// 应用全局设置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// 界面语言（zh-CN, en-US 等）
    pub language: String,

    /// 主题（light, dark, system）
    pub theme: String,

    /// 字体大小
    pub font_size: u32,

    /// Key 分隔符
    pub key_separator: String,

    /// 默认 Scan 数量
    pub scan_count: u64,

    /// 默认分页大小
    pub page_size: usize,

    /// 命令超时（秒）
    pub command_timeout_secs: u64,

    /// 连接超时（秒）
    pub connection_timeout_secs: u64,

    /// 是否自动刷新 Key 列表
    pub auto_refresh_keys: bool,

    /// 自动刷新间隔（毫秒）
    pub auto_refresh_interval_ms: u64,

    /// 是否显示 CLI 命令提示
    pub show_cli_suggestions: bool,

    /// 最大 CLI 历史记录数
    pub max_cli_history: usize,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "zh-CN".to_string(),
            theme: "system".to_string(),
            font_size: 14,
            key_separator: ":".to_string(),
            scan_count: 200,
            page_size: 50,
            command_timeout_secs: 5,
            connection_timeout_secs: 5,
            auto_refresh_keys: false,
            auto_refresh_interval_ms: 5000,
            show_cli_suggestions: true,
            max_cli_history: 500,
        }
    }
}
