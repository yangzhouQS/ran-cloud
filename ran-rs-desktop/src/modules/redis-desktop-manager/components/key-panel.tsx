/**
 * Key 面板组件
 *
 * 中间面板，使用 VTable ListTable 树形模式展示当前 DB 的 Key 列表。
 * 功能：
 * - 基于 VTable 的高性能 Canvas 渲染，支持虚拟滚动
 * - 基于分隔符（默认 :）的树形结构展示
 * - 搜索过滤
 * - 流式 SCAN 进度条
 * - 右键上下文菜单（复制、删除、展开/折叠）
 * - 节点上限保护（超过 10000 个 Key 时警告）
 * - Key 数量状态栏
 * - 树形/列表双视图切换
 *
 * @block ran-key-panel
 */

import type { UnlistenFn } from "@tauri-apps/api/event";
import type { ListTable as ListTableType } from "@visactor/vtable";
import type { ComponentPublicInstance } from "vue";
import type { KeyScanResult } from "../types";
import {
  Close,
  CopyDocument,
  Delete,
  Folder,
  FolderOpened,
  List,
  RefreshRight,
  Search,
  WarningFilled,
} from "@element-plus/icons-vue";
import { listen } from "@tauri-apps/api/event";
import { ListTable } from "@visactor/vtable";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useCsNamespace } from "../../layout/hooks/use-namespace";
import { useRedisStore } from "../stores/redis-store";
import "./key-panel.less";

// ===== 类型定义 =====

/** Key 树节点（兼容 VTable 的 children 结构） */
interface TreeNode {
  label: string;
  key: string;
  fullPath: string;
  isLeaf: boolean;
  keyType?: string;
  children?: TreeNode[];
}

/** 右键菜单配置 */
interface ContextMenuConfig {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNode | null;
}

/** 最大 Key 数量阈值 */
const MAX_KEY_THRESHOLD = 10000;

// ===== 工具函数 =====

/**
 * 将扁平 Key 列表转换为基于分隔符的树形结构
 * @param keys Key 扫描结果数组
 * @param separator Key 分隔符
 * @returns 树节点数组
 */
function buildKeyTree(keys: KeyScanResult[], separator: string = ":"): TreeNode[] {
  const root: TreeNode[] = [];
  const pathMap = new Map<string, TreeNode>();

  for (const keyItem of keys) {
    // 防御性检查：确保 keyItem 是对象且 key 属性存在
    const keyName = keyItem?.key;
    if (!keyName || typeof keyName !== "string") {
      continue;
    }
    const parts = keyName.split(separator);
    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}${separator}${part}` : part;
      const isLeaf = i === parts.length - 1;

      // 用 currentPath 快速查找已存在的节点
      let existing = pathMap.get(currentPath);
      if (!existing) {
        existing = {
          label: part,
          key: currentPath,
          fullPath: currentPath,
          isLeaf,
          keyType: isLeaf ? keyItem.keyType : undefined,
          children: isLeaf ? undefined : [],
        };
        pathMap.set(currentPath, existing);

        // 特殊情况：如果一个 key 是另一个 key 的前缀
        const existingLeaf = currentLevel.find(
          n => n.label === part && n.isLeaf,
        );
        if (existingLeaf && !isLeaf) {
          existingLeaf.isLeaf = false;
          existingLeaf.keyType = undefined;
          existingLeaf.children = [];
          pathMap.set(existingLeaf.fullPath, existingLeaf);
          existingLeaf.children!.push(existing);
          currentLevel = existing.children!;
        } else {
          currentLevel.push(existing);
          if (!isLeaf) {
            currentLevel = existing.children!;
          }
        }
      } else if (!isLeaf) {
        if (!existing.children) {
          existing.children = [];
          existing.isLeaf = false;
        }
        currentLevel = existing.children!;
      }
    }
  }

  return root;
}

/**
 * 过滤树节点（递归搜索匹配的 label）
 */
function filterTree(nodes: TreeNode[], keyword: string): TreeNode[] {
  if (!keyword) {
    return nodes;
  }

  const lowerKeyword = keyword.toLowerCase();
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.isLeaf) {
      if (node.label.toLowerCase().includes(lowerKeyword)) {
        result.push(node);
      }
    } else {
      const filteredChildren = node.children
        ? filterTree(node.children, keyword)
        : [];
      if (filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      } else if (node.label.toLowerCase().includes(lowerKeyword)) {
        result.push(node);
      }
    }
  }

  return result;
}

/**
 * 按完整路径收集树中所有叶子节点 key
 */
function collectLeafKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    if (node.isLeaf) {
      keys.push(node.fullPath);
    } else if (node.children) {
      keys.push(...collectLeafKeys(node.children));
    }
  }
  return keys;
}

const KeyPanel = defineComponent({
  name: "KeyPanel",
  setup() {
    const ns = useCsNamespace("key-panel");
    const store = useRedisStore();

    // ===== 状态 =====
    const searchPattern = ref("*");
    const searchKeyword = ref("");
    const viewMode = ref<"tree" | "list">("tree");

    // VTable 实例
    const tableContainerRef = ref<HTMLDivElement | null>(null);
    let tableInstance: ListTableType | null = null;

    // ResizeObserver
    let resizeObserver: ResizeObserver | null = null;

    // ===== 右键菜单 =====
    const contextMenu = ref<ContextMenuConfig>({
      visible: false,
      x: 0,
      y: 0,
      node: null,
    });

    /** 是否已完成过至少一次扫描（用于区分"从未扫描"和"扫描完成但无结果"） */
    const hasScanned = ref(false);

    // ===== 计算属性 =====

    /** 原始树数据 */
    const rawTreeData = computed<TreeNode[]>(() => {
      if (store.keys.length === 0) {
        return [];
      }
      return buildKeyTree(store.keys, ":");
    });

    /** 过滤后的树数据 */
    const treeData = computed<TreeNode[]>(() => {
      if (!searchKeyword.value) {
        return rawTreeData.value;
      }
      return filterTree(rawTreeData.value, searchKeyword.value);
    });

    /** 扁平 Key 列表（列表视图用） */
    const flatKeyList = computed<KeyScanResult[]>(() => {
      if (!searchKeyword.value) {
        return store.keys;
      }
      const lower = searchKeyword.value.toLowerCase();
      return store.keys.filter(k => k.key.toLowerCase().includes(lower));
    });

    /** 是否超过 Key 数量阈值 */
    const isOverThreshold = computed(() => store.keys.length > MAX_KEY_THRESHOLD);

    // ===== VTable 创建/更新 =====

    /**
     * 获取 VTable 通用主题配置
     */
    const getThemeConfig = () => ({
      bodyStyle: {
        bgColor: "#ffffff",
        hover: {
          cellBgColor: "#f5f7fa",
        },
        select: {
          cellBgColor: "rgba(64,158,255,0.08)",
          inlineRowBgColor: "rgba(64,158,255,0.08)",
        },
      },
      selectionStyle: {
        cellBgColor: "rgba(64,158,255,0.08)",
        inlineRowBgColor: "rgba(64,158,255,0.08)",
        selectionFillMode: "overlay" as const,
      },
    });

    /**
     * 绑定 VTable 事件（点击 + 右键）
     */
    const bindTableEvents = (table: ListTableType) => {
      // 点击事件 — 选中叶子节点时打开 Key 详情
      table.on("click_cell", (args: any) => {
        const record = table?.getRecordByCell(args.col, args.row);
        if (record && record.isLeaf) {
          store.openKeyDetailTab(store.activeConnectionId, store.activeDb, record.fullPath);
        }
      });

      // 右键菜单事件
      table.on("contextmenu_cell", (args: any) => {
        const record = table?.getRecordByCell(args.col, args.row);
        if (record) {
          contextMenu.value = {
            visible: true,
            x: args.event.clientX,
            y: args.event.clientY,
            node: record as TreeNode,
          };
        }
      });
    };

    /**
     * 销毁 VTable 实例
     */
    const destroyTable = () => {
      if (tableInstance) {
        try {
          (tableInstance as any).release();
        } catch {
          // 忽略销毁时的错误
        }
        tableInstance = null;
      }
    };

    /** 关闭右键菜单 */
    const closeContextMenu = () => {
      contextMenu.value.visible = false;
    };

    /**
     * 创建 VTable ListTable 实例（树形模式）
     */
    const createTreeTable = () => {
      if (!tableContainerRef.value) {
        return;
      }

      // 销毁旧实例
      destroyTable();

      const container = tableContainerRef.value;
      const containerWidth = container.clientWidth || 300;
      const containerHeight = container.clientHeight || 400;

      if (containerWidth <= 0 || containerHeight <= 0) {
        console.warn("[KeyPanel] VTable 容器尺寸为 0，跳过创建:", { containerWidth, containerHeight });
        return;
      }

      const options = {
        records: treeData.value,
        columns: [
          {
            field: "label",
            title: "Key",
            tree: true,
            width: containerWidth - 80,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 13,
              color: "#303133",
              padding: [0, 0, 0, 4],
              textAlign: "left" as const,
            },
          },
          {
            field: "keyType",
            title: "Type",
            width: 80,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 11,
              color: "#909399",
              padding: [0, 4, 0, 4],
              textAlign: "center" as const,
            },
          },
        ],
        showHeader: false,
        hierarchyIndent: 20,
        hierarchyExpandLevel: 1,
        defaultRowHeight: 32,
        autoWrapText: false,
        width: containerWidth,
        height: containerHeight,
        hover: {
          highlightMode: "row" as const,
        },
        select: {
          highlightMode: "row" as const,
        },
        theme: getThemeConfig(),
      };

      try {
        tableInstance = new ListTable(container, options as any);
        bindTableEvents(tableInstance);
      } catch (e) {
        console.error("[KeyPanel] VTable 树形模式创建失败:", e);
      }
    };

    /**
     * 创建 VTable ListTable 实例（列表模式）
     */
    const createListTable = () => {
      if (!tableContainerRef.value) {
        return;
      }

      destroyTable();

      const container = tableContainerRef.value;
      const containerWidth = container.clientWidth || 300;
      const containerHeight = container.clientHeight || 400;

      if (containerWidth <= 0 || containerHeight <= 0) {
        console.warn("[KeyPanel] VTable 容器尺寸为 0，跳过创建:", { containerWidth, containerHeight });
        return;
      }

      // 将 KeyScanResult 转换为 VTable records
      const records = flatKeyList.value.map(k => ({
        key: k.key,
        keyType: k.keyType,
        ttl: k.ttl,
        fullPath: k.key,
        label: k.key,
        isLeaf: true,
      }));

      const options = {
        records,
        columns: [
          {
            field: "key",
            title: "Key",
            width: containerWidth - 120,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 13,
              color: "#303133",
              padding: [0, 0, 0, 8],
              textAlign: "left" as const,
            },
          },
          {
            field: "keyType",
            title: "Type",
            width: 60,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 11,
              color: "#909399",
              padding: [0, 4, 0, 4],
              textAlign: "center" as const,
            },
          },
          {
            field: "ttl",
            title: "TTL",
            width: 60,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 11,
              color: "#909399",
              padding: [0, 4, 0, 4],
              textAlign: "center" as const,
            },
            // 格式化 TTL 显示
            fieldFormat: (record: any) => {
              const ttl = record?.ttl;
              if (ttl === -1) {
                return "∞";
              }
              if (ttl === -2) {
                return "-";
              }
              if (ttl < 60) {
                return `${ttl}s`;
              }
              if (ttl < 3600) {
                return `${Math.floor(ttl / 60)}m`;
              }
              if (ttl < 86400) {
                return `${Math.floor(ttl / 3600)}h`;
              }
              return `${Math.floor(ttl / 86400)}d`;
            },
          },
        ],
        showHeader: false,
        defaultRowHeight: 36,
        autoWrapText: false,
        width: containerWidth,
        height: containerHeight,
        hover: {
          highlightMode: "row" as const,
        },
        select: {
          highlightMode: "row" as const,
        },
        theme: getThemeConfig(),
      };

      try {
        tableInstance = new ListTable(container, options as any);
        bindTableEvents(tableInstance);
      } catch (e) {
        console.error("[KeyPanel] VTable 列表模式创建失败:", e);
      }
    };

    /**
     * 更新 VTable 数据
     */
    const updateTableData = () => {
      if (!tableInstance) {
        return;
      }

      try {
        if (viewMode.value === "tree") {
          tableInstance.setRecords(treeData.value);
        } else {
          const records = flatKeyList.value.map(k => ({
            key: k.key,
            keyType: k.keyType,
            ttl: k.ttl,
            fullPath: k.key,
            label: k.key,
            isLeaf: true,
          }));
          tableInstance.setRecords(records);
        }
      } catch (e) {
        console.error("[KeyPanel] VTable 更新数据失败:", e);
      }
    };

    /**
     * 初始化或重建 VTable（确保容器和数据都就绪）
     */
    const initOrRecreateTable = () => {
      nextTick(() => {
        if (!tableContainerRef.value) {
          return;
        }
        if (viewMode.value === "tree") {
          createTreeTable();
        } else {
          createListTable();
        }
      });
    };

    // ===== 监听数据变化 =====

    // 监听 DB 切换 — 自动触发 SCAN 加载新 DB 的 key 列表
    watch(() => store.activeDb, () => {
      if (store.activeConnectionId) {
        hasScanned.value = false;
        // switchDb 已重置状态，这里只需等待容器就绪后创建 VTable
        nextTick(() => {
          if (store.keys.length > 0 && !tableInstance) {
            initOrRecreateTable();
          }
        });
      }
    });

    // 监听扫描状态变化 — 扫描完成时标记 hasScanned
    watch(() => store.scanState.scanning, (scanning, wasScanning) => {
      if (wasScanning && !scanning) {
        // 扫描从进行中变为完成
        hasScanned.value = true;
      }
    });

    // 安全网：keys 清空时确保 VTable 被销毁（防止 canvas 残留）
    watch(() => store.keys.length, (len) => {
      if (len === 0 && tableInstance) {
        destroyTable();
      }
    });

    // 监听树数据变化，更新 VTable
    watch(treeData, (newVal) => {
      if (viewMode.value === "tree") {
        if (tableInstance) {
          // 数据清空时销毁 VTable，避免空 canvas 残留
          if (newVal.length === 0) {
            destroyTable();
          } else {
            updateTableData();
          }
        } else if (newVal.length > 0) {
          initOrRecreateTable();
        }
      }
    }, { deep: false });

    // 监听列表数据变化
    watch(flatKeyList, (newVal) => {
      if (viewMode.value === "list") {
        if (tableInstance) {
          // 数据清空时销毁 VTable，避免空 canvas 残留
          if (newVal.length === 0) {
            destroyTable();
          } else {
            updateTableData();
          }
        } else if (newVal.length > 0) {
          initOrRecreateTable();
        }
      }
    }, { deep: false });

    // ===== ResizeObserver =====

    const setupResizeObserver = () => {
      if (!tableContainerRef.value) {
        return;
      }
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && tableInstance) {
            // 容器尺寸变化时重建 VTable
            destroyTable();
            nextTick(() => {
              if (viewMode.value === "tree") {
                createTreeTable();
              } else {
                createListTable();
              }
            });
          } else if (width > 0 && height > 0 && !tableInstance) {
            // 容器首次有尺寸时，如果有数据则创建 VTable
            const hasData = viewMode.value === "tree"
              ? treeData.value.length > 0
              : flatKeyList.value.length > 0;
            if (hasData) {
              initOrRecreateTable();
            }
          }
        }
      });
      resizeObserver.observe(tableContainerRef.value);
    };

    // ===== Tauri 事件监听 =====
    let unlisten: UnlistenFn | null = null;

    const setupEventListener = async () => {
      unlisten = await listen("redis:key:scan:progress", (event) => {
        const payload = event.payload as {
          keys: string[];
          batchCount: number;
          totalScanned: number;
          done: boolean;
        };
        store.handleScanProgress(payload);
        // SCAN 完成时标记已扫描
        if (payload.done) {
          hasScanned.value = true;
        }
      });
    };

    onMounted(() => {
      setupEventListener();
    });

    onUnmounted(() => {
      unlisten?.();
      destroyTable();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    });

    // ===== 事件处理 =====

    /** 执行搜索 */
    const handleSearch = () => {
      if (!store.activeConnectionId) {
        ElMessage.warning("请先连接到 Redis");
        return;
      }
      hasScanned.value = false;
      store.startScan(searchPattern.value);
      searchKeyword.value = "";
    };

    /** 取消扫描 */
    const handleCancelScan = () => {
      store.cancelScan();
    };

    /** 复制 Key 名称 */
    const handleCopyKey = () => {
      const node = contextMenu.value.node;
      if (!node) {
        return;
      }
      navigator.clipboard.writeText(node.fullPath).then(() => {
        ElMessage.success("Key 名称已复制");
      });
      closeContextMenu();
    };

    /** 删除单个 Key */
    const handleDeleteKey = async () => {
      const node = contextMenu.value.node;
      if (!node) {
        return;
      }
      closeContextMenu();

      try {
        await ElMessageBox.confirm(
          `确定要删除 Key "${node.fullPath}" 吗？`,
          "删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await store.deleteKeys([node.fullPath]);
        ElMessage.success("已删除");
      } catch {
        // 取消
      }
    };

    /** 删除文件夹下所有 Key */
    const handleDeleteFolder = async () => {
      const node = contextMenu.value.node;
      if (!node || node.isLeaf) {
        return;
      }
      closeContextMenu();

      const leafKeys = collectLeafKeys(node.children || []);
      if (leafKeys.length === 0) {
        ElMessage.warning("文件夹下没有 Key");
        return;
      }

      try {
        await ElMessageBox.confirm(
          `确定要删除文件夹 "${node.label}" 下的 ${leafKeys.length} 个 Key 吗？`,
          "批量删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await store.deleteKeys(leafKeys);
        ElMessage.success(`已删除 ${leafKeys.length} 个 Key`);
      } catch {
        // 取消
      }
    };

    /** 展开所有树节点 */
    const handleExpandAll = () => {
      if (!tableContainerRef.value) {
        return;
      }
      destroyTable();

      const container = tableContainerRef.value;
      const containerWidth = container.clientWidth || 300;
      const containerHeight = container.clientHeight || 400;

      const options = {
        records: treeData.value,
        columns: [
          {
            field: "label",
            title: "Key",
            tree: true,
            width: containerWidth - 80,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 13,
              color: "#303133",
              padding: [0, 0, 0, 4],
              textAlign: "left" as const,
            },
          },
          {
            field: "keyType",
            title: "Type",
            width: 80,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 11,
              color: "#909399",
              padding: [0, 4, 0, 4],
              textAlign: "center" as const,
            },
          },
        ],
        showHeader: false,
        hierarchyIndent: 20,
        hierarchyExpandLevel: Infinity, // 展开所有
        defaultRowHeight: 32,
        autoWrapText: false,
        width: containerWidth,
        height: containerHeight,
        hover: { highlightMode: "row" as const },
        select: { highlightMode: "row" as const },
        theme: getThemeConfig(),
      };

      try {
        tableInstance = new ListTable(container, options as any);
        bindTableEvents(tableInstance);
      } catch (e) {
        console.error("[KeyPanel] VTable 展开所有节点失败:", e);
      }
      closeContextMenu();
    };

    /** 折叠所有树节点 */
    const handleCollapseAll = () => {
      // 重建实例，hierarchyExpandLevel 设为 1
      destroyTable();
      nextTick(() => createTreeTable());
      closeContextMenu();
    };

    /** 切换视图模式 */
    const toggleViewMode = () => {
      const newMode = viewMode.value === "tree" ? "list" : "tree";
      viewMode.value = newMode;

      // 切换模式时重建 VTable
      destroyTable();
      nextTick(() => {
        if (newMode === "tree") {
          createTreeTable();
        } else {
          createListTable();
        }
      });
    };

    /**
     * 容器 ref 变化时设置 ResizeObserver
     */
    const setContainerRef = (el: Element | ComponentPublicInstance | null) => {
      // 清理旧的 observer
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      // 容器被卸载时（条件渲染切换到空状态），清理 ref
      if (!el) {
        tableContainerRef.value = null;
        return;
      }
      // Vue template ref 可能传入 ComponentPublicInstance，需要提取 $el
      const domEl = el instanceof Element ? el : (el as ComponentPublicInstance)?.$el as Element | undefined;
      tableContainerRef.value = (domEl as HTMLDivElement) ?? null;
      if (domEl) {
        setupResizeObserver();
      }
    };

    // ===== 渲染 =====

    return () => {
      return (
        <div
          class={ns.b()}
          onClick={() => contextMenu.value.visible && closeContextMenu()}
        >
          {/* 顶部工具栏 */}
          <div class={ns.e("toolbar-top")}>
            <el-input
              class={ns.e("search-input")}
              v-model={searchKeyword.value}
              placeholder="过滤 Key…"
              clearable
              size="small"
              onKeydown={(e: KeyboardEvent) => e.key === "Enter" && handleSearch()}
            >
              {{
                prefix: () => (
                  <el-icon>
                    <Search />
                  </el-icon>
                ),
              }}
            </el-input>
            <div class={ns.e("toolbar-actions")}>
              <el-tooltip content="刷新 Key 列表" placement="bottom">
                <el-button
                  size="small"
                  icon={RefreshRight}
                  circle
                  onClick={handleSearch}
                />
              </el-tooltip>
              <el-tooltip
                content={viewMode.value === "tree" ? "切换到列表视图" : "切换到树形视图"}
                placement="bottom"
              >
                <el-button
                  size="small"
                  circle
                  onClick={toggleViewMode}
                >
                  <el-icon>
                    {viewMode.value === "tree" ? <List /> : <FolderOpened />}
                  </el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </div>

          {/* Key 数量超限警告 */}
          {isOverThreshold.value && (
            <div class={ns.e("warning")}>
              <el-icon>
                <WarningFilled />
              </el-icon>
              <span>
                Key 数量超过
                {" "}
                {MAX_KEY_THRESHOLD.toLocaleString()}
                ，建议使用更精确的 Pattern 过滤
              </span>
            </div>
          )}

          {/* SCAN 进度 */}
          {store.scanState.scanning && (
            <div class={ns.e("progress")}>
              <el-progress
                percentage={store.scanState.total > 0
                  ? Math.round((store.scanState.progress / store.scanState.total) * 100)
                  : 0}
                striped
                stripedFlow
                strokeWidth={4}
              />
              <div class={ns.e("progress-info")}>
                <span>
                  已扫描:
                  {store.scanState.progress}
                </span>
                <span>
                  已找到:
                  {store.keys.length}
                </span>
                <el-button link type="danger" size="small" onClick={handleCancelScan}>
                  <el-icon>
                    <Close />
                  </el-icon>
                  {" "}
                  停止
                </el-button>
              </div>
            </div>
          )}

          {/* 主内容区 — VTable 容器 */}
          {!store.activeConnectionId
            ? (
                <div class={ns.e("empty")}>
                  <el-empty description="请先连接到 Redis 服务器" image-size={80} />
                </div>
              )
            : store.keys.length === 0
              ? (
                  <div class={ns.e("empty")}>
                    <el-empty
                      description={
                        store.scanState.scanning
                          ? "正在加载 Key…"
                          : hasScanned.value
                            ? store.scanState.pattern !== "*"
                              ? "未找到匹配的 Key"
                              : "当前数据库下不存在 Key"
                            : "点击刷新加载 Key"
                      }
                      image-size={80}
                    />
                  </div>
                )
              : (
                  <div
                    ref={setContainerRef}
                    class={ns.e("vtable-container")}
                  />
                )}

          {/* 底部状态栏 */}
          {store.activeConnectionId && (
            <div class={ns.e("status")}>
              <span>
                DB
                {store.activeDb}
              </span>
              <span>
                共
                {" "}
                {store.keys.length}
                {" "}
                个 Key
                {searchKeyword.value && treeData.value.length !== store.keys.length
                  ? `（匹配 ${viewMode.value === "tree"
                    ? collectLeafKeys(treeData.value).length
                    : flatKeyList.value.length} 个）`
                  : ""}
              </span>
            </div>
          )}

          {/* 右键上下文菜单 */}
          {contextMenu.value.visible && contextMenu.value.node && (
            <div
              style={{
                position: "fixed",
                left: `${contextMenu.value.x}px`,
                top: `${contextMenu.value.y}px`,
                zIndex: 9999,
              }}
              onClick={(e: Event) => e.stopPropagation()}
            >
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: -1,
                }}
                onClick={closeContextMenu}
              />
              <el-card shadow="always" body-style={{ padding: "4px 0" }}>
                {contextMenu.value.node.isLeaf
                  ? (
                      <>
                        <div
                          class="el-dropdown-menu__item"
                          style={{ padding: "5px 16px", cursor: "pointer", whiteSpace: "nowrap" }}
                          onClick={handleCopyKey}
                        >
                          <el-icon class={ns.e("contextmenu-icon")}>
                            <CopyDocument />
                          </el-icon>
                          复制 Key 名称
                        </div>
                        <div
                          class="el-dropdown-menu__item"
                          style={{ padding: "5px 16px", cursor: "pointer", whiteSpace: "nowrap", color: "#f56c6c" }}
                          onClick={handleDeleteKey}
                        >
                          <el-icon class={ns.e("contextmenu-icon")}>
                            <Delete />
                          </el-icon>
                          删除 Key
                        </div>
                      </>
                    )
                  : (
                      <>
                        <div
                          class="el-dropdown-menu__item"
                          style={{ padding: "5px 16px", cursor: "pointer", whiteSpace: "nowrap" }}
                          onClick={handleExpandAll}
                        >
                          <el-icon class={ns.e("contextmenu-icon")}>
                            <FolderOpened />
                          </el-icon>
                          展开所有
                        </div>
                        <div
                          class="el-dropdown-menu__item"
                          style={{ padding: "5px 16px", cursor: "pointer", whiteSpace: "nowrap" }}
                          onClick={handleCollapseAll}
                        >
                          <el-icon class={ns.e("contextmenu-icon")}>
                            <Folder />
                          </el-icon>
                          折叠所有
                        </div>
                        <div
                          class="el-dropdown-menu__item"
                          style={{ padding: "5px 16px", cursor: "pointer", whiteSpace: "nowrap", color: "#f56c6c" }}
                          onClick={handleDeleteFolder}
                        >
                          <el-icon class={ns.e("contextmenu-icon")}>
                            <Delete />
                          </el-icon>
                          删除文件夹
                        </div>
                      </>
                    )}
              </el-card>
            </div>
          )}
        </div>
      );
    };
  },
});

export default KeyPanel;
