// modules/sql_studio/plugin/models.rs — 插件系统核心类型定义
// 包含插件清单、元数据、API 请求/响应等数据结构

use serde::{Deserialize, Serialize};

// ==================== 插件清单类型 ====================

/// 插件作者（字符串或结构化格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PluginAuthor {
    /// 简单字符串格式
    Simple(String),
    /// 结构化格式
    Structured { name: String, url: String },
}

/// 插件视图定义
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginView {
    /// 视图唯一 ID（在插件内唯一）
    pub id: String,
    /// 视图显示名称
    pub name: String,
    /// 视图类型："shell-tab" | "base-tab"
    #[serde(rename = "type")]
    pub view_type: String,
    /// HTML 入口文件名（相对于 plugin_entry_dir）
    pub entry: String,
}

/// 插件菜单项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMenuItem {
    /// 命令标识符
    pub command: String,
    /// 菜单显示名称
    pub name: String,
    /// 关联的视图 ID
    pub view: String,
    /// 菜单位置
    pub placement: String,
}

/// 插件能力声明
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCapabilities {
    /// 插件提供的视图列表
    pub views: Vec<PluginView>,
    /// 插件注册的菜单项
    #[serde(default)]
    pub menu: Vec<PluginMenuItem>,
}

/// 插件清单（Manifest V1）
/// 从 {plugin_dir}/manifest.json 文件解析
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    /// 插件唯一标识符
    pub id: String,
    /// 插件显示名称
    pub name: String,
    /// 插件版本（语义化版本）
    pub version: String,
    /// 插件描述
    #[serde(default)]
    pub description: String,
    /// 作者信息
    #[serde(default)]
    pub author: Option<PluginAuthor>,
    /// 最低应用版本要求
    pub min_app_version: Option<String>,
    /// 图标（Material UI 图标名）
    pub icon: Option<String>,
    /// 清单版本（默认 1）
    #[serde(default = "default_manifest_version")]
    pub manifest_version: u32,
    /// 插件入口目录（如 "dist/"），为空则根目录
    pub plugin_entry_dir: Option<String>,
    /// 插件能力声明
    pub capabilities: PluginCapabilities,
}

fn default_manifest_version() -> u32 {
    1
}

// ==================== 插件运行时类型 ====================

/// 插件元数据（运行时状态）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMetadata {
    /// 插件清单
    pub manifest: PluginManifest,
    /// 是否已启用
    pub enabled: bool,
    /// 是否可加载（版本兼容等）
    pub loadable: bool,
    /// 安装路径
    pub install_path: String,
}

// ==================== 插件 API 通信类型 ====================
// 对应前端 postMessage 的数据格式

/// 插件 API 请求（从插件 iframe 发出）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginApiRequest {
    /// 请求 ID（用于请求-响应匹配）
    pub id: String,
    /// API 方法名
    pub name: String,
    /// 方法参数
    #[serde(default = "default_args")]
    pub args: serde_json::Value,
}

fn default_args() -> serde_json::Value {
    serde_json::json!({})
}

/// 插件 API 响应（返回给插件 iframe）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginApiResponse {
    /// 对应的请求 ID
    pub id: String,
    /// API 方法名
    pub name: String,
    /// 返回结果（成功时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl PluginApiResponse {
    /// 创建成功响应
    pub fn ok(request: &PluginApiRequest, result: serde_json::Value) -> Self {
        Self {
            id: request.id.clone(),
            name: request.name.clone(),
            result: Some(result),
            error: None,
        }
    }

    /// 创建错误响应
    pub fn err(request: &PluginApiRequest, error: String) -> Self {
        Self {
            id: request.id.clone(),
            name: request.name.clone(),
            result: None,
            error: Some(error),
        }
    }
}

/// 插件通知（无 ID，不需要响应）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginNotification {
    /// 通知名称
    pub name: String,
    /// 通知数据
    #[serde(default = "default_args")]
    pub args: serde_json::Value,
}
