/**
 * Key 面板组件
 *
 * 中间面板，支持树形/列表双视图展示当前 DB 的 Key 列表。
 * 功能：
 * - 基于分隔符（默认 :）的虚拟树形结构
 * - 搜索过滤
 * - 流式 SCAN 进度条
 * - 右键上下文菜单（复制、删除、展开/折叠）
 * - 节点上限保护（超过 10000 个 Key 时警告）
 * - Key 数量状态栏
 *
 * @block ran-key-panel
 */

import type { UnlistenFn } from "@tauri-apps/api/event";
import type { KeyScanResult } from "../types";
import {
  Close,
  CopyDocument,
  Delete,
  Document,
  Folder,
  FolderOpened,
  List,
  RefreshRight,
  Search,
  WarningFilled,
} from "@element-plus/icons-vue";
import { listen } from "@tauri-apps/api/event";
import { ElMessage, ElMessageBox, ElTree } from "element-plus";
import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useRedisStore } from "../stores/redis-store";
import "./key-panel.less";

// ===== 类型定义 =====

/** Key 树节点 */
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
        // 例如 a:b 和 a:b:c，需要将 a:b 从叶子节点变为非叶子节点
        const existingLeaf = currentLevel.find(
          n => n.label === part && n.isLeaf,
        );
        if (existingLeaf && !isLeaf) {
          // 将已有叶子节点转为文件夹节点
          existingLeaf.isLeaf = false;
          existingLeaf.keyType = undefined;
          existingLeaf.children = [];
          pathMap.set(existingLeaf.fullPath, existingLeaf);
          // 将新建节点作为已有节点的子节点加入
          existingLeaf.children!.push(existing);
          currentLevel = existing.children!;
        } else {
          currentLevel.push(existing);
          if (!isLeaf) {
            currentLevel = existing.children!;
          }
        }
      } else if (!isLeaf) {
        // 已存在且当前不是叶子 → 确保 children 存在
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
        // 文件夹名匹配时也显示
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
    const treeRef = ref<InstanceType<typeof ElTree> | null>(null);

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

    // ===== Tauri 事件监听 =====
    let unlisten: UnlistenFn | null = null;

    const setupEventListener = async () => {
      unlisten = await listen("redis:key:scan:progress", (event) => {
        // 后端 ScanProgressEvent 结构：keys 为 Vec<String>，不是 KeyScanResult[]
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

    /** 树节点点击 */
    const handleTreeClick = (data: TreeNode) => {
      if (data.isLeaf && data.keyType) {
        store.openKeyDetailTab(store.activeConnectionId, store.activeDb, data.fullPath);
      }
    };

    /** 右键菜单 */
    const handleContextMenu = (e: MouseEvent, data: TreeNode) => {
      e.preventDefault();
      e.stopPropagation();
      contextMenu.value = {
        visible: true,
        x: e.clientX,
        y: e.clientY,
        node: data,
      };
    };

    /** 关闭右键菜单 */
    const closeContextMenu = () => {
      contextMenu.value.visible = false;
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
      // 使用 ElTree 的 store 展开所有
      const tree = treeRef.value;
      if (tree) {
        tree.store._getAllNodes().forEach((node: any) => {
          node.expand();
        });
      }
      closeContextMenu();
    };

    /** 折叠所有树节点 */
    const handleCollapseAll = () => {
      const tree = treeRef.value;
      if (tree) {
        tree.store._getAllNodes().forEach((node: any) => {
          node.collapse();
        });
      }
      closeContextMenu();
    };

    /** 在列表视图中点击 Key */
    const handleKeyClick = (key: string) => {
      store.openKeyDetailTab(store.activeConnectionId, store.activeDb, key);
    };

    /** 切换视图模式 */
    const toggleViewMode = () => {
      viewMode.value = viewMode.value === "tree" ? "list" : "tree";
    };

    /** 格式化 TTL */
    const formatTtl = (ttl: number): string => {
      if (ttl === -1) {
        return "永不过期";
      }
      if (ttl === -2) {
        return "已过期";
      }
      if (ttl < 60) {
        return `${ttl}s`;
      }
      if (ttl < 3600) {
        return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
      }
      if (ttl < 86400) {
        return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
      }
      return `${Math.floor(ttl / 86400)}d ${Math.floor((ttl % 86400) / 3600)}h`;
    };

    // ===== 树节点渲染插槽 =====

    /**
     * 渲染树节点内容
     * - 文件夹节点：显示文件夹图标 + 名称
     * - 叶子节点：显示 key 图标 + 名称 + 类型标签
     */
    const renderTreeNode = (
      slotProps?: { node: any; data: TreeNode },
    ) => {
      // 防御性检查：el-tree scoped slot 在某些情况下可能传入 undefined
      if (!slotProps?.node || !slotProps?.data) {
        return null;
      }
      const { node, data } = slotProps;
      const isExpanded = node.expanded;
      return (
        <div
          class={ns.e("tree-node")}
          onContextmenu={(e: MouseEvent) => handleContextMenu(e, data)}
        >
          {data.isLeaf
            ? (
                <el-icon class={ns.e("tree-node-icon")}>
                  <Document />
                </el-icon>
              )
            : (
                <el-icon class={ns.e("tree-node-icon")}>
                  {isExpanded ? <FolderOpened /> : <Folder />}
                </el-icon>
              )}
          <span class={ns.e("tree-node-label")}>{data.label}</span>
          {data.isLeaf && data.keyType && (
            <el-tag class={ns.e("tree-node-type")} size="small" type="info">
              {data.keyType}
            </el-tag>
          )}
        </div>
      );
    };

    // ===== 渲染 =====

    return () => {
      const treeProps = {
        ref: treeRef,
        data: treeData.value,
        props: {
          children: "children",
          label: "label",
          isLeaf: "isLeaf",
        },
        nodeKey: "fullPath",
        defaultExpandAll: false,
        highlightCurrent: true,
        expandOnClickNode: true,
        filterMethod: () => true,
        onNodeClick: handleTreeClick,
      };

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

          {/* 主内容区 */}
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
              : viewMode.value === "tree"
                ? (
                    <div class={ns.e("tree")}>
                      <el-tree
                        ref={treeRef}
                        data={treeData.value}
                        props={{
                          children: "children",
                          label: "label",
                          isLeaf: "isLeaf",
                        }}
                        node-key="fullPath"
                        default-expand-all={false}
                        highlight-current
                        expand-on-click-node
                        filter-node-method={() => true}
                        onNode-click={handleTreeClick}
                      >
                        {{
                          default: renderTreeNode,
                        }}
                      </el-tree>
                    </div>
                  )
                : (
                    <div class={ns.e("list")}>
                      <div class={ns.e("list-inner")}>
                        {flatKeyList.value.map(keyItem => (
                          <div
                            key={keyItem.key}
                            class={[
                              ns.e("key-item"),
                              store.selectedKey === keyItem.key && ns.is("selected"),
                            ]}
                            onClick={() => handleKeyClick(keyItem.key)}
                          >
                            <div class={ns.e("key-info")}>
                              <span class={ns.e("key-name")}>{keyItem.key}</span>
                              <div class={ns.e("key-meta")}>
                                <el-tag size="small" type="info">{keyItem.keyType}</el-tag>
                                <span class={ns.e("key-ttl")}>{formatTtl(keyItem.ttl)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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
