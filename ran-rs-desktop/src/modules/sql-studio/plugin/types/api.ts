/**
 * Plugin API Types — postMessage 通信协议类型
 */

/** 插件 API 请求（从插件 iframe 发出，有 id 字段） */
export interface PluginApiRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** 插件 API 响应（返回给插件 iframe） */
export interface PluginApiResponse {
  id: string;
  name: string;
  result?: unknown;
  error?: string;
}

/** 插件通知（无 id，不需要响应） */
export interface PluginNotification {
  name: string;
  args: Record<string, unknown>;
}

/** 支持的 API 方法名（Rust 后端处理） */
export type RustApiMethod =
  | 'getSchemas'
  | 'getTables'
  | 'getColumns'
  | 'runQuery'
  | 'getData'
  | 'setData'
  | 'getAppInfo'
  | 'getConnectionInfo';

/** 支持的 API 方法名（前端处理） */
export type FrontendApiMethod =
  | 'clipboardReadText'
  | 'clipboardWriteText'
  | 'notyInfo'
  | 'notySuccess'
  | 'notyError'
  | 'notyWarning'
  | 'confirm'
  | 'getViewContext'
  | 'openExternal';

/** 所有 API 方法名 */
export type PluginApiMethod = RustApiMethod | FrontendApiMethod;

/** Rust 后端 API 方法集合 */
const RUST_API_METHODS: Set<string> = new Set([
  'getSchemas', 'getTables', 'getColumns', 'runQuery',
  'getData', 'setData', 'getAppInfo', 'getConnectionInfo',
]);

/** 判断是否为 Rust 后端处理的 API */
export function isRustApi(name: string): boolean {
  return RUST_API_METHODS.has(name);
}
