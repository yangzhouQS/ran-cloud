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
 * @block ran-sql-database-tree
 */

import type { PropType } from "vue";
import { defineComponent, ref, watch } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import * as sqlService from "../services/sql-commands";

/** 树节点数据 */
interface TreeNode {
  id: string;
  label: string;
  /** 节点类型 */
  type: "database" | "table" | "view" | "column";
  /** 是否叶子节点 */
  isLeaf: boolean;
  /** 关联的数据库名（用于查询表列表） */
  databaseName?: string;
  /** 子节点 */
  children?: TreeNode[];
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
          treeData.value = tables.map(t => ({
            id: `table-${t.name}`,
            label: t.name,
            type: (t.tableType?.toUpperCase() === "VIEW" ? "view" : "table") as "table" | "view",
            isLeaf: false,
            children: [],
          }));
        } else {
          // PostgreSQL/MySQL：先加载数据库/Schema 列表
          const databases = await sqlService.getDatabaseList(props.connectionId);
          treeData.value = databases.map(db => ({
            id: `db-${db.name}`,
            label: db.name,
            type: "database" as const,
            isLeaf: false,
            databaseName: db.name,
            children: [],
          }));
        }
      } catch (e) {
        console.error("加载数据库列表失败:", e);
        treeData.value = [];
      } finally {
        loading.value = false;
      }
    };

    watch(() => props.connectionId, loadTree, { immediate: true });

    /** 懒加载子节点 */
    const loadChildren = async (node: any, resolve: (data: TreeNode[]) => void) => {
      if (!props.connectionId) {
        resolve([]);
        return;
      }

      const nodeData: TreeNode = node.data ?? node;
      if (!nodeData) {
        resolve([]);
        return;
      }

      try {
        if (nodeData.type === "database") {
          // 展开数据库节点 → 加载表列表
          const schema = nodeData.databaseName;
          const tables = await sqlService.getDatabaseTree(props.connectionId, schema);
          const children: TreeNode[] = tables.map(t => ({
            id: `table-${schema}-${t.name}`,
            label: t.name,
            type: (t.tableType?.toUpperCase() === "VIEW" ? "view" : "table") as "table" | "view",
            isLeaf: false,
            databaseName: schema,
            children: [],
          }));
          resolve(children);
        } else if (nodeData.type === "table" || nodeData.type === "view") {
          // 展开表节点 → 加载列信息
          const tableName = nodeData.label;
          const schema = isSqlite.value ? undefined : nodeData.databaseName;
          const columns = await sqlService.getTableColumns(
            props.connectionId,
            tableName,
            schema,
          );
          const children: TreeNode[] = columns.map(col => ({
            id: `col-${tableName}-${col.name}`,
            label: `${col.name} (${col.dataType})${col.isPrimaryKey ? " PK" : ""}`,
            type: "column" as const,
            isLeaf: true,
          }));
          resolve(children);
        } else {
          resolve([]);
        }
      } catch (e) {
        console.error("加载子节点失败:", e);
        resolve([]);
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

    /** 刷新按钮 */
    const handleRefresh = () => {
      loadTree();
    };

    return () => (
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
            : !props.connectionId
                ? (
                    <div class={ns.e("empty")}>
                      <el-empty description="请先连接数据库" imageSize={60} />
                    </div>
                  )
                : treeData.value.length === 0
                  ? (
                      <div class={ns.e("empty")}>
                        <el-empty description="无数据" imageSize={60} />
                      </div>
                    )
                  : (
                      <el-tree
                        ref={treeRef}
                        data={treeData.value}
                        nodeKey="id"
                        lazy
                        load={loadChildren}
                        props={{
                          label: "label",
                          children: "children",
                          isLeaf: (data: TreeNode) => data.isLeaf,
                        }}
                        filterNodeMethod={filterNode}
                        emptyText="无数据"
                        defaultExpandAll={isSqlite.value}
                        v-slots={{
                          default: ({ data }: { data: TreeNode }) => (
                            <span class={ns.e("tree-node")} title={data.label}>
                              <span class={ns.e("tree-icon")}>{getIcon(data.type)}</span>
                              <span class={ns.e("tree-label")}>{data.label}</span>
                              {data.type === "database" && (
                                <span class={ns.e("tree-badge")}>
                                  <el-tag size="small" type="info" effect="plain">
                                    {data.type === "database" ? "DB" : ""}
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
  },
});

export default DatabaseTree;
