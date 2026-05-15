// modules/redis_desktop/storage/service.rs — 存储服务
// 封装 tauri-plugin-store，提供连接配置、设置、CLI 历史的持久化

use std::sync::Arc;

use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::shared::constants::{
    STORE_FILENAME, STORE_KEY_CONNECTIONS, STORE_KEY_SETTINGS, STORE_KEY_CLI_HISTORY,
};
use crate::shared::error::AppError;
use crate::shared::result::AppResult;

use super::models::AppSettings;

/// 存储服务
/// 封装 tauri-plugin-store 提供类型安全的持久化操作
pub struct StorageService<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> StorageService<R> {
    /// 创建新的存储服务实例
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }

    /// 获取或创建 store 实例
    fn get_store(&self) -> Result<Arc<tauri_plugin_store::Store<R>>, AppError> {
        self.app
            .store(STORE_FILENAME)
            .map_err(|e| AppError::Storage(format!("无法打开存储文件: {}", e)))
    }

    // ========== 连接配置 ==========

    /// 保存所有连接配置
    pub fn save_connections(
        &self,
        connections: &[super::super::connection::models::ConnectionConfig],
    ) -> AppResult<()> {
        let store = self.get_store()?;
        let value = serde_json::to_value(connections)?;
        store.set(STORE_KEY_CONNECTIONS.to_string(), value);
        store
            .save()
            .map_err(|e| AppError::Storage(format!("保存连接配置失败: {}", e)))?;
        log::info!("[StorageService] 已保存 {} 个连接配置", connections.len());
        Ok(())
    }

    /// 加载所有连接配置
    pub fn load_connections(
        &self,
    ) -> AppResult<Vec<super::super::connection::models::ConnectionConfig>> {
        let store = self.get_store()?;
        let value = store.get(STORE_KEY_CONNECTIONS);

        match value {
            Some(json_val) => {
                let configs: Vec<super::super::connection::models::ConnectionConfig> =
                    serde_json::from_value(json_val.clone())?;
                log::info!("[StorageService] 已加载 {} 个连接配置", configs.len());
                Ok(configs)
            }
            None => {
                log::info!("[StorageService] 未找到已保存的连接配置，返回空列表");
                Ok(vec![])
            }
        }
    }

    /// 保存单个连接配置（更新或新增）
    pub fn save_connection(
        &self,
        config: &super::super::connection::models::ConnectionConfig,
    ) -> AppResult<()> {
        let mut connections = self.load_connections()?;

        // 查找是否已存在同 ID 的配置
        if let Some(pos) = connections.iter().position(|c| c.id == config.id) {
            connections[pos] = config.clone();
        } else {
            connections.push(config.clone());
        }

        self.save_connections(&connections)
    }

    /// 删除单个连接配置
    pub fn delete_connection(&self, connection_id: &str) -> AppResult<()> {
        let mut connections = self.load_connections()?;
        let before_len = connections.len();
        connections.retain(|c| c.id != connection_id);

        if connections.len() == before_len {
            return Err(AppError::NotFound(format!(
                "连接配置 {} 不存在",
                connection_id
            )));
        }

        self.save_connections(&connections)
    }

    // ========== 应用设置 ==========

    /// 保存应用设置
    pub fn save_settings(&self, settings: &AppSettings) -> AppResult<()> {
        let store = self.get_store()?;
        let value = serde_json::to_value(settings)?;
        store.set(STORE_KEY_SETTINGS.to_string(), value);
        store
            .save()
            .map_err(|e| AppError::Storage(format!("保存设置失败: {}", e)))?;
        log::info!("[StorageService] 已保存应用设置");
        Ok(())
    }

    /// 加载应用设置
    pub fn load_settings(&self) -> AppResult<AppSettings> {
        let store = self.get_store()?;
        let value = store.get(STORE_KEY_SETTINGS);

        match value {
            Some(json_val) => {
                let settings: AppSettings = serde_json::from_value(json_val.clone())?;
                log::info!("[StorageService] 已加载应用设置");
                Ok(settings)
            }
            None => {
                log::info!("[StorageService] 未找到已保存的设置，使用默认值");
                Ok(AppSettings::default())
            }
        }
    }

    // ========== CLI 历史 ==========

    /// 保存 CLI 命令历史
    pub fn save_cli_history(&self, history: &[String]) -> AppResult<()> {
        let store = self.get_store()?;
        // 只保留最近 MAX_CLI_HISTORY 条
        let truncated: Vec<&String> = history
            .iter()
            .rev()
            .take(crate::shared::constants::MAX_CLI_HISTORY)
            .collect();
        let truncated: Vec<String> = truncated.into_iter().cloned().collect();

        let value = serde_json::to_value(&truncated)?;
        store.set(STORE_KEY_CLI_HISTORY.to_string(), value);
        store
            .save()
            .map_err(|e| AppError::Storage(format!("保存 CLI 历史失败: {}", e)))?;
        Ok(())
    }

    /// 加载 CLI 命令历史
    pub fn load_cli_history(&self) -> AppResult<Vec<String>> {
        let store = self.get_store()?;
        let value = store.get(STORE_KEY_CLI_HISTORY);

        match value {
            Some(json_val) => {
                let history: Vec<String> = serde_json::from_value(json_val.clone())?;
                Ok(history)
            }
            None => Ok(vec![]),
        }
    }
}
