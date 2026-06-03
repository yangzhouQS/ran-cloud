/**
 * 命令执行器 composable
 *
 * 封装 openclaw 命令执行的通用逻辑：
 * - 命令日志管理（添加/清空）
 * - 模拟执行（TODO: 替换为 Tauri 后端调用）
 * - loading 状态管理
 */

import type { CommandLogEntry } from "../types";
import { ref } from "vue";

/** 命令执行器返回值 */
export interface UseCommandExecutor {
  /** 是否正在执行命令 */
  loading: ReturnType<typeof ref<boolean>>;
  /** 命令日志列表 */
  commandLogs: ReturnType<typeof ref<CommandLogEntry[]>>;
  /** 执行命令 */
  execCommand: (cmd: string, successOutput: string, duration?: number, url?: string) => Promise<void>;
  /** 清空日志 */
  clearLogs: () => void;
}

/**
 * 创建命令执行器实例
 *
 * 每个子页面独立调用，拥有自己的 loading 和 commandLogs 状态
 */
export function useCommandExecutor(): UseCommandExecutor {
  const loading = ref(false);
  const commandLogs = ref<CommandLogEntry[]>([]);

  /** 模拟执行命令 */
  const execCommand = async (
    cmd: string,
    successOutput: string,
    duration: number = 1000,
    url?: string,
  ): Promise<void> => {
    loading.value = true;
    const entry: CommandLogEntry = {
      cmd,
      output: "执行中...",
      time: new Date().toLocaleTimeString(),
      success: false,
      url,
    };
    commandLogs.value.unshift(entry);
    try {
      // TODO: 调用 Tauri 后端 Command API 执行 openclaw 命令
      await new Promise(resolve => setTimeout(resolve, duration));
      entry.output = successOutput;
      entry.success = true;
      entry.time = new Date().toLocaleTimeString();
    } catch (err) {
      entry.output = `执行失败: ${err}`;
      entry.success = false;
    } finally {
      loading.value = false;
    }
  };

  /** 清空日志 */
  const clearLogs = () => {
    commandLogs.value = [];
  };

  return { loading, commandLogs, execCommand, clearLogs };
}
