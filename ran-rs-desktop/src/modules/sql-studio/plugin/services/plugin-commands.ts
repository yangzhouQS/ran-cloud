/**
 * Plugin Commands — 封装插件系统 Tauri 命令调用
 */

import type { PluginApiRequest, PluginApiResponse } from "../types/api";
import type { PluginManifest, PluginMetadata } from "../types/manifest";
import { invoke } from "@tauri-apps/api/core";

/** 获取所有插件列表 */
export async function listPlugins(): Promise<PluginMetadata[]> {
  return invoke<PluginMetadata[]>("plugin_list");
}

/** 获取插件清单 */
export async function getPluginManifest(id: string): Promise<PluginManifest> {
  return invoke<PluginManifest>("plugin_get_manifest", { id });
}

/** 启用插件 */
export async function enablePlugin(id: string): Promise<void> {
  return invoke("plugin_enable", { id });
}

/** 禁用插件 */
export async function disablePlugin(id: string): Promise<void> {
  return invoke("plugin_disable", { id });
}

/** 插件 API 调用（核心命令） */
export async function pluginApiCall(
  pluginId: string,
  connectionId: string,
  request: PluginApiRequest,
): Promise<PluginApiResponse> {
  return invoke<PluginApiResponse>("plugin_api_call", { pluginId, connectionId, request });
}
