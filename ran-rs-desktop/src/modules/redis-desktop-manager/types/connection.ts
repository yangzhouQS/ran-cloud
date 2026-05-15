// modules/redis-desktop-manager/types/connection.ts
// 连接管理相关类型定义，与后端 models 保持一致

/** SSH 隧道配置 */
export interface SshTunnelConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

/** Sentinel 配置 */
export interface SentinelConfig {
  hosts: string[];
  masterName: string;
  password?: string;
}

/** TLS 配置 */
export interface TlsConfig {
  enabled: boolean;
  cert?: string;
  key?: string;
  ca?: string;
}

/** 连接配置 */
export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  password?: string;
  db: number;
  separator?: string;
  color?: string;
  sshTunnel?: SshTunnelConfig;
  sentinel?: SentinelConfig;
  cluster?: boolean;
  tls?: TlsConfig;
}

/** 连接信息（前端展示用） */
export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  db: number;
  status: ConnectionStatus;
  redisVersion?: string;
  totalKeys?: number;
  usedMemory?: number;
}

/** 连接状态 */
export enum ConnectionStatus {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Error = "error",
}

/** 创建连接请求参数 */
export interface CreateConnectionParams {
  config: ConnectionConfig;
}

/** 应用设置 */
export interface AppSettings {
  language: string;
  theme: string;
  fontSize: number;
  keySeparator: string;
  scanCount: number;
  pageSize: number;
  commandTimeoutSecs: number;
  connectionTimeoutSecs: number;
  autoRefreshKeys: boolean;
  autoRefreshIntervalMs: number;
  showCliSuggestions: boolean;
  maxCliHistory: number;
}
