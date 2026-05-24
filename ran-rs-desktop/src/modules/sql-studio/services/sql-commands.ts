/**
 * SQL Studio 服务层 — 封装 Tauri 命令调用
 */

import type { ConnectionConfig, ConnectionInfo } from "../types/connection";
import type { QueryHistory, QueryRequest, QueryResult } from "../types/query";
import { invoke } from "@tauri-apps/api/core";

/** 创建连接（保存配置并连接） */
export async function createConnection(config: ConnectionConfig): Promise<string> {
  return invoke<string>("sql_connection_create", { config });
}

/** 断开连接 */
export async function closeConnection(id: string): Promise<void> {
  return invoke("sql_connection_close", { id });
}

/** 断开所有连接 */
export async function closeAllConnections(): Promise<void> {
  return invoke("sql_connection_close_all");
}

/** 获取连接列表 */
export async function listConnections(): Promise<ConnectionInfo[]> {
  return invoke<ConnectionInfo[]>("sql_connection_list");
}

/** 测试连接 */
export async function testConnection(config: ConnectionConfig): Promise<boolean> {
  return invoke<boolean>("sql_connection_test", { config });
}

/** 保存连接配置 */
export async function saveConnection(config: ConnectionConfig): Promise<void> {
  return invoke("sql_connection_save", { config });
}

/** 删除连接配置 */
export async function deleteConnection(id: string): Promise<void> {
  return invoke("sql_connection_delete", { id });
}

/** 执行查询 */
export async function executeQuery(request: QueryRequest): Promise<QueryResult> {
  return invoke<QueryResult>("sql_query_execute", { request });
}

/** 加载保存的连接配置（完整配置，含密码等） */
export async function loadSavedConnections(): Promise<ConnectionConfig[]> {
  return invoke<ConnectionConfig[]>("sql_storage_load_connections");
}

/** 保存查询历史 */
export async function saveQueryHistory(history: QueryHistory): Promise<void> {
  return invoke("sql_storage_save_query_history", { history });
}

/** 加载查询历史 */
export async function loadQueryHistory(connectionId: string, limit?: number): Promise<QueryHistory[]> {
  return invoke<QueryHistory[]>("sql_storage_load_query_history", { connectionId, limit });
}

// ==================== 数据库对象树命令 ====================

/** 数据库/Schema 信息 */
export interface DatabaseInfo {
  name: string;
  kind: "database" | "schema" | "main";
}

/** 表信息 */
export interface TableInfo {
  name: string;
  schema: string | null;
  tableType: string;
  rowCount: number | null;
  comment: string | null;
}

/** 列信息 */
export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  comment: string | null;
}

/** 获取数据库/Schema 列表 */
export async function getDatabaseList(connectionId: string): Promise<DatabaseInfo[]> {
  return invoke<DatabaseInfo[]>("sql_database_list", { connectionId });
}

/** 获取数据库对象树 */
export async function getDatabaseTree(connectionId: string, schema?: string): Promise<TableInfo[]> {
  return invoke<TableInfo[]>("sql_database_tree", { connectionId, schema: schema ?? null });
}

/** 获取表列信息 */
export async function getTableColumns(connectionId: string, table: string, schema?: string): Promise<ColumnInfo[]> {
  return invoke<ColumnInfo[]>("sql_table_columns", { connectionId, table, schema: schema ?? null });
}

/** 获取数据库版本 */
export async function getDatabaseVersion(connectionId: string): Promise<string> {
  return invoke<string>("sql_database_version", { connectionId });
}

// ==================== SQL 草稿持久化命令 ====================

/** 保存 SQL 草稿 */
export async function saveDraftSql(connectionId: string, sql: string): Promise<void> {
  return invoke("sql_storage_save_draft", { connectionId, sql });
}

/** 加载 SQL 草稿 */
export async function loadDraftSql(connectionId: string): Promise<string | null> {
  return invoke<string | null>("sql_storage_load_draft", { connectionId });
}

/** 删除 SQL 草稿 */
export async function deleteDraftSql(connectionId: string): Promise<void> {
  return invoke("sql_storage_delete_draft", { connectionId });
}
