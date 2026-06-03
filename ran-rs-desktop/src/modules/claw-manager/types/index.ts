// modules/claw-manager/types/index.ts
// Claw Manager 类型定义统一导出

/** 网关运行状态 */
export type GatewayStatus = "running" | "stopped" | "error";

/** 命令执行结果 */
export interface CommandResult {
  success: boolean;
  output: string;
  timestamp: string;
}

/** 命令日志条目 */
export interface CommandLogEntry {
  cmd: string;
  output: string;
  time: string;
  success: boolean;
  /** 可选的可点击 URL（如 Dashboard 地址） */
  url?: string;
}
