import { invoke } from '@tauri-apps/api/core';

/**
 * 调用 Rust 后端的 greet 命令
 * @param name - 问候名称
 * @returns 来自 Rust 后端的问候消息
 */
export async function greet(name: string): Promise<string> {
  return invoke<string>('greet', { name });
}
