// modules/sql_studio/plugin/manager.rs — 插件管理器
// 负责插件发现、加载、启用/禁用生命周期管理

use std::path::{Path, PathBuf};
use std::sync::Arc;

use dashmap::DashMap;

use crate::shared::error::AppError;

use super::models::{PluginManifest, PluginMetadata};
use super::store::PluginDataStore;

/// 插件管理器
/// 管理所有已发现插件的元数据和生命周期
pub struct PluginManager {
    /// 已发现的插件 <plugin_id, PluginMetadata>
    plugins: DashMap<String, PluginMetadata>,
    /// 插件目录
    plugins_dir: PathBuf,
    /// 插件数据存储
    store: Arc<PluginDataStore>,
}

impl PluginManager {
    /// 创建插件管理器
    pub fn new(plugins_dir: PathBuf, store: Arc<PluginDataStore>) -> Self {
        // 确保插件目录存在
        if let Err(e) = std::fs::create_dir_all(&plugins_dir) {
            log::error!("[PluginManager] 创建插件目录失败 {:?}: {}", plugins_dir, e);
        }
        Self {
            plugins: DashMap::new(),
            plugins_dir,
            store,
        }
    }

    /// 扫描插件目录，发现并加载所有插件
    pub fn discover_plugins(&self) -> Result<usize, AppError> {
        let read_dir = std::fs::read_dir(&self.plugins_dir)
            .map_err(|e| AppError::Storage(format!("读取插件目录失败: {}", e)))?;

        let mut count = 0;
        for entry in read_dir {
            let entry = entry.map_err(|e| AppError::Storage(format!("读取目录项失败: {}", e)))?;
            let path = entry.path();

            // 只处理子目录
            if !path.is_dir() {
                continue;
            }

            let manifest_path = path.join("manifest.json");
            if !manifest_path.exists() {
                log::warn!("[PluginManager] 跳过无 manifest.json 的目录: {:?}", path);
                continue;
            }

            match Self::load_manifest(&manifest_path) {
                Ok(manifest) => {
                    let plugin_id = manifest.id.clone();
                    let enabled = self.store.is_enabled(&plugin_id).unwrap_or(true);
                    let loadable = Self::is_loadable(&manifest);

                    let metadata = PluginMetadata {
                        install_path: path.to_string_lossy().to_string(),
                        enabled,
                        loadable,
                        manifest,
                    };

                    self.plugins.insert(plugin_id, metadata);
                    count += 1;
                }
                Err(e) => {
                    log::error!("[PluginManager] 加载清单失败 {:?}: {}", manifest_path, e);
                }
            }
        }

        log::info!("[PluginManager] 发现 {} 个插件", count);
        Ok(count)
    }

    /// 获取所有插件元数据
    pub fn list_plugins(&self) -> Vec<PluginMetadata> {
        self.plugins.iter().map(|r| r.value().clone()).collect()
    }

    /// 获取单个插件元数据
    pub fn get_plugin(&self, id: &str) -> Option<PluginMetadata> {
        self.plugins.get(id).map(|r| r.value().clone())
    }

    /// 获取插件清单
    pub fn get_manifest(&self, id: &str) -> Option<PluginManifest> {
        self.plugins.get(id).map(|r| r.manifest.clone())
    }

    /// 启用插件
    pub fn enable_plugin(&self, id: &str) -> Result<(), AppError> {
        let mut plugin = self.plugins.get_mut(id)
            .ok_or_else(|| AppError::NotFound(format!("插件不存在: {}", id)))?;
        plugin.enabled = true;
        self.store.set_enabled(id, true)?;
        log::info!("[PluginManager] 插件已启用: {}", id);
        Ok(())
    }

    /// 禁用插件
    pub fn disable_plugin(&self, id: &str) -> Result<(), AppError> {
        let mut plugin = self.plugins.get_mut(id)
            .ok_or_else(|| AppError::NotFound(format!("插件不存在: {}", id)))?;
        plugin.enabled = false;
        self.store.set_enabled(id, false)?;
        log::info!("[PluginManager] 插件已禁用: {}", id);
        Ok(())
    }

    /// 解析插件资源路径（带路径遍历防护）
    /// 返回安全的绝对路径，确保在插件目录内
    pub fn resolve_asset_path(&self, plugin_id: &str, relative_path: &str) -> Result<PathBuf, AppError> {
        let plugin_dir = self.plugins_dir.join(plugin_id);

        // 检查插件是否存在
        if !plugin_dir.exists() {
            return Err(AppError::NotFound(format!("插件不存在: {}", plugin_id)));
        }

        // 检查插件是否已禁用
        if let Some(metadata) = self.plugins.get(plugin_id) {
            if !metadata.enabled {
                return Err(AppError::Forbidden(format!("插件已禁用: {}", plugin_id)));
            }
        }

        // 路径遍历防护：拒绝包含 .. 的相对路径
        if relative_path.contains("..") {
            return Err(AppError::Forbidden("路径包含非法字符".to_string()));
        }

        // 如果清单指定了 plugin_entry_dir，需要拼接到路径前
        let effective_relative = if let Some(metadata) = self.plugins.get(plugin_id) {
            if let Some(ref entry_dir) = metadata.manifest.plugin_entry_dir {
                if !entry_dir.is_empty() {
                    // 同样拒绝 plugin_entry_dir 中的 ..
                    if entry_dir.contains("..") {
                        return Err(AppError::Forbidden("插件入口目录配置非法".to_string()));
                    }
                    format!("{}/{}", entry_dir.trim_end_matches('/'), relative_path.trim_start_matches('/'))
                } else {
                    relative_path.to_string()
                }
            } else {
                relative_path.to_string()
            }
        } else {
            relative_path.to_string()
        };

        let resolved = plugin_dir.join(&effective_relative);

        // 规范化插件目录（确保真实路径）
        let canonical_plugin_dir = plugin_dir.canonicalize()
            .map_err(|e| AppError::Storage(format!("规范化插件目录路径失败: {}", e)))?;

        // 规范化解析后的路径
        // 如果文件存在，直接 canonicalize；否则规范化父目录后拼接文件名
        let canonical_resolved = if resolved.exists() {
            resolved.canonicalize()
                .map_err(|e| AppError::NotFound("资源不存在".to_string()))?
        } else {
            // 文件不存在：先检查父目录是否存在且在插件目录内
            let parent = match resolved.parent() {
                Some(p) if !p.as_os_str().is_empty() => p,
                _ => return Err(AppError::NotFound("资源不存在".to_string())),
            };

            if !parent.exists() {
                return Err(AppError::NotFound("资源不存在".to_string()));
            }

            let canonical_parent = parent.canonicalize()
                .map_err(|e| AppError::NotFound("资源不存在".to_string()))?;

            // 验证父目录在插件目录内
            if !canonical_parent.starts_with(&canonical_plugin_dir) {
                return Err(AppError::Forbidden("路径超出插件目录范围".to_string()));
            }

            canonical_parent.join(resolved.file_name().unwrap_or_default())
        };

        // 最终验证：确保解析后的路径在插件目录内
        if !canonical_resolved.starts_with(&canonical_plugin_dir) {
            return Err(AppError::Forbidden("路径超出插件目录范围".to_string()));
        }

        Ok(canonical_resolved)
    }

    /// 从文件加载插件清单
    fn load_manifest(path: &Path) -> Result<PluginManifest, AppError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| AppError::Storage(format!("读取清单文件失败: {}", e)))?;
        let manifest: PluginManifest = serde_json::from_str(&content)?;
        Ok(manifest)
    }

    /// 检查插件是否可加载（版本兼容性）
    fn is_loadable(manifest: &PluginManifest) -> bool {
        if let Some(ref min_version) = manifest.min_app_version {
            // 简单的版本检查：尝试用 semver 解析
            match semver::Version::parse(env!("CARGO_PKG_VERSION")) {
                Ok(app_version) => {
                    match semver::VersionReq::parse(min_version) {
                        Ok(req) => req.matches(&app_version),
                        Err(_) => {
                            log::warn!("[PluginManager] 无效的版本要求: {}", min_version);
                            true // 无效版本要求时允许加载
                        }
                    }
                }
                Err(_) => true,
            }
        } else {
            true // 没有版本要求
        }
    }
}
