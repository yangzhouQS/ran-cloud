/**
 * Plugin Manifest Types — 镜像 Rust PluginManifest 结构
 */

/** 插件作者 */
export type PluginAuthor = string | { name: string; url: string };

/** 插件视图定义 */
export interface PluginView {
  id: string;
  name: string;
  type: 'shell-tab' | 'base-tab';
  entry: string;
}

/** 插件菜单项 */
export interface PluginMenuItem {
  command: string;
  name: string;
  view: string;
  placement: string;
}

/** 插件能力声明 */
export interface PluginCapabilities {
  views: PluginView[];
  menu: PluginMenuItem[];
}

/** 插件清单（Manifest V1） */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: PluginAuthor;
  minAppVersion?: string;
  icon?: string;
  manifestVersion: number;
  pluginEntryDir?: string;
  capabilities: PluginCapabilities;
}

/** 插件运行时元数据 */
export interface PluginMetadata {
  manifest: PluginManifest;
  enabled: boolean;
  loadable: boolean;
  installPath: string;
}
