/**
 * Plugin Store — 插件系统 Pinia 状态管理
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PluginMetadata } from '../types/manifest';
import * as pluginCommands from '../services/plugin-commands';

export const usePluginStore = defineStore('sql-plugin', () => {
  // ==================== 状态 ====================

  /** 所有已发现的插件 */
  const plugins = ref<PluginMetadata[]>([]);

  /** 加载状态 */
  const loading = ref(false);

  /** 错误信息 */
  const error = ref<string | null>(null);

  // ==================== Computed ====================

  /** 已启用且可加载的插件 */
  const enabledPlugins = computed(() =>
    plugins.value.filter(p => p.enabled && p.loadable),
  );

  /** 已禁用的插件 */
  const disabledPlugins = computed(() =>
    plugins.value.filter(p => !p.enabled),
  );

  // ==================== Actions ====================

  /** 刷新插件列表 */
  async function refreshPlugins() {
    loading.value = true;
    error.value = null;
    try {
      plugins.value = await pluginCommands.listPlugins();
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  /** 切换插件启用/禁用状态 */
  async function togglePlugin(id: string, enabled: boolean) {
    try {
      if (enabled) {
        await pluginCommands.enablePlugin(id);
      } else {
        await pluginCommands.disablePlugin(id);
      }
      // 更新本地状态
      const plugin = plugins.value.find(p => p.manifest.id === id);
      if (plugin) {
        plugin.enabled = enabled;
      }
      error.value = null;
    } catch (e) {
      error.value = String(e);
    }
  }

  return {
    plugins,
    loading,
    error,
    enabledPlugins,
    disabledPlugins,
    refreshPlugins,
    togglePlugin,
  };
});
