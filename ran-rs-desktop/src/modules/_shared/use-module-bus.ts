/**
 * 跨模块通信总线
 *
 * 基于 mitt 的类型安全事件总线，用于模块间松耦合通信。
 * 每个模块定义自己的事件类型映射，通过命名空间前缀避免冲突。
 *
 * @example
 * ```ts
 * // 定义模块事件类型
 * interface RedisEvents {
 *   'redis:connection:status': { id: string; status: 'connected' | 'disconnected' };
 *   'redis:key:refresh': { connectionId: string; db: number };
 * }
 *
 * // 使用
 * const bus = useModuleBus<RedisEvents>();
 * bus.emit('redis:connection:status', { id: '1', status: 'connected' });
 * bus.on('redis:connection:status', (payload) => { ... });
 * ```
 */

import type { Emitter } from "mitt";
import mitt from "mitt";

/** 全局事件类型映射 — 所有模块的事件在此汇聚 */
export interface GlobalModuleEvents {
  // ===== 通用事件 =====
  "app:theme:change": "light" | "dark" | "system";
  "app:language:change": string;
  "app:settings:updated": Record<string, unknown>;

  // ===== Redis 模块事件 =====
  "redis:connection:status": { id: string; status: "connected" | "disconnected" | "connecting" | "error"; error?: string };
  "redis:connection:opened": { id: string; name: string };
  "redis:connection:closed": { id: string };
  "redis:key:refresh": { connectionId: string; db: number };
  "redis:key:selected": { connectionId: string; db: number; key: string };
  "redis:key:deleted": { connectionId: string; db: number; keys: string[] };
  "redis:tab:open": { type: string; connectionId: string; title: string; data?: unknown };
  "redis:tab:close": { tabId: string };
  "redis:tab:close-all": { connectionId: string };
  "redis:cli:command": { connectionId: string; command: string; result?: unknown };
  "redis:tool:command-log": { connectionId: string; command: string; timestamp: number; duration?: number };

  // ===== Telepresence 模块事件 =====
  "telepresence:connect:status": { name: string; status: "connected" | "disconnected" | "connecting" };
  "telepresence:intercept:changed": { name: string; intercepts: unknown[] };
}

/** 事件总线实例类型 */
type ModuleBusEmitter = Emitter<GlobalModuleEvents>;

/** 全局单例事件总线（延迟初始化） */
let globalBus: ModuleBusEmitter | null = null;

/**
 * 获取全局模块通信总线实例
 *
 * 使用 mitt 库实现，全局单例模式。
 * 所有模块共享同一个总线实例，通过事件名前缀区分模块。
 *
 * @returns mitt Emitter 实例
 */
export function useModuleBus(): ModuleBusEmitter {
  if (!globalBus) {
    globalBus = mitt<GlobalModuleEvents>();
  }
  return globalBus;
}

/**
 * 重置全局事件总线（仅用于测试）
 */
export function resetModuleBus(): void {
  globalBus?.all.clear();
  globalBus = null;
}
