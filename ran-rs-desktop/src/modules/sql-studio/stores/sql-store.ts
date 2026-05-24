/**
 * SQL Studio Store — Pinia 状态管理
 *
 * 集中管理连接状态和查询状态，确保所有面板组件共享同一份数据。
 */

import type { ConnectionConfig, ConnectionInfo, DatabaseType } from "../types/connection";
import type { QueryHistory, QueryResult } from "../types/query";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import * as sqlService from "../services/sql-commands";
import { createDefaultConfig } from "../types/connection";

export const useSqlStore = defineStore("sql-studio", () => {
  // ==================== 连接状态 ====================

  /** 连接列表（概要信息） */
  const connections = ref<ConnectionInfo[]>([]);

  /** 当前活跃连接 ID */
  const activeConnectionId = ref<string | null>(null);

  /** 连接配置缓存（完整配置，含密码/SSL/SSH） */
  const configMap = ref<Map<string, ConnectionConfig>>(new Map());

  /** 连接加载状态 */
  const loading = ref(false);

  /** 连接级错误信息 */
  const error = ref<string | null>(null);

  // ==================== 查询状态 ====================

  /** 查询执行中 */
  const executing = ref(false);

  /** 当前查询结果 */
  const currentResult = ref<QueryResult | null>(null);

  /** 查询错误 */
  const queryError = ref<string | null>(null);

  /** 查询历史 */
  const queryHistory = ref<QueryHistory[]>([]);

  /** 当前连接的 SQL 草稿内容 */
  const draftSql = ref<string>("");

  // ==================== 连接 Computed ====================

  /** 当前活跃连接信息 */
  const activeConnection = computed(() =>
    connections.value.find(c => c.id === activeConnectionId.value) ?? null,
  );

  /** 已连接的连接列表 */
  const connectedList = computed(() =>
    connections.value.filter(c => c.status === "connected"),
  );

  // ==================== 连接 Actions ====================

  /** 刷新连接列表（同时加载完整配置到 configMap） */
  async function refreshConnections() {
    loading.value = true;
    error.value = null;
    try {
      // 1. 加载连接概要列表（用于 UI 展示）
      connections.value = await sqlService.listConnections();
      // 2. 加载完整配置到缓存（用于连接/编辑）
      const configs = await sqlService.loadSavedConnections();
      for (const config of configs) {
        configMap.value.set(config.id, config);
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  /** 创建新连接 */
  async function createConnection(dbType: DatabaseType) {
    const config = createDefaultConfig(dbType);
    configMap.value.set(config.id, config);
    try {
      await sqlService.createConnection(config);
      await refreshConnections();
      activeConnectionId.value = config.id;
    } catch (e) {
      error.value = String(e);
    }
  }

  /** 连接到数据库 */
  async function connect(id: string) {
    // 先确保 configMap 有完整配置
    if (configMap.value.size === 0) {
      try {
        const configs = await sqlService.loadSavedConnections();
        for (const config of configs) {
          configMap.value.set(config.id, config);
        }
      } catch {
        // 加载配置失败，继续尝试
      }
    }

    const config = configMap.value.get(id);
    if (!config) {
      error.value = `连接配置不存在: ${id}`;
      return;
    }

    try {
      await sqlService.createConnection(config);
      await refreshConnections();
      activeConnectionId.value = id;
      error.value = null;
    } catch (e) {
      error.value = String(e);
    }
  }

  /** 断开连接 */
  async function disconnect(id: string) {
    try {
      await sqlService.closeConnection(id);
      await refreshConnections();
      if (activeConnectionId.value === id) {
        activeConnectionId.value = null;
      }
      error.value = null;
    } catch (e) {
      error.value = String(e);
    }
  }

  /** 测试连接 */
  async function testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      return await sqlService.testConnection(config);
    } catch {
      return false;
    }
  }

  /** 保存配置到本地 */
  async function saveConfig(config: ConnectionConfig) {
    configMap.value.set(config.id, config);
    try {
      await sqlService.saveConnection(config);
      error.value = null;
    } catch (e) {
      error.value = String(e);
    }
  }

  /** 删除连接配置 */
  async function deleteConnection(id: string) {
    try {
      await sqlService.deleteConnection(id);
      // 清理草稿文件
      sqlService.deleteDraftSql(id).catch(() => {});
      configMap.value.delete(id);
      await refreshConnections();
      if (activeConnectionId.value === id) {
        activeConnectionId.value = null;
      }
      error.value = null;
    } catch (e) {
      error.value = String(e);
    }
  }

  // ==================== 查询 Actions ====================

  /** 执行 SQL 查询 */
  async function executeQuery(sql: string, database?: string) {
    if (!sql.trim() || !activeConnectionId.value) {
      return;
    }

    executing.value = true;
    queryError.value = null;
    currentResult.value = null;

    const startTime = Date.now();
    try {
      const result = await sqlService.executeQuery({
        connectionId: activeConnectionId.value,
        sql: sql.trim(),
        database,
        limit: 1000,
      });
      currentResult.value = result;

      // 异步保存查询历史（不阻塞 UI）
      _saveQueryHistory(sql.trim(), database, result.executionTimeMs, result.rows?.length ?? 0);
    } catch (e) {
      queryError.value = String(e);
      // 即使失败也记录历史
      const elapsed = Date.now() - startTime;
      _saveQueryHistory(sql.trim(), database, elapsed, 0);
    } finally {
      executing.value = false;
    }
  }

  /** 内部方法：保存查询历史 */
  async function _saveQueryHistory(sql: string, database?: string, executionTimeMs?: number, rowCount?: number) {
    if (!activeConnectionId.value) {
      return;
    }
    const history: QueryHistory = {
      id: crypto.randomUUID(),
      connectionId: activeConnectionId.value,
      database,
      sql,
      executedAt: new Date().toISOString(),
      executionTimeMs,
      rowCount,
    };
    try {
      await sqlService.saveQueryHistory(history);
      // 插入到本地历史列表头部
      queryHistory.value.unshift(history);
      // 限制本地列表大小
      if (queryHistory.value.length > 200) {
        queryHistory.value = queryHistory.value.slice(0, 200);
      }
    } catch {
      // 保存历史失败不影响主流程
    }
  }

  /** 清空查询结果 */
  function clearResult() {
    currentResult.value = null;
    queryError.value = null;
  }

  /** 加载查询历史 */
  async function loadQueryHistory(limit?: number) {
    if (!activeConnectionId.value) {
      return;
    }
    try {
      queryHistory.value = await sqlService.loadQueryHistory(activeConnectionId.value, limit);
    } catch {
      queryHistory.value = [];
    }
  }

  /** 加载 SQL 草稿 */
  async function loadDraftSqlAction() {
    if (!activeConnectionId.value) {
      draftSql.value = "";
      return;
    }
    try {
      const content = await sqlService.loadDraftSql(activeConnectionId.value);
      draftSql.value = content ?? "";
    } catch {
      draftSql.value = "";
    }
  }

  /** 保存 SQL 草稿 */
  async function saveDraftSqlAction(sql: string) {
    if (!activeConnectionId.value) {
      return;
    }
    draftSql.value = sql;
    try {
      await sqlService.saveDraftSql(activeConnectionId.value, sql);
    } catch {
      // 保存草稿失败不影响主流程
    }
  }

  // 切换活跃连接时自动加载查询历史和草稿
  watch(activeConnectionId, (newId) => {
    if (newId) {
      loadQueryHistory();
      loadDraftSqlAction();
    } else {
      queryHistory.value = [];
      draftSql.value = "";
    }
  });

  return {
    // 连接
    connections,
    activeConnectionId,
    activeConnection,
    connectedList,
    loading,
    error,
    configMap,
    refreshConnections,
    createConnection,
    connect,
    disconnect,
    testConnection,
    saveConfig,
    deleteConnection,
    // 查询
    executing,
    currentResult,
    queryError,
    queryHistory,
    executeQuery,
    clearResult,
    loadQueryHistory,
    // 草稿
    draftSql,
    loadDraftSqlAction,
    saveDraftSqlAction,
  };
});
