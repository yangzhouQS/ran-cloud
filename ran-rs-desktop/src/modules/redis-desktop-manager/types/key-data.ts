// modules/redis-desktop-manager/types/key-data.ts
// Key 操作和数据类型相关类型定义

/** Key 扫描结果 */
export interface KeyScanResult {
  key: string;
  keyType: string;
  ttl: number;
  memoryUsage?: number;
}

/** Key 详情 */
export interface KeyDetail {
  key: string;
  keyType: string;
  ttl: number;
  memoryUsage?: number;
  encoding: string;
  length: number;
}

/** Key 扫描参数 */
export interface KeyScanParams {
  connectionId: string;
  db: number;
  pattern?: string;
  count?: number;
  cursor?: number;
}

// ==================== 数据类型 ====================

/** Hash 字段 */
export interface HashField {
  field: string;
  value: string;
}

/** List 条目 */
export interface ListEntry {
  index: number;
  value: string;
}

/** Set 成员 */
export interface SetMember {
  member: string;
}

/** ZSet 条目 */
export interface ZSetEntry {
  member: string;
  score: number;
}

/** Stream 条目 */
export interface StreamEntry {
  id: string;
  fields: [string, string][];
}

/** 分页结果 */
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 通用数据操作参数 */
export interface DataParams {
  connectionId: string;
  db: number;
  key: string;
  field?: string;
  value: string;
  score?: number;
  fields?: string[];
}

// ==================== 数据 CRUD 参数 ====================

/** 数据添加参数 */
export interface DataAddParams {
  connectionId: string;
  db: number;
  key: string;
  field?: string;
  value: string;
  score?: number;
  position?: "left" | "right";
  /** List 插入位置（BEFORE/AFTER） */
  insertPosition?: "BEFORE" | "AFTER";
  /** List 插入参考值 */
  pivot?: string;
}

/** 数据更新参数 */
export interface DataUpdateParams {
  connectionId: string;
  db: number;
  key: string;
  field: string;
  value: string;
  /** Hash 更新时的旧字段名（用于重命名） */
  oldField?: string;
  /** List 更新时的索引 */
  index?: number;
  /** ZSet 更新时的分数 */
  score?: number;
}

/** 数据删除参数 */
export interface DataDeleteParams {
  connectionId: string;
  db: number;
  key: string;
  /** Hash 字段名 / Set 成员 / ZSet 成员 */
  field?: string;
  /** 多个字段名 */
  fields?: string[];
  /** List 删除值 */
  value?: string;
  /** List 删除数量 */
  count?: number;
  /** Stream entry ID */
  ids?: string[];
}

/** Hash 分页参数 */
export interface HashPageParams {
  connectionId: string;
  db: number;
  key: string;
  page: number;
  pageSize: number;
  pattern?: string;
}

/** List 分页参数 */
export interface ListPageParams {
  connectionId: string;
  db: number;
  key: string;
  page: number;
  pageSize: number;
}

/** Set 分页参数 */
export interface SetPageParams {
  connectionId: string;
  db: number;
  key: string;
  page: number;
  pageSize: number;
  pattern?: string;
}

/** ZSet 分页参数 */
export interface ZSetPageParams {
  connectionId: string;
  db: number;
  key: string;
  page: number;
  pageSize: number;
  /** 是否倒序 */
  reverse?: boolean;
  /** 最小分数 */
  min?: number;
  /** 最大分数 */
  max?: number;
}

/** Stream 分页参数 */
export interface StreamPageParams {
  connectionId: string;
  db: number;
  key: string;
  page: number;
  pageSize: number;
  /** 起始 ID */
  startId?: string;
  /** 结束 ID */
  endId?: string;
}

/** Stream 消费者组信息 */
export interface StreamGroupInfo {
  name: string;
  consumers: number;
  pending: number;
  lastDeliveredId: string;
}

/** String 数据 */
export interface StringData {
  value: string;
  length: number;
  encoding: string;
}

// ==================== CLI ====================

/** CLI 执行结果 */
export interface CliExecResult {
  command: string;
  result: string;
  resultType: string;
  durationMs: number;
}

// ==================== 工具 ====================

/** 慢日志条目 */
export interface SlowLogEntry {
  id: number;
  timestamp: number;
  durationUs: number;
  command: string[];
  clientAddress: string;
  clientName: string;
}

/** 服务器状态 */
export interface ServerStatus {
  redisVersion: string;
  mode: string;
  uptimeDays: number;
  connectedClients: number;
  usedMemory: number;
  usedMemoryPeak: number;
  totalKeys: number;
  expiredKeys: number;
  instantaneousOpsPerSec: number;
  totalNetInputBytes: number;
  totalNetOutputBytes: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number;
}

/** 数据库信息（INFO KEYSPACE 解析结果） */
export interface DatabaseInfo {
  db: number;
  keys: number;
  expires: number;
  avgTtl: number;
}

/** 内存分析条目 */
export interface MemoryAnalysisEntry {
  key: string;
  keyType: string;
  memoryUsage: number;
  encoding: string;
  length: number;
}

/** 内存分析结果 */
export interface MemoryAnalysisResult {
  entries: MemoryAnalysisEntry[];
  totalKeys: number;
  analyzedKeys: number;
  totalMemory: number;
  durationMs: number;
}

/** CLI 命令信息（自动补全用） */
export interface CliCommandInfo {
  name: string;
  group: string;
  syntax: string;
  since: string;
}
