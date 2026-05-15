/**
 * Redis Desktop Manager Pinia Store
 *
 * 管理 Redis 模块的全局状态：
 * - 连接列表与活跃连接
 * - 当前选中 DB
 * - Key 列表与树形结构
 * - 多标签页管理
 * - 命令日志
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ConnectionConfig,
  ConnectionInfo,
  KeyDetail,
  KeyScanResult,
} from '../types';
import { ConnectionStatus } from '../types';
import {
  redisStorageLoadConnections,
  redisStorageSaveConnection,
  redisStorageDeleteConnection,
  redisConnectionCreate,
  redisConnectionClose,
  redisConnectionStatus,
  redisConnectionPing,
  redisKeyScanStart,
  redisKeyScanCancel,
  redisKeyDetail,
  redisKeyDelete,
  redisKeyRename,
  redisKeyExpire,
  redisToolCommandLogList,
  redisToolCommandLogClear,
} from '../services/redis-commands';
import { useModuleBus } from '../../_shared/use-module-bus';

/** 标签页类型 */
export interface TabItem {
  id: string;
  type: 'status' | 'cli' | 'key-detail' | 'slow-log' | 'memory-analysis' | 'command-log';
  title: string;
  connectionId: string;
  db: number;
  key?: string;
  closable: boolean;
}

/** Key 树节点 */
export interface KeyTreeNode {
  label: string;
  fullKey?: string;
  children?: KeyTreeNode[];
  isLeaf?: boolean;
  keyType?: string;
}

/** SCAN 进度状态 */
export interface ScanState {
  scanning: boolean;
  progress: number;
  total: number;
  pattern: string;
}

export const useRedisStore = defineStore('redis-desktop', () => {
  // ===== 事件总线 =====
  const bus = useModuleBus();

  // ===== 连接管理 =====
  const connections = ref<ConnectionConfig[]>([]);
  const connectionInfos = ref<Map<string, ConnectionInfo>>(new Map());
  const activeConnectionId = ref<string>('');
  const activeDb = ref<number>(0);

  // ===== Key 管理 =====
  const keys = ref<KeyScanResult[]>([]);
  const scanState = ref<ScanState>({
    scanning: false,
    progress: 0,
    total: 0,
    pattern: '*',
  });
  const selectedKey = ref<string>('');
  const keyDetail = ref<KeyDetail | null>(null);

  // ===== 标签页管理 =====
  const tabs = ref<TabItem[]>([]);
  const activeTabId = ref<string>('');

  // ===== 命令日志 =====
  const commandLogs = ref<Array<{
    id: string;
    connectionId: string;
    db: number;
    command: string;
    args: string;
    durationMs: number;
    success: boolean;
    error: string;
    timestamp: number;
  }>>([]);

  // ===== 计算属性 =====
  const activeConnection = computed(() =>
    connections.value.find(c => c.id === activeConnectionId.value)
  );

  const activeConnectionInfo = computed(() =>
    connectionInfos.value.get(activeConnectionId.value)
  );

  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value)
  );

  const connectionList = computed(() =>
    connections.value.map(config => {
      const info = connectionInfos.value.get(config.id);
      return {
        config,
        status: info?.status ?? ConnectionStatus.Disconnected,
        info,
      };
    })
  );

  // ===== 连接操作 =====

  /** 加载已保存的连接列表 */
  async function loadConnections() {
    try {
      connections.value = await redisStorageLoadConnections();
    } catch (e) {
      console.error('[RedisStore] 加载连接列表失败:', e);
    }
  }

  /** 保存连接配置 */
  async function saveConnection(config: ConnectionConfig) {
    await redisStorageSaveConnection(config);
    const idx = connections.value.findIndex(c => c.id === config.id);
    if (idx >= 0) {
      connections.value[idx] = config;
    } else {
      connections.value.push(config);
    }
  }

  /** 删除连接配置 */
  async function deleteConnection(id: string) {
    await redisStorageDeleteConnection(id);
    connections.value = connections.value.filter(c => c.id !== id);
    if (activeConnectionId.value === id) {
      activeConnectionId.value = '';
      keys.value = [];
      tabs.value = [];
    }
  }

  /** 连接到 Redis */
  async function connect(config: ConnectionConfig) {
    const info: ConnectionInfo = {
      id: config.id,
      name: config.name,
      host: config.host,
      port: config.port,
      db: config.db,
      status: ConnectionStatus.Connecting,
    };
    connectionInfos.value.set(config.id, info);

    try {
      await redisConnectionCreate(config);
      const updatedInfo: ConnectionInfo = {
        ...info,
        status: ConnectionStatus.Connected,
      };
      connectionInfos.value.set(config.id, updatedInfo);
      activeConnectionId.value = config.id;
      activeDb.value = config.db;

      // 打开状态标签页
      openStatusTab(config.id, config.db);

      bus.emit('redis:connection:opened', { id: config.id, name: config.name });
      bus.emit('redis:connection:status', { id: config.id, status: 'connected' });
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const errorInfo: ConnectionInfo = {
        ...info,
        status: ConnectionStatus.Error,
      };
      connectionInfos.value.set(config.id, errorInfo);
      bus.emit('redis:connection:status', { id: config.id, status: 'error', error: errorMsg });
      throw e;
    }
  }

  /** 断开连接 */
  async function disconnect(connectionId: string) {
    try {
      await redisConnectionClose(connectionId);
      const info = connectionInfos.value.get(connectionId);
      if (info) {
        info.status = ConnectionStatus.Disconnected;
        connectionInfos.value.set(connectionId, { ...info });
      }
      if (activeConnectionId.value === connectionId) {
        activeConnectionId.value = '';
        keys.value = [];
        selectedKey.value = '';
        keyDetail.value = null;
        scanState.value = { scanning: false, progress: 0, total: 0, pattern: '*' };
      }
      // 关闭该连接的所有标签页
      tabs.value = tabs.value.filter(t => t.connectionId !== connectionId);
      if (tabs.value.length > 0) {
        activeTabId.value = tabs.value[0].id;
      } else {
        activeTabId.value = '';
      }

      bus.emit('redis:connection:closed', { id: connectionId });
      bus.emit('redis:connection:status', { id: connectionId, status: 'disconnected' });
    } catch (e) {
      console.error('[RedisStore] 断开连接失败:', e);
    }
  }

  /** Ping 连接 */
  async function pingConnection(connectionId: string): Promise<string> {
    return redisConnectionPing(connectionId);
  }

  /** 刷新连接状态 */
  async function refreshConnectionStatus(connectionId: string) {
    try {
      const status = await redisConnectionStatus(connectionId);
      const info = connectionInfos.value.get(connectionId);
      if (info) {
        info.status = status === 'connected' ? ConnectionStatus.Connected : ConnectionStatus.Disconnected;
        connectionInfos.value.set(connectionId, { ...info });
      }
    } catch {
      // ignore
    }
  }

  // ===== Key 操作 =====

  /** 开始扫描 Key */
  async function startScan(pattern: string = '*', count: number = 200) {
    if (!activeConnectionId.value) return;

    scanState.value = {
      scanning: true,
      progress: 0,
      total: 0,
      pattern,
    };
    keys.value = [];

    try {
      await redisKeyScanStart({
        connectionId: activeConnectionId.value,
        db: activeDb.value,
        pattern,
        count,
      });
    } catch (e) {
      console.error('[RedisStore] SCAN 启动失败:', e);
      scanState.value.scanning = false;
    }
  }

  /** 取消扫描 */
  async function cancelScan() {
    if (!activeConnectionId.value) return;
    await redisKeyScanCancel(activeConnectionId.value);
    scanState.value.scanning = false;
  }

  /** 处理 SCAN 进度事件 */
  function handleScanProgress(event: { keys: KeyScanResult[]; progress: number; total: number; done: boolean }) {
    if (event.keys && event.keys.length > 0) {
      keys.value.push(...event.keys);
    }
    scanState.value.progress = event.progress;
    scanState.value.total = event.total;
    if (event.done) {
      scanState.value.scanning = false;
    }
  }

  /** 获取 Key 详情 */
  async function loadKeyDetail(key: string) {
    if (!activeConnectionId.value) return;
    try {
      keyDetail.value = await redisKeyDetail(activeConnectionId.value, activeDb.value, key);
      selectedKey.value = key;
    } catch (e) {
      console.error('[RedisStore] 获取 Key 详情失败:', e);
    }
  }

  /** 删除 Key */
  async function deleteKeys(keyNames: string[]) {
    if (!activeConnectionId.value) return;
    await redisKeyDelete(activeConnectionId.value, activeDb.value, keyNames);
    keys.value = keys.value.filter(k => !keyNames.includes(k.key));
    if (selectedKey.value && keyNames.includes(selectedKey.value)) {
      selectedKey.value = '';
      keyDetail.value = null;
    }
    bus.emit('redis:key:deleted', {
      connectionId: activeConnectionId.value,
      db: activeDb.value,
      keys: keyNames,
    });
  }

  /** 重命名 Key */
  async function renameKey(oldKey: string, newKey: string) {
    if (!activeConnectionId.value) return;
    await redisKeyRename(activeConnectionId.value, activeDb.value, oldKey, newKey);
    const key = keys.value.find(k => k.key === oldKey);
    if (key) {
      key.key = newKey;
    }
    if (selectedKey.value === oldKey) {
      selectedKey.value = newKey;
    }
  }

  /** 设置过期时间 */
  async function setExpire(key: string, seconds: number) {
    if (!activeConnectionId.value) return;
    await redisKeyExpire(activeConnectionId.value, activeDb.value, key, seconds);
    if (keyDetail.value && keyDetail.value.key === key) {
      keyDetail.value.ttl = seconds;
    }
  }

  // ===== DB 操作 =====

  /** 切换 DB */
  function switchDb(db: number) {
    activeDb.value = db;
    keys.value = [];
    selectedKey.value = '';
    keyDetail.value = null;
    scanState.value = { scanning: false, progress: 0, total: 0, pattern: '*' };
  }

  // ===== 标签页操作 =====

  /** 生成标签页 ID */
  function generateTabId(type: string, connectionId: string, db: number, key?: string): string {
    return key ? `${type}:${connectionId}:${db}:${key}` : `${type}:${connectionId}:${db}`;
  }

  /** 打开状态标签页 */
  function openStatusTab(connectionId: string, db: number) {
    const id = generateTabId('status', connectionId, db);
    let tab = tabs.value.find(t => t.id === id);
    if (!tab) {
      tab = {
        id,
        type: 'status',
        title: '服务器状态',
        connectionId,
        db,
        closable: false,
      };
      tabs.value.push(tab);
    }
    activeTabId.value = id;
  }

  /** 打开 CLI 标签页 */
  function openCliTab(connectionId: string, db: number) {
    const id = generateTabId('cli', connectionId, db);
    let tab = tabs.value.find(t => t.id === id);
    if (!tab) {
      tab = {
        id,
        type: 'cli',
        title: `CLI (db${db})`,
        connectionId,
        db,
        closable: true,
      };
      tabs.value.push(tab);
    }
    activeTabId.value = id;
  }

  /** 打开 Key 详情标签页 */
  function openKeyDetailTab(connectionId: string, db: number, key: string) {
    const id = generateTabId('key-detail', connectionId, db, key);
    let tab = tabs.value.find(t => t.id === id);
    if (!tab) {
      // 截断过长的 key 作为标题
      const title = key.length > 30 ? `...${key.slice(-27)}` : key;
      tab = {
        id,
        type: 'key-detail',
        title,
        connectionId,
        db,
        key,
        closable: true,
      };
      tabs.value.push(tab);
    }
    activeTabId.value = id;
    loadKeyDetail(key);
  }

  /** 打开慢日志标签页 */
  function openSlowLogTab(connectionId: string, db: number) {
    const id = generateTabId('slow-log', connectionId, db);
    let tab = tabs.value.find(t => t.id === id);
    if (!tab) {
      tab = {
        id,
        type: 'slow-log',
        title: '慢日志',
        connectionId,
        db,
        closable: true,
      };
      tabs.value.push(tab);
    }
    activeTabId.value = id;
  }

  /** 打开命令日志标签页 */
  function openCommandLogTab(connectionId: string, db: number) {
    const id = generateTabId('command-log', connectionId, db);
    let tab = tabs.value.find(t => t.id === id);
    if (!tab) {
      tab = {
        id,
        type: 'command-log',
        title: '命令日志',
        connectionId,
        db,
        closable: true,
      };
      tabs.value.push(tab);
    }
    activeTabId.value = id;
  }

  /** 关闭标签页 */
  function closeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    tabs.value.splice(idx, 1);
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newIdx = Math.min(idx, tabs.value.length - 1);
        activeTabId.value = tabs.value[newIdx].id;
      } else {
        activeTabId.value = '';
      }
    }
  }

  /** 关闭其他标签页 */
  function closeOtherTabs(tabId: string) {
    tabs.value = tabs.value.filter(t => !t.closable || t.id === tabId);
    if (!tabs.value.find(t => t.id === activeTabId.value)) {
      activeTabId.value = tabs.value.length > 0 ? tabs.value[0].id : '';
    }
  }

  // ===== 命令日志操作 =====

  /** 加载命令日志 */
  async function loadCommandLogs(connectionId: string, limit: number = 100) {
    try {
      commandLogs.value = await redisToolCommandLogList(connectionId, limit);
    } catch (e) {
      console.error('[RedisStore] 加载命令日志失败:', e);
    }
  }

  /** 清除命令日志 */
  async function clearCommandLogs(connectionId: string) {
    try {
      await redisToolCommandLogClear(connectionId);
      commandLogs.value = [];
    } catch (e) {
      console.error('[RedisStore] 清除命令日志失败:', e);
    }
  }

  return {
    // 状态
    connections,
    connectionInfos,
    activeConnectionId,
    activeDb,
    keys,
    scanState,
    selectedKey,
    keyDetail,
    tabs,
    activeTabId,
    commandLogs,

    // 计算属性
    activeConnection,
    activeConnectionInfo,
    activeTab,
    connectionList,

    // 连接操作
    loadConnections,
    saveConnection,
    deleteConnection,
    connect,
    disconnect,
    pingConnection,
    refreshConnectionStatus,

    // Key 操作
    startScan,
    cancelScan,
    handleScanProgress,
    loadKeyDetail,
    deleteKeys,
    renameKey,
    setExpire,

    // DB 操作
    switchDb,

    // 标签页操作
    openStatusTab,
    openCliTab,
    openKeyDetailTab,
    openSlowLogTab,
    openCommandLogTab,
    closeTab,
    closeOtherTabs,

    // 命令日志
    loadCommandLogs,
    clearCommandLogs,
  };
});
