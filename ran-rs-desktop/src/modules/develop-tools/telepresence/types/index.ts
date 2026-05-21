/** Telepresence 连接参数 */
export interface ConnectParams {
  kubeconfig: string;
  namespace: string;
  skipTlsVerify: boolean;
}

/** Telepresence 操作结果 */
export interface TelepresenceResult {
  success: boolean;
  message: string;
}

/** 操作日志条目 */
export interface LogEntry {
  timestamp: string;
  type: "info" | "success" | "error" | "command";
  message: string;
}
