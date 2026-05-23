/**
 * SQL Studio 类型定义 — 数据库连接
 */

/** 支持的数据库类型 */
export type DatabaseType = 'postgresql' | 'mysql' | 'mariadb' | 'tidb' | 'sqlite';

/** 数据库类型选项（用于下拉选择） */
export const DATABASE_TYPE_OPTIONS: { label: string; value: DatabaseType; defaultPort?: number }[] = [
  { label: 'PostgreSQL', value: 'postgresql', defaultPort: 5432 },
  { label: 'MySQL', value: 'mysql', defaultPort: 3306 },
  { label: 'MariaDB', value: 'mariadb', defaultPort: 3306 },
  { label: 'TiDB', value: 'tidb', defaultPort: 4000 },
  { label: 'SQLite', value: 'sqlite' },
];

/** SSL 配置 */
export interface SslConfig {
  enabled: boolean;
  caFile?: string;
  certFile?: string;
  keyFile?: string;
  rejectUnauthorized: boolean;
}

/** SSH 隧道配置 */
export interface SshTunnelConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  bastionHost?: string;
  bastionPort?: number;
}

/** 数据库连接配置 */
export interface ConnectionConfig {
  id: string;
  name: string;
  dbType: DatabaseType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  url?: string;
  ssl: SslConfig;
  ssh: SshTunnelConfig;
  options?: Record<string, unknown>;
}

/** 连接信息（返回给前端） */
export interface ConnectionInfo {
  id: string;
  name: string;
  dbType: DatabaseType;
  status: 'connected' | 'disconnected';
  host?: string;
  port?: number;
  database?: string;
}

/** 创建默认连接配置 */
export function createDefaultConfig(dbType: DatabaseType): ConnectionConfig {
  const opt = DATABASE_TYPE_OPTIONS.find(o => o.value === dbType);
  return {
    id: crypto.randomUUID(),
    name: '',
    dbType,
    host: dbType === 'sqlite' ? undefined : 'localhost',
    port: opt?.defaultPort,
    user: dbType === 'sqlite' ? undefined : 'root',
    password: undefined,
    database: undefined,
    ssl: { enabled: false, rejectUnauthorized: false },
    ssh: { enabled: false, host: '', port: 22, user: 'root' },
  };
}
