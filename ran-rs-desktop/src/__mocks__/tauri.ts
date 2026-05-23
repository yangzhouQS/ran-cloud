/**
 * Tauri invoke mock — 拦截 @tauri-apps/api/core 的 invoke 调用
 *
 * 每个测试用 vi.mock() 注册命令处理器，调用时自动匹配
 */

type CommandHandler = (...args: unknown[]) => unknown;

const handlers = new Map<string, CommandHandler>();

/** 注册 mock 命令处理器 */
export function mockCommand(cmd: string, handler: CommandHandler) {
  handlers.set(cmd, handler);
}

/** 清除所有 mock 命令处理器 */
export function clearMockCommands() {
  handlers.clear();
}

/** mock invoke 实现 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = handlers.get(cmd);
  if (!handler) {
    return Promise.reject(new Error(`Unknown command: ${cmd}`));
  }
  return handler(args) as T;
}
