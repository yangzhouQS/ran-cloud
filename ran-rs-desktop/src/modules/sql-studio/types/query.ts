/**
 * SQL Studio 类型定义 — 查询
 */

/** 查询请求 */
export interface QueryRequest {
  connectionId: string;
  sql: string;
  database?: string;
  limit?: number;
}

/** 查询结果列 */
export interface ResultColumn {
  name: string;
  dataType?: string;
}

/** 查询结果 */
export interface QueryResult {
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  affectedRows?: number;
  executionTimeMs: number;
}

/** 查询历史 */
export interface QueryHistory {
  id: string;
  connectionId: string;
  database?: string;
  sql: string;
  executedAt: string;
  executionTimeMs?: number;
  rowCount?: number;
}
