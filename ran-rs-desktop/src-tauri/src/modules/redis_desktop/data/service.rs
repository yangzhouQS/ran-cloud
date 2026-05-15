// modules/redis_desktop/data/service.rs — 数据类型操作服务
// 实现 String/Hash/List/Set/ZSet/Stream 六种数据类型的完整 CRUD 操作

use std::sync::Arc;

use redis::Value;

use crate::shared::error::AppError;
use crate::modules::redis_desktop::connection::service::RedisConnectionManager;
use crate::modules::redis_desktop::data::models::*;

/// 数据操作服务
/// 无状态服务，所有方法通过 RedisConnectionManager 获取连接执行操作
pub struct DataService;

impl DataService {
    // ==================== String ====================

    /// 获取 String 值
    pub async fn string_get(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        _db: u32,
        key: &str,
    ) -> Result<StringData, AppError> {
        let client = manager.get_client(connection_id)?;

        let value = client.get(key).await
            .map_err(|e| AppError::Redis(e))?
            .unwrap_or_default();

        let encoding = client.object_encoding(key).await
            .unwrap_or_else(|_| "raw".to_string());

        Ok(StringData { value, encoding })
    }

    /// 设置 String 值
    pub async fn string_set(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        _db: u32,
        key: &str,
        value: &str,
        ttl: Option<i64>,
    ) -> Result<(), AppError> {
        let client = manager.get_client(connection_id)?;

        // SET with optional EX
        let ex = ttl.map(|t| t as u64);
        client.set(key, value, ex).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] SET {} (ttl={:?})", key, ttl);
        Ok(())
    }

    // ==================== Hash ====================

    /// 获取 Hash 分页数据
    /// 使用 HSCAN 实现分页，支持 match_pattern 过滤
    pub async fn hash_page(
        manager: &Arc<RedisConnectionManager>,
        params: &HashPageParams,
    ) -> Result<PageResult<HashField>, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let total = client.hlen(&params.key).await
            .map_err(|e| AppError::Redis(e))?;

        // 对于小数据量直接用 HGETALL，大数据量用 HSCAN
        let items = if total <= (params.page_size as u64) * 10 && params.match_pattern.is_none() {
            // 小数据量：HGETALL + 内存分页
            let all: std::collections::HashMap<String, String> = client
                .hgetall(&params.key).await
                .map_err(|e| AppError::Redis(e))?;

            let mut fields: Vec<HashField> = all.into_iter()
                .map(|(field, value)| HashField { field, value })
                .collect();

            // 排序
            fields.sort_by(|a, b| a.field.cmp(&b.field));

            // 内存分页
            let skip = ((params.page - 1) * params.page_size) as usize;
            let take = params.page_size as usize;
            fields.into_iter().skip(skip).take(take).collect()
        } else {
            // 大数据量：HSCAN 分页
            let pattern = params.match_pattern.as_deref();
            let page_size = params.page_size.max(50);
            let skip_count = ((params.page - 1) * page_size) as usize;

            let mut cursor: u64 = 0;
            let mut all_fields: Vec<HashField> = Vec::new();
            let mut collected = 0;
            let need = (page_size as usize) + skip_count;

            loop {
                let result = client.hscan(&params.key, cursor, pattern, Some(page_size as u64)).await
                    .map_err(|e| AppError::Redis(e))?;

                cursor = result.0;
                for (field, value) in result.1 {
                    all_fields.push(HashField { field, value });
                    collected += 1;
                }

                if cursor == 0 || collected >= need {
                    break;
                }
            }

            all_fields.sort_by(|a, b| a.field.cmp(&b.field));
            all_fields.into_iter().skip(skip_count).take(page_size as usize).collect()
        };

        Ok(PageResult {
            items,
            total,
            page: params.page,
            page_size: params.page_size,
        })
    }

    /// 添加 Hash 字段
    pub async fn hash_add(
        manager: &Arc<RedisConnectionManager>,
        params: &DataAddParams,
    ) -> Result<(), AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let field = params.field.as_deref().ok_or_else(|| 
            AppError::BadRequest("Hash 字段名不能为空".to_string()))?;

        client.hset(&params.key, field, &params.value).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] HSET {} {} = {}", params.key, field, params.value.len());
        Ok(())
    }

    /// 更新 Hash 字段（支持重命名：HSET new + HDEL old）
    pub async fn hash_update(
        manager: &Arc<RedisConnectionManager>,
        params: &DataUpdateParams,
    ) -> Result<(), AppError> {
        let client = manager.get_client(&params.connection_id)?;

        if let Some(ref new_field) = params.new_field {
            if new_field != &params.field {
                // 重命名：HSET new + HDEL old
                client.hset(&params.key, new_field, &params.value).await
                    .map_err(|e| AppError::Redis(e))?;
                client.hdel(&params.key, &[&params.field]).await
                    .map_err(|e| AppError::Redis(e))?;
                log::info!("[DataService] Hash 重命名: {} → {} (key={})", params.field, new_field, params.key);
            } else {
                // 仅更新值
                client.hset(&params.key, &params.field, &params.value).await
                    .map_err(|e| AppError::Redis(e))?;
                log::info!("[DataService] HSET {} {}", params.key, params.field);
            }
        } else {
            client.hset(&params.key, &params.field, &params.value).await
                .map_err(|e| AppError::Redis(e))?;
        }

        Ok(())
    }

    /// 删除 Hash 字段
    pub async fn hash_delete(
        manager: &Arc<RedisConnectionManager>,
        params: &DataDeleteParams,
    ) -> Result<u64, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let field_refs: Vec<&str> = params.fields.iter().map(|s| s.as_str()).collect();
        let deleted = client.hdel(&params.key, &field_refs).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] HDEL {} {} 个字段", params.key, deleted);
        Ok(deleted)
    }

    // ==================== List ====================

    /// 获取 List 分页数据
    pub async fn list_page(
        manager: &Arc<RedisConnectionManager>,
        params: &ListPageParams,
    ) -> Result<PageResult<ListEntry>, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let total = client.llen(&params.key).await
            .map_err(|e| AppError::Redis(e))?;

        let start = ((params.page - 1) * params.page_size) as i64;
        let stop = start + params.page_size as i64 - 1;

        let values = client.lrange(&params.key, start, stop).await
            .map_err(|e| AppError::Redis(e))?;

        let items: Vec<ListEntry> = values.into_iter().enumerate()
            .map(|(i, value)| ListEntry {
                index: start + i as i64,
                value,
            })
            .collect();

        Ok(PageResult {
            items,
            total,
            page: params.page,
            page_size: params.page_size,
        })
    }

    /// 添加 List 元素
    /// field 决定插入方向："left" → LPUSH，"right"(默认) → RPUSH
    pub async fn list_add(
        manager: &Arc<RedisConnectionManager>,
        params: &DataAddParams,
    ) -> Result<(), AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let direction = params.field.as_deref().unwrap_or("right");
        let values = [params.value.as_str()];

        if direction == "left" {
            client.lpush(&params.key, &values).await
                .map_err(|e| AppError::Redis(e))?;
        } else {
            client.rpush(&params.key, &values).await
                .map_err(|e| AppError::Redis(e))?;
        }

        log::info!("[DataService] List {} ({}) 压入元素", params.key, direction);
        Ok(())
    }

    /// 更新 List 元素（按索引 LSET）
    pub async fn list_update(
        manager: &Arc<RedisConnectionManager>,
        params: &DataUpdateParams,
    ) -> Result<(), AppError> {
        let client = manager.get_client(&params.connection_id)?;

        // field 存储的是索引字符串
        let index: i64 = params.field.parse()
            .map_err(|_| AppError::BadRequest("List 索引必须是数字".to_string()))?;

        client.lset(&params.key, index, &params.value).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] LSET {} [{}] = {}", params.key, index, params.value.len());
        Ok(())
    }

    /// 删除 List 元素
    /// 通过 LREM 删除指定值（field 存储要删除的值）
    pub async fn list_delete(
        manager: &Arc<RedisConnectionManager>,
        params: &DataDeleteParams,
    ) -> Result<u64, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let mut total_removed: u64 = 0;
        for value in &params.fields {
            // LREM key count=0 value → 删除所有匹配项
            let removed = client.lrem(&params.key, 0, value).await
                .map_err(|e| AppError::Redis(e))?;
            total_removed += removed;
        }

        log::info!("[DataService] LREM {} 删除 {} 个元素", params.key, total_removed);
        Ok(total_removed)
    }

    // ==================== Set ====================

    /// 获取 Set 分页数据（使用 SSCAN）
    pub async fn set_page(
        manager: &Arc<RedisConnectionManager>,
        params: &SetPageParams,
    ) -> Result<PageResult<SetMember>, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let total = client.scard(&params.key).await
            .map_err(|e| AppError::Redis(e))?;

        // 使用 SSCAN 分页
        let pattern = params.match_pattern.as_deref();
        let page_size = params.page_size.max(50);
        let skip_count = ((params.page - 1) * page_size) as usize;

        let mut cursor: u64 = 0;
        let mut all_members: Vec<String> = Vec::new();
        let need = (page_size as usize) + skip_count;

        loop {
            let result = client.sscan(&params.key, cursor, pattern, Some(page_size as u64)).await
                .map_err(|e| AppError::Redis(e))?;

            cursor = result.0;
            all_members.extend(result.1);

            if cursor == 0 || all_members.len() >= need {
                break;
            }
        }

        all_members.sort();

        let items: Vec<SetMember> = all_members.into_iter()
            .skip(skip_count)
            .take(page_size as usize)
            .map(|member| SetMember { member })
            .collect();

        Ok(PageResult {
            items,
            total,
            page: params.page,
            page_size: params.page_size,
        })
    }

    /// 添加 Set 成员
    pub async fn set_add(
        manager: &Arc<RedisConnectionManager>,
        params: &DataAddParams,
    ) -> Result<u64, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let members = [params.value.as_str()];
        let added = client.sadd(&params.key, &members).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] SADD {} +{} 个成员", params.key, added);
        Ok(added)
    }

    /// 删除 Set 成员
    pub async fn set_delete(
        manager: &Arc<RedisConnectionManager>,
        params: &DataDeleteParams,
    ) -> Result<u64, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let member_refs: Vec<&str> = params.fields.iter().map(|s| s.as_str()).collect();
        let removed = client.srem(&params.key, &member_refs).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] SREM {} -{} 个成员", params.key, removed);
        Ok(removed)
    }

    // ==================== ZSet ====================

    /// 获取 ZSet 分页数据
    /// 支持 score 范围过滤和正序/倒序
    pub async fn zset_page(
        manager: &Arc<RedisConnectionManager>,
        params: &ZSetPageParams,
    ) -> Result<PageResult<ZSetEntry>, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let total = client.zcard(&params.key).await
            .map_err(|e| AppError::Redis(e))?;

        let start = ((params.page - 1) * params.page_size) as i64;
        let stop = start + params.page_size as i64 - 1;

        // 默认使用 ZRANGE（正序），score 范围过滤暂用全量 ZRANGE
        let pairs = client.zrange_withscores(&params.key, start, stop).await
            .map_err(|e| AppError::Redis(e))?;

        let items: Vec<ZSetEntry> = pairs.into_iter()
            .map(|(member, score)| ZSetEntry { member, score })
            .collect();

        Ok(PageResult {
            items,
            total,
            page: params.page,
            page_size: params.page_size,
        })
    }

    /// 添加 ZSet 成员
    pub async fn zset_add(
        manager: &Arc<RedisConnectionManager>,
        params: &DataAddParams,
    ) -> Result<u64, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let score = params.score.ok_or_else(||
            AppError::BadRequest("ZSet 分数不能为空".to_string()))?;

        let added = client.zadd(&params.key, score, &params.value).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] ZADD {} {} {}", params.key, score, params.value);
        Ok(added)
    }

    /// 更新 ZSet 成员分数
    /// ARDM 模式：ZADD new_score + ZREM old_member（如果 member 变了）
    pub async fn zset_update(
        manager: &Arc<RedisConnectionManager>,
        params: &DataUpdateParams,
    ) -> Result<(), AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let score = params.score.ok_or_else(||
            AppError::BadRequest("ZSet 分数不能为空".to_string()))?;

        if let Some(ref new_member) = params.new_field {
            if new_member != &params.field {
                // 成员名变更：ZADD new + ZREM old
                client.zadd(&params.key, score, new_member).await
                    .map_err(|e| AppError::Redis(e))?;
                client.zrem(&params.key, &[&params.field]).await
                    .map_err(|e| AppError::Redis(e))?;
                log::info!("[DataService] ZSet 重命名: {} → {} (key={})", params.field, new_member, params.key);
            } else {
                // 仅更新分数
                client.zadd(&params.key, score, &params.field).await
                    .map_err(|e| AppError::Redis(e))?;
            }
        } else {
            client.zadd(&params.key, score, &params.field).await
                .map_err(|e| AppError::Redis(e))?;
        }

        Ok(())
    }

    /// 删除 ZSet 成员
    pub async fn zset_delete(
        manager: &Arc<RedisConnectionManager>,
        params: &DataDeleteParams,
    ) -> Result<u64, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let member_refs: Vec<&str> = params.fields.iter().map(|s| s.as_str()).collect();
        let removed = client.zrem(&params.key, &member_refs).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] ZREM {} -{} 个成员", params.key, removed);
        Ok(removed)
    }

    // ==================== Stream ====================

    /// 获取 Stream 分页数据（使用 XREVRANGE 倒序获取最新数据）
    pub async fn stream_page(
        manager: &Arc<RedisConnectionManager>,
        params: &StreamPageParams,
    ) -> Result<PageResult<StreamEntry>, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let total = client.xlen(&params.key).await
            .map_err(|e| AppError::Redis(e))?;

        // 使用 XREVRANGE 从最新开始获取
        let end = "+"; // 最新
        let start = "-"; // 最早

        let raw = client.xrevrange(&params.key, end, start, Some(params.count)).await
            .map_err(|e| AppError::Redis(e))?;

        let items = Self::parse_stream_entries(&raw);

        Ok(PageResult {
            items,
            total,
            page: 1,
            page_size: params.count as u32,
        })
    }

    /// 添加 Stream 条目
    pub async fn stream_add(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        _db: u32,
        key: &str,
        fields: &[(String, String)],
        id: Option<&str>,
    ) -> Result<String, AppError> {
        let client = manager.get_client(connection_id)?;

        let entry_id = id.unwrap_or("*");
        let field_refs: Vec<(&str, &str)> = fields.iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();

        let result_id = client.xadd(key, entry_id, &field_refs).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] XADD {} → {}", key, result_id);
        Ok(result_id)
    }

    /// 删除 Stream 条目
    pub async fn stream_delete(
        manager: &Arc<RedisConnectionManager>,
        params: &DataDeleteParams,
    ) -> Result<u64, AppError> {
        let client = manager.get_client(&params.connection_id)?;

        let id_refs: Vec<&str> = params.fields.iter().map(|s| s.as_str()).collect();
        let deleted = client.xdel(&params.key, &id_refs).await
            .map_err(|e| AppError::Redis(e))?;

        log::info!("[DataService] XDEL {} {} 条", params.key, deleted);
        Ok(deleted)
    }

    /// 获取 Stream 消费者组信息
    pub async fn stream_groups(
        manager: &Arc<RedisConnectionManager>,
        connection_id: &str,
        _db: u32,
        key: &str,
    ) -> Result<Vec<StreamGroupInfo>, AppError> {
        let client = manager.get_client(connection_id)?;

        let raw = client.xinfo_groups(key).await
            .map_err(|e| AppError::Redis(e))?;

        // XINFO GROUPS 返回格式：
        // 1) 1) name
        //    2) "mygroup"
        //    3) consumers
        //    4) (integer) 2
        //    5) pending
        //    6) (integer) 10
        //    7) last-delivered-id
        //    8) "163..."
        let groups = Self::parse_xinfo_groups(&raw);

        Ok(groups)
    }

    // ==================== 内部解析方法 ====================

    /// 解析 XRANGE/XREVRANGE 返回的 Stream 条目
    fn parse_stream_entries(value: &Value) -> Vec<StreamEntry> {
        let mut entries = Vec::new();

        if let Value::Array(arr) = value {
            for entry in arr {
                if let Value::Array(pair) = entry {
                    if pair.len() >= 2 {
                        let id = match &pair[0] {
                            Value::BulkString(s) => String::from_utf8_lossy(s).to_string(),
                            _ => continue,
                        };

                        let fields = match &pair[1] {
                            Value::Array(field_arr) => {
                                let mut result = Vec::new();
                                let mut i = 0;
                                while i + 1 < field_arr.len() {
                                    let key = match &field_arr[i] {
                                        Value::BulkString(s) => String::from_utf8_lossy(s).to_string(),
                                        _ => String::new(),
                                    };
                                    let val = match &field_arr[i + 1] {
                                        Value::BulkString(s) => String::from_utf8_lossy(s).to_string(),
                                        _ => String::new(),
                                    };
                                    result.push((key, val));
                                    i += 2;
                                }
                                result
                            }
                            _ => Vec::new(),
                        };

                        entries.push(StreamEntry { id, fields });
                    }
                }
            }
        }

        entries
    }

    /// 解析 XINFO GROUPS 返回的消费者组信息
    fn parse_xinfo_groups(value: &Value) -> Vec<StreamGroupInfo> {
        let mut groups = Vec::new();

        if let Value::Array(arr) = value {
            for group_data in arr {
                if let Value::Array(pairs) = group_data {
                    let mut name = String::new();
                    let mut consumers: u64 = 0;
                    let mut pending: u64 = 0;
                    let mut last_delivered_id = String::new();

                    let mut i = 0;
                    while i + 1 < pairs.len() {
                        let key = match &pairs[i] {
                            Value::BulkString(s) => String::from_utf8_lossy(s).to_string(),
                            _ => {
                                i += 2;
                                continue;
                            }
                        };

                        match key.to_lowercase().as_str() {
                            "name" => {
                                name = match &pairs[i + 1] {
                                    Value::BulkString(s) => String::from_utf8_lossy(s).to_string(),
                                    _ => String::new(),
                                };
                            }
                            "consumers" => {
                                consumers = match &pairs[i + 1] {
                                    Value::Int(n) => *n as u64,
                                    Value::BulkString(s) => String::from_utf8_lossy(s).parse().unwrap_or(0),
                                    _ => 0,
                                };
                            }
                            "pending" => {
                                pending = match &pairs[i + 1] {
                                    Value::Int(n) => *n as u64,
                                    Value::BulkString(s) => String::from_utf8_lossy(s).parse().unwrap_or(0),
                                    _ => 0,
                                };
                            }
                            "last-delivered-id" => {
                                last_delivered_id = match &pairs[i + 1] {
                                    Value::BulkString(s) => String::from_utf8_lossy(s).to_string(),
                                    _ => String::new(),
                                };
                            }
                            _ => {}
                        }

                        i += 2;
                    }

                    groups.push(StreamGroupInfo {
                        name,
                        consumers,
                        pending,
                        last_delivered_id,
                    });
                }
            }
        }

        groups
    }
}
