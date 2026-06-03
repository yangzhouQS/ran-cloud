/**
 * 命令执行器 composable
 *
 * 通过 Tauri 后端真实执行 openclaw CLI 命令：
 * - 调用 Rust claw_execute_command 执行命令
 * - 命令日志管理（添加/清空）
 * - loading 状态管理
 */

import type { ClawExecOptions, CommandLogEntry, CommandResult } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { ref } from "vue";

/** 命令执行器返回值 */
export interface UseCommandExecutor {
  /** 是否正在执行命令 */
  loading: ReturnType<typeof ref<boolean>>;
  /** 命令日志列表 */
  commandLogs: ReturnType<typeof ref<CommandLogEntry[]>>;
  /** 执行命令（调用 Tauri 后端） */
  execCommand: (cmd: string, options?: ClawExecOptions) => Promise<CommandResult>;
  /** 清空日志 */
  clearLogs: () => void;
}

/**
 * 创建命令执行器实例
 *
 * 每个子页面独立调用，拥有自己的 loading 和 commandLogs 状态。
 * 通过 Tauri invoke 调用 Rust 后端 claw_execute_command 真实执行 openclaw 命令。
 */
export function useCommandExecutor(): UseCommandExecutor {
  const loading = ref(false);
  const commandLogs = ref<CommandLogEntry[]>([]);

  /**
   * 执行 openclaw 命令
   *
   * 调用 Rust 后端 `claw_execute_command`，通过 std::process::Command 真实执行 CLI。
   *
   * @param cmd - 完整命令字符串，如 "openclaw gateway start"
   * @param options - 可选配置（工作目录、环境变量、超时、URL）
   * @returns CommandResult 包含 stdout/stderr/exitCode/output/durationMs
   */
  const execCommand = async (
    cmd: string,
    options?: ClawExecOptions,
  ): Promise<CommandResult> => {
    loading.value = true;

    // 先插入一条"执行中"的日志条目
    const entry: CommandLogEntry = {
      cmd,
      output: "执行中...",
      time: new Date().toLocaleTimeString(),
      success: false,
      url: options?.url,
    };
    commandLogs.value.unshift(entry);

    try {
      // 调用 Rust 后端执行命令
      const result = await invoke<CommandResult>("claw_execute_command", {
        command: cmd,
        cwd: options?.cwd ?? null,
        env: options?.env ?? null,
        timeoutSecs: options?.timeoutSecs ?? null,
      });

      // 更新日志条目为最终结果
      entry.output = result.output || (result.success ? "（无输出）" : result.stderr);
      entry.success = result.success;
      entry.time = new Date().toLocaleTimeString();

      return result;
    } catch (err) {
      // invoke 本身抛出异常（如命令未注册）
      const errorMsg = typeof err === "string" ? err : String(err);
      entry.output = `调用后端失败: ${errorMsg}`;
      entry.success = false;
      entry.time = new Date().toLocaleTimeString();

      return {
        success: false,
        stdout: "",
        stderr: errorMsg,
        exitCode: null,
        output: errorMsg,
        durationMs: 0,
      };
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
