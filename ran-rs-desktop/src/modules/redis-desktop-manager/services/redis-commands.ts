// modules/redis-desktop-manager/services/redis-commands.ts
// Tauri invoke 命令封装层
// 封装所有 Redis Desktop 后端 Tauri 命令调用

import type {
  AppSettings,
  CliCommandInfo,
  CliExecResult,
  ConnectionConfig,
  DataAddParams,
  DatabaseInfo,
  DataDeleteParams,
  DataUpdateParams,
  HashField,
  HashPageParams,
  KeyDetail,
  KeyScanParams,
  KeyScanResult,
  ListEntry,
  ListPageParams,
  MemoryAnalysisResult,
  PageResult,
  ServerStatus,
  SetMember,
  SetPageParams,
  SlowLogEntry,
  StreamEntry,
  StreamGroupInfo,
  StreamPageParams,
  StringData,
  ZSetEntry,
  ZSetPageParams,
} from "../types";
import { invoke } from "@tauri-apps/api/core";

// 直接命令注册模式 — 命令通过 invoke_handler 直接注册，无需 plugin 前缀

// ==================== 连接管理 ====================

/** 创建连接 */
export function redisConnectionCreate(config: ConnectionConfig): Promise<void> {
  return invoke("redis_connection_create", { config });
}

/** 关闭连接 */
export function redisConnectionClose(connectionId: string): Promise<void> {
  return invoke("redis_connection_close", { connectionId });
}

/** 关闭所有连接 */
export function redisConnectionCloseAll(): Promise<void> {
  return invoke("redis_connection_close_all");
}

/** 获取连接状态 */
export function redisConnectionStatus(connectionId: string): Promise<string> {
  return invoke("redis_connection_status", { connectionId });
}

/** 获取活跃连接列表 */
export function redisConnectionList(): Promise<string[]> {
  return invoke("redis_connection_list");
}

/** Ping 连接 */
export function redisConnectionPing(connectionId: string): Promise<string> {
  return invoke("redis_connection_ping", { connectionId });
}

// ==================== 存储 ====================

/** 加载连接列表 */
export function redisStorageLoadConnections(): Promise<ConnectionConfig[]> {
  return invoke("redis_storage_load_connections");
}

/** 保存连接列表 */
export function redisStorageSaveConnections(connections: ConnectionConfig[]): Promise<void> {
  return invoke("redis_storage_save_connections", { connections });
}

/** 保存单个连接 */
export function redisStorageSaveConnection(connection: ConnectionConfig): Promise<void> {
  return invoke("redis_storage_save_connection", { config: connection });
}

/** 删除连接 */
export function redisStorageDeleteConnection(id: string): Promise<void> {
  return invoke("redis_storage_delete_connection", { connectionId: id });
}

/** 加载设置 */
export function redisStorageLoadSettings(): Promise<AppSettings> {
  return invoke("redis_storage_load_settings");
}

/** 保存设置 */
export function redisStorageSaveSettings(settings: AppSettings): Promise<void> {
  return invoke("redis_storage_save_settings", { settings });
}

/** 加载 CLI 历史 */
export function redisStorageLoadCliHistory(): Promise<string[]> {
  return invoke("redis_storage_load_cli_history");
}

/** 保存 CLI 历史 */
export function redisStorageSaveCliHistory(history: string[]): Promise<void> {
  return invoke("redis_storage_save_cli_history", { history });
}

// ==================== Key 操作 ====================

/** 扫描 Key（一次性） */
export function redisKeyScan(params: KeyScanParams): Promise<KeyScanResult[]> {
  return invoke("redis_key_scan", { params });
}

/** 启动流式 SCAN（后端通过 Tauri Event 推送进度） */
export function redisKeyScanStart(
  connectionId: string,
  db: number,
  scanId: string,
  pattern?: string,
  count?: number,
): Promise<void> {
  return invoke("redis_key_scan_start", {
    params: { connectionId, db, scanId, pattern, count },
  });
}

/** 取消流式 SCAN */
export function redisKeyScanCancel(scanId: string): Promise<void> {
  return invoke("redis_key_scan_cancel", { params: { scanId } });
}

/** 获取 Key 详情 */
export function redisKeyDetail(connectionId: string, db: number, key: string): Promise<KeyDetail> {
  return invoke("redis_key_detail", { connectionId, db, key });
}

/** 删除 Key */
export function redisKeyDelete(connectionId: string, db: number, keys: string[]): Promise<number> {
  return invoke("redis_key_delete", { connectionId, db, keys });
}

/** 重命名 Key */
export function redisKeyRename(connectionId: string, db: number, oldKey: string, newKey: string): Promise<void> {
  return invoke("redis_key_rename", { connectionId, db, oldKey, newKey });
}

/** 设置过期时间 */
export function redisKeyExpire(connectionId: string, db: number, key: string, seconds: number): Promise<void> {
  return invoke("redis_key_expire", { connectionId, db, key, seconds });
}

// ==================== 数据操作 ====================

/** String: 获取值 */
export function redisDataStringGet(connectionId: string, db: number, key: string): Promise<StringData> {
  return invoke("redis_data_string_get", { connectionId, db, key });
}

/** String: 设置值 */
export function redisDataStringSet(connectionId: string, db: number, key: string, value: string, ttl?: number): Promise<void> {
  return invoke("redis_data_string_set", { connectionId, db, key, value, ttl });
}

/** Hash: 分页查询 */
export function redisDataHashPage(params: HashPageParams): Promise<PageResult<HashField>> {
  return invoke("redis_data_hash_page", { params });
}

/** Hash: 添加字段 */
export function redisDataHashAdd(params: DataAddParams): Promise<void> {
  return invoke("redis_data_hash_add", { params });
}

/** Hash: 更新字段 */
export function redisDataHashUpdate(params: DataUpdateParams): Promise<void> {
  return invoke("redis_data_hash_update", { params });
}

/** Hash: 删除字段 */
export function redisDataHashDelete(params: DataDeleteParams): Promise<number> {
  return invoke("redis_data_hash_delete", { params });
}

/** List: 分页查询 */
export function redisDataListPage(params: ListPageParams): Promise<PageResult<ListEntry>> {
  return invoke("redis_data_list_page", { params });
}

/** List: 添加元素 */
export function redisDataListAdd(params: DataAddParams): Promise<void> {
  return invoke("redis_data_list_add", { params });
}

/** List: 更新元素 */
export function redisDataListUpdate(params: DataUpdateParams): Promise<void> {
  return invoke("redis_data_list_update", { params });
}

/** List: 删除元素 */
export function redisDataListDelete(params: DataDeleteParams): Promise<number> {
  return invoke("redis_data_list_delete", { params });
}

/** Set: 分页查询 */
export function redisDataSetPage(params: SetPageParams): Promise<PageResult<SetMember>> {
  return invoke("redis_data_set_page", { params });
}

/** Set: 添加成员 */
export function redisDataSetAdd(params: DataAddParams): Promise<number> {
  return invoke("redis_data_set_add", { params });
}

/** Set: 删除成员 */
export function redisDataSetDelete(params: DataDeleteParams): Promise<number> {
  return invoke("redis_data_set_delete", { params });
}

/** ZSet: 分页查询 */
export function redisDataZsetPage(params: ZSetPageParams): Promise<PageResult<ZSetEntry>> {
  return invoke("redis_data_zset_page", { params });
}

/** ZSet: 添加成员 */
export function redisDataZsetAdd(params: DataAddParams): Promise<number> {
  return invoke("redis_data_zset_add", { params });
}

/** ZSet: 更新成员分数 */
export function redisDataZsetUpdate(params: DataUpdateParams): Promise<void> {
  return invoke("redis_data_zset_update", { params });
}

/** ZSet: 删除成员 */
export function redisDataZsetDelete(params: DataDeleteParams): Promise<number> {
  return invoke("redis_data_zset_delete", { params });
}

/** Stream: 分页查询 */
export function redisDataStreamPage(params: StreamPageParams): Promise<PageResult<StreamEntry>> {
  return invoke("redis_data_stream_page", { params });
}

/** Stream: 添加条目 */
export function redisDataStreamAdd(
  connectionId: string,
  db: number,
  key: string,
  fields: [string, string][],
  id?: string,
): Promise<string> {
  return invoke("redis_data_stream_add", { connectionId, db, key, fields, id });
}

/** Stream: 删除条目 */
export function redisDataStreamDelete(params: DataDeleteParams): Promise<number> {
  return invoke("redis_data_stream_delete", { params });
}

/** Stream: 获取消费者组信息 */
export function redisDataStreamGroups(connectionId: string, db: number, key: string): Promise<StreamGroupInfo[]> {
  return invoke("redis_data_stream_groups", { connectionId, db, key });
}

// ==================== CLI ====================

/** 执行 CLI 命令 */
export function redisCliExec(connectionId: string, db: number, command: string): Promise<CliExecResult> {
  return invoke("redis_cli_exec", { params: { connectionId, db, command } });
}

/** 命令自动补全 */
export function redisCliComplete(connectionId: string, input: string): Promise<string[]> {
  return invoke("redis_cli_complete", { connectionId, input });
}

/** 获取命令语法 */
export function redisCliSyntax(commandName: string): Promise<string | null> {
  return invoke("redis_cli_syntax", { commandName });
}

/** 获取所有命令列表 */
export function redisCliCommands(): Promise<CliCommandInfo[]> {
  return invoke("redis_cli_commands");
}

/** 按分组获取命令列表 */
export function redisCliCommandsByGroup(): Promise<Record<string, CliCommandInfo[]>> {
  return invoke("redis_cli_commands_by_group");
}

// ==================== 工具 ====================

/** 获取慢日志 */
export function redisToolSlowLog(connectionId: string, db: number, count: number): Promise<SlowLogEntry[]> {
  return invoke("redis_tool_slow_log", { connectionId, db, count });
}

/** 获取服务器状态 */
export function redisToolServerStatus(connectionId: string): Promise<ServerStatus> {
  return invoke("redis_tool_server_status", { connectionId });
}

/** 初始化命令日志（设置 AppHandle） */
export function redisToolCommandLogInit(): Promise<void> {
  return invoke("redis_tool_command_log_init");
}

/** 获取命令日志列表 */
export function redisToolCommandLogList(connectionId: string, limit?: number): Promise<Array<{
  id: string;
  connectionId: string;
  db: number;
  command: string;
  args: string[];
  durationMs: number;
  success: boolean;
  error: string;
  timestamp: number;
}>> {
  return invoke("redis_tool_command_log_list", { params: { connectionId, limit } });
}

/** 清除指定连接的命令日志 */
export function redisToolCommandLogClear(connectionId: string): Promise<void> {
  return invoke("redis_tool_command_log_clear", { connectionId });
}

/** 清除所有命令日志 */
export function redisToolCommandLogClearAll(): Promise<void> {
  return invoke("redis_tool_command_log_clear_all");
}

/** 获取服务器信息（分节） */
export function redisToolServerInfo(
  connectionId: string,
  section?: string,
): Promise<{ sections: Record<string, Record<string, string>> }> {
  return invoke("redis_tool_server_info", { connectionId, section });
}

/** 获取数据库列表 */
export function redisToolDatabaseList(connectionId: string): Promise<DatabaseInfo[]> {
  return invoke("redis_tool_database_list", { connectionId });
}

/** 内存分析 */
export function redisToolMemoryAnalysis(
  connectionId: string,
  db: number,
  pattern?: string,
  count?: number,
): Promise<MemoryAnalysisResult> {
  return invoke("redis_tool_memory_analysis", { connectionId, db, pattern, count });
}

/** 获取客户端列表 */
export function redisToolClientList(connectionId: string): Promise<Record<string, string>[]> {
  return invoke("redis_tool_client_list", { connectionId });
}

/** 清空当前数据库 */
export function redisToolFlushDb(connectionId: string, db: number): Promise<void> {
  return invoke("redis_tool_flush_db", { connectionId, db });
}

/** 清空所有数据库 */
export function redisToolFlushAll(connectionId: string): Promise<void> {
  return invoke("redis_tool_flush_all", { connectionId });
}
