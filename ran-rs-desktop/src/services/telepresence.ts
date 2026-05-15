import { invoke } from "@tauri-apps/api/core";

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

/**
 * 连接 Telepresence 到 Kubernetes 集群
 */
export async function connectTelepresence(
  params: ConnectParams,
): Promise<TelepresenceResult> {
  try {
    const result = await invoke<string>("telepresence_connect", {
      kubeconfig: params.kubeconfig,
      namespace: params.namespace,
      skipTlsVerify: params.skipTlsVerify,
    });
    return { success: true, message: result };
  } catch (error) {
    return {
      success: false,
      message: typeof error === "string" ? error : String(error),
    };
  }
}

/**
 * 断开 Telepresence 连接
 */
export async function quitTelepresence(): Promise<TelepresenceResult> {
  try {
    const result = await invoke<string>("telepresence_quit");
    return { success: true, message: result };
  } catch (error) {
    return {
      success: false,
      message: typeof error === "string" ? error : String(error),
    };
  }
}

/**
 * 获取 Telepresence 状态
 */
export async function getStatus(): Promise<TelepresenceResult> {
  try {
    const result = await invoke<string>("telepresence_status");
    return { success: true, message: result };
  } catch (error) {
    return {
      success: false,
      message: typeof error === "string" ? error : String(error),
    };
  }
}
