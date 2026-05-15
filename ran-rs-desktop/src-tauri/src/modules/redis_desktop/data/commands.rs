// modules/redis_desktop/data/commands.rs — 数据类型操作 Tauri Commands
// Phase 2 实现：String/Hash/List/Set/ZSet/Stream 完整 CRUD
// 所有命令通过 Tauri State 获取 RedisConnectionManager，委托 DataService 执行

use std::sync::Arc;
use tauri::State;

use crate::shared::result::AppResult;
use crate::modules::redis_desktop::connection::service::RedisConnectionManager;
use crate::modules::redis_desktop::data::models::*;
use crate::modules::redis_desktop::data::service::DataService;

// ==================== String ====================

/// 获取 String 值
#[tauri::command]
pub async fn redis_data_string_get(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    key: String,
) -> AppResult<StringData> {
    DataService::string_get(&manager, &connection_id, db, &key).await
}

/// 设置 String 值
#[tauri::command]
pub async fn redis_data_string_set(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    key: String,
    value: String,
    ttl: Option<i64>,
) -> AppResult<()> {
    DataService::string_set(&manager, &connection_id, db, &key, &value, ttl).await
}

// ==================== Hash ====================

/// 获取 Hash 所有字段（分页）
#[tauri::command]
pub async fn redis_data_hash_page(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: HashPageParams,
) -> AppResult<PageResult<HashField>> {
    DataService::hash_page(&manager, &params).await
}

/// 添加 Hash 字段
#[tauri::command]
pub async fn redis_data_hash_add(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataAddParams,
) -> AppResult<()> {
    DataService::hash_add(&manager, &params).await
}

/// 更新 Hash 字段
#[tauri::command]
pub async fn redis_data_hash_update(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataUpdateParams,
) -> AppResult<()> {
    DataService::hash_update(&manager, &params).await
}

/// 删除 Hash 字段
#[tauri::command]
pub async fn redis_data_hash_delete(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataDeleteParams,
) -> AppResult<u64> {
    DataService::hash_delete(&manager, &params).await
}

// ==================== List ====================

/// 获取 List 元素（分页）
#[tauri::command]
pub async fn redis_data_list_page(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: ListPageParams,
) -> AppResult<PageResult<ListEntry>> {
    DataService::list_page(&manager, &params).await
}

/// 添加 List 元素
#[tauri::command]
pub async fn redis_data_list_add(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataAddParams,
) -> AppResult<()> {
    DataService::list_add(&manager, &params).await
}

/// 更新 List 元素（按索引）
#[tauri::command]
pub async fn redis_data_list_update(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataUpdateParams,
) -> AppResult<()> {
    DataService::list_update(&manager, &params).await
}

/// 删除 List 元素
#[tauri::command]
pub async fn redis_data_list_delete(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataDeleteParams,
) -> AppResult<u64> {
    DataService::list_delete(&manager, &params).await
}

// ==================== Set ====================

/// 获取 Set 成员（分页）
#[tauri::command]
pub async fn redis_data_set_page(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: SetPageParams,
) -> AppResult<PageResult<SetMember>> {
    DataService::set_page(&manager, &params).await
}

/// 添加 Set 成员
#[tauri::command]
pub async fn redis_data_set_add(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataAddParams,
) -> AppResult<u64> {
    DataService::set_add(&manager, &params).await
}

/// 删除 Set 成员
#[tauri::command]
pub async fn redis_data_set_delete(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataDeleteParams,
) -> AppResult<u64> {
    DataService::set_delete(&manager, &params).await
}

// ==================== ZSet ====================

/// 获取 ZSet 成员（分页）
#[tauri::command]
pub async fn redis_data_zset_page(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: ZSetPageParams,
) -> AppResult<PageResult<ZSetEntry>> {
    DataService::zset_page(&manager, &params).await
}

/// 添加 ZSet 成员
#[tauri::command]
pub async fn redis_data_zset_add(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataAddParams,
) -> AppResult<u64> {
    DataService::zset_add(&manager, &params).await
}

/// 更新 ZSet 成员分数
#[tauri::command]
pub async fn redis_data_zset_update(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataUpdateParams,
) -> AppResult<()> {
    DataService::zset_update(&manager, &params).await
}

/// 删除 ZSet 成员
#[tauri::command]
pub async fn redis_data_zset_delete(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataDeleteParams,
) -> AppResult<u64> {
    DataService::zset_delete(&manager, &params).await
}

// ==================== Stream ====================

/// 获取 Stream 条目（分页）
#[tauri::command]
pub async fn redis_data_stream_page(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: StreamPageParams,
) -> AppResult<PageResult<StreamEntry>> {
    DataService::stream_page(&manager, &params).await
}

/// 添加 Stream 条目
#[tauri::command]
pub async fn redis_data_stream_add(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    key: String,
    fields: Vec<(String, String)>,
    id: Option<String>,
) -> AppResult<String> {
    DataService::stream_add(
        &manager,
        &connection_id,
        db,
        &key,
        &fields,
        id.as_deref(),
    ).await
}

/// 删除 Stream 条目
#[tauri::command]
pub async fn redis_data_stream_delete(
    manager: State<'_, Arc<RedisConnectionManager>>,
    params: DataDeleteParams,
) -> AppResult<u64> {
    DataService::stream_delete(&manager, &params).await
}

/// 获取 Stream 消费者组信息
#[tauri::command]
pub async fn redis_data_stream_groups(
    manager: State<'_, Arc<RedisConnectionManager>>,
    connection_id: String,
    db: u32,
    key: String,
) -> AppResult<Vec<StreamGroupInfo>> {
    DataService::stream_groups(&manager, &connection_id, db, &key).await
}
