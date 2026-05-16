// modules/redis-desktop-manager/types/connection.ts
// 连接管理相关类型定义，与后端 Rust models.rs 保持一致
// Rust 使用 #[serde(rename_all = "camelCase")] 自动转换

/** SSH 隧道配置 — 对应 Rust SshTunnelConfig */
export interface SshTunnelConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  timeout: number;
}

/** Sentinel 配置 — 对应 Rust SentinelConfig */
export interface SentinelConfig {
  nodes: string[];
  masterName: string;
  password?: string;
  username?: string;
  nodePassword?: string;
}

/** TLS 配置 — 对应 Rust TlsConfig */
export interface TlsConfig {
  verifyCert: boolean;
  caCertPath?: string;
  certPath?: string;
  keyPath?: string;
  sni?: string;
}

/** NAT 映射条目 — 对应 Rust NatMapEntry */
export interface NatMapEntry {
  host: string;
  port: number;
}

/** 连接配置 — 对应 Rust ConnectionConfig */
export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  connectionTimeout: number;
  commandTimeout: number;
  sshTunnel?: SshTunnelConfig;
  sentinel?: SentinelConfig;
  cluster: boolean;
  tls?: TlsConfig;
  /** NAT 地址映射 — key 为 "内部Host:内部Port"，value 为外部可达地址 */
  natMap?: Record<string, NatMapEntry>;
  color?: string;
  separator: string;
  remark?: string;
  readonly: boolean;
  sortOrder?: number;
}

/** 连接信息（前端展示用） — 对应 Rust ConnectionInfo */
export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  db: number;
  status: string;
  cluster: boolean;
  hasSentinel: boolean;
  hasSshTunnel: boolean;
  hasTls: boolean;
  readonly: boolean;
  color?: string;
  separator: string;
}

/** 连接状态（前端本地状态管理用） */
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
