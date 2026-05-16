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
import type { KeyScanResult } from "../types";
import type { ListTable as ListTableType } from "@visactor/vtable";
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
import { useCsNamespace } from "../../../hooks/use-namespace";
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
          key: isLeaf ? currentPath : currentPath,
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

    // ===== 右键菜单 =====
    const contextMenu = ref<ContextMenuConfig>({
      visible: false,
      x: 0,
      y: 0,
      node: null,
    });

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

      const options = {
        records: treeData.value,
        columns: [
          {
            field: "label",
            title: "Key",
            tree: true,
            width: containerWidth - 70,
            style: {
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: 13,
              color: "#303133",
              padding: [0, 0, 0, 4],
              textAlign: "left" as const,
            },
            // 自定义渲染：图标 + 标签 + 类型标签
            customRender: {
              render: (args: any) => {
                const { table } = args;
                const record = table.getRecordByCell(args.col, args.row);
                if (!record) {
                  return null;
                }
                const isLeaf = record.isLeaf;
                const label = record.label || "";
                const keyType = record.keyType;

                const elements: any[] = [];

                // 图标
                if (isLeaf) {
                  elements.push({
                    type: "icon",
                    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23909399'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z'/%3E%3C/svg%3E",
                    width: 14,
                    height: 14,
                    marginRight: 6,
                    marginLeft: 2,
                  });
                } else {
                  elements.push({
                    type: "icon",
                    src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23E6A23C'%3E%3Cpath d='M2 4h8l2 2h10v14H2V4z'/%3E\%3C/svg%3E",
                    width: 14,
                    height: 14,
                    marginRight: 6,
                    marginLeft: 2,
                  });
                }

                // 标签文本
                elements.push({
                  type: "text",
                  text: label,
                  style: {
                    fontSize: 13,
                    color: "#303133",
                  },
                });

                // 类型标签（仅叶子节点）
                if (isLeaf && keyType) {
                  elements.push({
                    type: "text",
                    text: ` ${keyType}`,
                    style: {
                      fontSize: 11,
                      color: "#909399",
                    },
                  });
                }

                return {
                  type: "group",
                  children: elements,
                };
              },
            },
          },
          {
            field: "keyType",
            title: "Type",
            width: 70,
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
        theme: {
          bodyStyle: {
            bgColor: "#ffffff",
            hover: {
              cellBgColor: "#f5f7fa",
            },
          },
          selectionStyle: {
            cellBgColor: "#ecf5ff",
          },
        },
      };

      tableInstance = new ListTable(container, options as any);

      // 点击事件 — 选中叶子节点时打开 Key 详情
      tableInstance.on("click_cell", (args: any) => {
        const record = tableInstance?.getRecordByCell(args.col, args.row);
        if (record && record.isLeaf && record.keyType) {
          store.openKeyDetailTab(store.activeConnectionId, store.activeDb, record.fullPath);
        }
      });

      // 右键菜单事件
      tableInstance.on("contextmenu_cell", (args: any) => {
        const record = tableInstance?.getRecordByCell(args.col, args.row);
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
        theme: {
          bodyStyle: {
            bgColor: "#ffffff",
            hover: {
              cellBgColor: "#f5f7fa",
            },
          },
          selectionStyle: {
            cellBgColor: "#ecf5ff",
          },
        },
      };

      tableInstance = new ListTable(container, options as any);

      // 点击事件
      tableInstance.on("click_cell", (args: any) => {
        const record = tableInstance?.getRecordByCell(args.col, args.row);
        if (record && record.key) {
          store.openKeyDetailTab(store.activeConnectionId, store.activeDb, record.key);
        }
      });

      // 右键菜单事件
      tableInstance.on("contextmenu_cell", (args: any) => {
        const record = tableInstance?.getRecordByCell(args.col, args.row);
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
        (tableInstance as any).release();
        tableInstance = null;
      }
    };

    /**
     * 更新 VTable 数据
     */
    const updateTableData = () => {
      if (!tableInstance) {
        return;
      }

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
    };

    // ===== 监听数据变化 =====

    // 监听树数据变化，更新 VTable
    watch(treeData, () => {
      if (viewMode.value === "tree") {
        if (tableInstance) {
          updateTableData();
        } else {
          nextTick(() => createTreeTable());
        }
      }
    }, { deep: false });

    // 监听列表数据变化
    watch(flatKeyList, () => {
      if (viewMode.value === "list") {
        if (tableInstance) {
          updateTableData();
        } else {
          nextTick(() => createListTable());
        }
      }
    }, { deep: false });

    // ===== Tauri 事件监听 =====
    let unlisten: UnlistenFn | null = null;

    const setupEventListener = async () => {
      unlisten = await listen("redis:key:scan:progress", (event) => {
        store.handleScanProgress(event.payload as {
          keys: string[];
          batchCount: number;
          totalScanned: number;
          done: boolean;
        });
      });
    };

    onMounted(() => {
      setupEventListener();
    });

    onUnmounted(() => {
      unlisten?.();
      destroyTable();
    });

    // ===== 事件处理 =====

    /** 执行搜索 */
    const handleSearch = () => {
      if (!store.activeConnectionId) {
        ElMessage.warning("请先连接到 Redis");
        return;
      }
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
      // VTable ListTree 暂无直接展开所有 API，通过重建实例并设置 hierarchyExpandLevel 为 Infinity
      if (tableInstance) {
        (tableInstance as any).release();
        tableInstance = null;
      }
      if (tableContainerRef.value) {
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
              width: containerWidth - 70,
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
              width: 70,
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
          theme: {
            bodyStyle: {
              bgColor: "#ffffff",
              hover: { cellBgColor: "#f5f7fa" },
            },
            selectionStyle: { cellBgColor: "#ecf5ff" },
          },
        };

        tableInstance = new ListTable(container, options as any);
        tableInstance.on("click_cell", (args: any) => {
          const record = tableInstance?.getRecordByCell(args.col, args.row);
          if (record && record.isLeaf && record.keyType) {
            store.openKeyDetailTab(store.activeConnectionId, store.activeDb, record.fullPath);
          }
        });
        tableInstance.on("contextmenu_cell", (args: any) => {
          const record = tableInstance?.getRecordByCell(args.col, args.row);
          if (record) {
            contextMenu.value = {
              visible: true,
              x: args.event.clientX,
              y: args.event.clientY,
              node: record as TreeNode,
            };
          }
        });
      }
      closeContextMenu();
    };

    /** 折叠所有树节点 */
    const handleCollapseAll = () => {
      // 重建实例，hierarchyExpandLevel 设为 1
      if (tableInstance) {
        (tableInstance as any).release();
        tableInstance = null;
      }
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

    /** 关闭右键菜单 */
    const closeContextMenu = () => {
      contextMenu.value.visible = false;
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
            : store.keys.length === 0 && !store.scanState.scanning
              ? (
                  <div class={ns.e("empty")}>
                    <el-empty
                      description={store.scanState.pattern !== "*"
                        ? "未找到匹配的 Key"
                        : "点击刷新加载 Key"}
                      image-size={80}
                    />
                  </div>
                )
              : (
                  <div
                    ref={tableContainerRef}
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
