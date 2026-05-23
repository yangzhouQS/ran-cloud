/**
 * SQL Studio 数据库对象树
 *
 * 展示当前连接的数据库/表/列等对象层级树。
 * 通过 Tauri 命令加载表列表和列信息。
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
  type: "table" | "view" | "column";
  isLeaf: boolean;
  children?: TreeNode[];
}

const DatabaseTree = defineComponent({
  name: "SqlDatabaseTree",
  props: {
    connectionId: { type: String as PropType<string | null>, default: null },
    onSelectTable: { type: Function as PropType<(tableName: string) => void>, default: () => {} },
  },
  setup(props) {
    const ns = useCsNamespace("sql-database-tree");
    const treeData = ref<TreeNode[]>([]);
    const loading = ref(false);
    const filterText = ref("");
    const treeRef = ref();

    /** 加载数据库对象树 */
    const loadTree = async () => {
      if (!props.connectionId) {
        treeData.value = [];
        return;
      }
      loading.value = true;
      try {
        const tables = await sqlService.getDatabaseTree(props.connectionId);
        treeData.value = tables.map(t => ({
          id: `table-${t.name}`,
          label: t.name,
          type: (t.tableType?.toUpperCase() === "VIEW" ? "view" : "table") as "table" | "view",
          isLeaf: false,
          children: [],
        }));
      } catch (e) {
        console.error("加载数据库对象树失败:", e);
        treeData.value = [];
      } finally {
        loading.value = false;
      }
    };

    watch(() => props.connectionId, loadTree, { immediate: true });

    /** 懒加载列信息 */
    const loadColumnNode = async (node: any, resolve: (data: TreeNode[]) => void) => {
      if (!props.connectionId) {
        resolve([]);
        return;
      }
      const tableName = node.data?.label ?? node.label;
      if (!tableName) {
        resolve([]);
        return;
      }
      try {
        const columns = await sqlService.getTableColumns(props.connectionId, tableName);
        const children: TreeNode[] = columns.map(col => ({
          id: `col-${tableName}-${col.name}`,
          label: `${col.name} (${col.dataType})${col.isPrimaryKey ? " PK" : ""}`,
          type: "column" as const,
          isLeaf: true,
        }));
        resolve(children);
      } catch {
        resolve([]);
      }
    };

    /** 树节点过滤 */
    const filterNode = (value: string, data: TreeNode): boolean => {
      if (!value) return true;
      return data.label.toLowerCase().includes(value.toLowerCase());
    };

    watch(filterText, (val) => {
      treeRef.value?.filter(val);
    });

    /** 节点图标 */
    const getIcon = (type: string) => {
      switch (type) {
        case "table": return "📂";
        case "view": return "👁";
        case "column": return "📝";
        default: return "📄";
      }
    };

    return () => (
      <div class={ns.b()}>
        <div class={ns.e("header")}>
          <span class={ns.e("title")}>对象浏览器</span>
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
          {loading.value ? (
            <div class={ns.e("loading")}>
              <el-icon class="is-loading"><i class="el-icon-loading" /></el-icon>
            </div>
          ) : (
            <el-tree
              ref={treeRef}
              data={treeData.value}
              nodeKey="id"
              lazy
              load={loadColumnNode}
              props={{
                label: "label",
                children: "children",
                isLeaf: (data: TreeNode) => data.isLeaf,
              }}
              filterNodeMethod={filterNode}
              emptyText="无数据"
              v-slots={{
                default: ({ data }: { data: TreeNode }) => (
                  <span class={ns.e("tree-node")}>
                    <span class={ns.e("tree-icon")}>{getIcon(data.type)}</span>
                    <span class={ns.e("tree-label")}>{data.label}</span>
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
