/**
 * SQL Studio 数据库对象树
 *
 * 三级树形结构：数据库/Schema → 表/视图 → 列
 * 连接建立后自动加载可访问的数据库列表，
 * 展开数据库节点懒加载表列表，展开表节点懒加载列信息。
 *
 * 支持不同数据库类型的差异：
 * - PostgreSQL: Schema 列表 → 表 → 列
 * - MySQL/MariaDB/TiDB: Database 列表 → 表 → 列
 * - SQLite: 直接显示表列表（单级）
 *
 * 实现方式：纯 data 驱动 + node-expand 事件手动加载子节点。
 * 不使用 el-tree 的 lazy 模式（lazy+data 组合在 Element Plus 中不稳定）。
 *
 * @block ran-sql-database-tree
 */

import type { PropType } from "vue";
import { defineComponent, ref, watch } from "vue";
import { useCsNamespace } from "../../layout/hooks/use-namespace";
import * as sqlService from "../services/sql-commands";

/** 树节点数据 */
interface TreeNode {
  id: string;
  label: string;
  /** 节点类型 */
  type: "database" | "table" | "view" | "column";
  /** 是否叶子节点 */
  isLeaf: boolean;
  /** 关联的数据库名（用于查询表/列列表） */
  databaseName?: string;
  /** 子节点（展开时懒加载填充） */
  children: TreeNode[];
  /** 子节点是否已加载 */
  childrenLoaded: boolean;
  /** 子节点加载中 */
  childrenLoading: boolean;
}

const DatabaseTree = defineComponent({
  name: "SqlDatabaseTree",
  props: {
    connectionId: { type: String as PropType<string | null>, default: null },
    /** 连接的数据库类型，用于差异化展示 */
    dbType: { type: String as PropType<string | null>, default: null },
    onSelectTable: { type: Function as PropType<(tableName: string) => void>, default: () => {} },
  },
  setup(props) {
    const ns = useCsNamespace("sql-database-tree");
    const treeData = ref<TreeNode[]>([]);
    const loading = ref(false);
    const filterText = ref("");
    const treeRef = ref();
    /** 当前连接是否为 SQLite（不需要数据库层级） */
    const isSqlite = ref(false);

    /** 创建空节点 */
    const makeNode = (
      id: string,
      label: string,
      type: TreeNode["type"],
      isLeaf: boolean,
      databaseName?: string,
    ): TreeNode => ({
      id,
      label,
      type,
      isLeaf,
      databaseName,
      children: [],
      childrenLoaded: false,
      childrenLoading: false,
    });

    /** 加载根节点数据 */
    const loadTree = async () => {
      if (!props.connectionId) {
        treeData.value = [];
        isSqlite.value = false;
        return;
      }

      loading.value = true;
      try {
        isSqlite.value = props.dbType === "sqlite";

        if (isSqlite.value) {
          // SQLite：直接加载表列表，无需数据库层级
          const tables = await sqlService.getDatabaseTree(props.connectionId);
          treeData.value = tables.map(t =>
            makeNode(
              `table-${t.name}`,
              t.name,
              t.tableType?.toUpperCase() === "VIEW" ? "view" : "table",
              false,
            ),
          );
        } else {
          // PostgreSQL/MySQL：先加载数据库/Schema 列表
          const databases = await sqlService.getDatabaseList(props.connectionId);
          treeData.value = databases.map(db =>
            makeNode(
              `db-${db.name}`,
              db.name,
              "database",
              false,
              db.name,
            ),
          );
        }
      } catch (e) {
        console.error("[DatabaseTree] 加载数据库列表失败:", e);
        treeData.value = [];
      } finally {
        loading.value = false;
      }
    };

    // watch connectionId 变化时重新加载
    watch(() => props.connectionId, loadTree, { immediate: true });

    // watch dbType 变化时也重新加载（解决首次挂载时 dbType 为 null 的问题）
    watch(() => props.dbType, (newType, oldType) => {
      if (props.connectionId && newType !== oldType) {
        loadTree();
      }
    });

    /** 节点展开事件 — 懒加载子节点 */
    const handleNodeExpand = async (nodeData: TreeNode) => {
      // 叶子节点或已加载或正在加载中，跳过
      if (nodeData.isLeaf || nodeData.childrenLoaded || nodeData.childrenLoading) {
        return;
      }
      if (!props.connectionId) {
        return;
      }

      nodeData.childrenLoading = true;

      try {
        if (nodeData.type === "database") {
          // 展开数据库节点 → 加载表列表
          const schema = nodeData.databaseName;
          const tables = await sqlService.getDatabaseTree(props.connectionId, schema);
          nodeData.children = tables.map(t =>
            makeNode(
              `table-${schema}-${t.name}`,
              t.name,
              t.tableType?.toUpperCase() === "VIEW" ? "view" : "table",
              false,
              schema,
            ),
          );
          nodeData.childrenLoaded = true;
        } else if (nodeData.type === "table" || nodeData.type === "view") {
          // 展开表节点 → 加载列信息
          const tableName = nodeData.label;
          const schema = isSqlite.value ? undefined : nodeData.databaseName;
          const columns = await sqlService.getTableColumns(
            props.connectionId,
            tableName,
            schema,
          );
          nodeData.children = columns.map(col =>
            makeNode(
              `col-${tableName}-${col.name}`,
              `${col.name} (${col.dataType})${col.isPrimaryKey ? " PK" : ""}`,
              "column",
              true,
            ),
          );
          nodeData.childrenLoaded = true;
        }
      } catch (e) {
        console.error("[DatabaseTree] 加载子节点失败:", e);
      } finally {
        nodeData.childrenLoading = false;
      }
    };

    /** 树节点过滤 */
    const filterNode = (value: string, data: TreeNode): boolean => {
      if (!value) {
        return true;
      }
      return data.label.toLowerCase().includes(value.toLowerCase());
    };

    watch(filterText, (val) => {
      treeRef.value?.filter(val);
    });

    /** 节点图标 */
    const getIcon = (type: string): string => {
      switch (type) {
        case "database": return "🗄";
        case "table": return "📂";
        case "view": return "👁";
        case "column": return "📝";
        default: return "📄";
      }
    };

    /** 刷新按钮 — 重新加载根节点 */
    const handleRefresh = () => {
      loadTree();
    };

    return () => {
      const showTree = props.connectionId && treeData.value.length > 0;
      const showEmpty = !props.connectionId;
      const showNoData = props.connectionId && !loading.value && treeData.value.length === 0;

      return (
        <div class={ns.b()}>
          <div class={ns.e("header")}>
            <span class={ns.e("title")}>对象浏览器</span>
            <el-button
              type="primary"
              link
              size="small"
              onClick={handleRefresh}
              disabled={!props.connectionId}
            >
              刷新
            </el-button>
          </div>

          <div class={ns.e("filter")}>
            <el-input
              v-model={filterText.value}
              placeholder="搜索对象..."
              clearable
              size="small"
              prefixIcon="Search"
            />
          </div>

          <div class={ns.e("tree")}>
            {loading.value
              ? (
                  <div class={ns.e("loading")}>
                    <el-icon class="is-loading"><i class="el-icon-loading" /></el-icon>
                    <span>加载中...</span>
                  </div>
                )
              : showEmpty
                ? (
                    <div class={ns.e("empty")}>
                      <el-empty description="请先连接数据库" imageSize={60} />
                    </div>
                  )
                : showNoData
                  ? (
                      <div class={ns.e("empty")}>
                        <el-empty description="无数据" imageSize={60} />
                      </div>
                    )
                  : null}

            {showTree && (
              <el-tree
                ref={treeRef}
                data={treeData.value}
                nodeKey="id"
                props={{
                  label: "label",
                  children: "children",
                  isLeaf: (data: TreeNode) => data.isLeaf,
                }}
                filterNodeMethod={filterNode}
                emptyText=""
                defaultExpandAll={isSqlite.value}
                expandOnClickNode={false}
                onNodeExpand={handleNodeExpand}
                v-slots={{
                  default: ({ data }: { data: TreeNode }) => (
                    <span class={ns.e("tree-node")} title={data.label}>
                      <span class={ns.e("tree-icon")}>{getIcon(data.type)}</span>
                      <span class={ns.e("tree-label")}>{data.label}</span>
                      {data.type === "database" && (
                        <span class={ns.e("tree-badge")}>
                          <el-tag size="small" type="info" effect="plain">
                            DB
                          </el-tag>
                        </span>
                      )}
                    </span>
                  ),
                }}
              />
            )}
          </div>
        </div>
      );
    };
  },
});

export default DatabaseTree;
