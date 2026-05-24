/**
 * SQL Studio 主入口
 *
 * 基于 dockview-vue Splitview 的三栏可拖拽布局：
 * - 左栏：ConnectionList（连接列表）+ DatabaseTree（对象浏览器）
 * - 中栏：QueryEditor（SQL 编辑器）
 * - 右栏：ResultTable（查询结果）
 *
 * 所有面板通过 Pinia store 共享连接和查询状态。
 *
 * @block ran-sql-studio
 */

import type { SplitviewReadyEvent } from "dockview-vue";
import type { ConnectionConfig } from "./types";
import { Orientation, SplitviewVue } from "dockview-vue";
import { defineComponent, onMounted, ref } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useCsNamespace } from "../../hooks/use-namespace";
import ConnectionForm from "./components/ConnectionForm";
import ConnectionList from "./components/ConnectionList";
import DatabaseTree from "./components/DatabaseTree";
import QueryEditor from "./components/QueryEditor";
import ResultTable from "./components/ResultTable";
import PluginManagerModal from "./plugin/components/PluginManagerModal";
import { useSqlStore } from "./stores/sql-store";
import "dockview-vue/dist/styles/dockview.css";
import "./index.less";

// ==================== Splitview 面板包装组件 ====================

/** 左侧边栏面板：连接列表 + 对象树 */
const SidebarPanel = defineComponent({
  name: "SqlSidebarPanel",
  setup() {
    const store = useSqlStore();
    const showForm = ref(false);
    const editingId = ref<string | null>(null);
    const showPluginModal = ref(false);

    const handleNew = () => {
      editingId.value = null;
      showForm.value = true;
    };

    const handleEdit = (id: string) => {
      editingId.value = id;
      showForm.value = true;
    };

    const handleSave = async (config: ConnectionConfig) => {
      await store.saveConfig(config);
      await store.refreshConnections();
      showForm.value = false;
    };

    const handleDelete = async (id: string) => {
      await store.deleteConnection(id);
    };

    const handleConnect = async (id: string) => {
      await store.connect(id);
    };

    const handleDisconnect = async (id: string) => {
      await store.disconnect(id);
    };

    const handleSelect = (id: string) => {
      store.activeConnectionId = id;
    };

    const handleTestConnection = async (config: ConnectionConfig): Promise<boolean> => {
      return store.testConnection(config);
    };

    return () => (
      <div class="ran-sql-studio__sidebar">
        {/* 连接错误提示 */}
        {store.error && (
          <el-alert
            title={store.error}
            type="error"
            closable
            onClose={() => {
              store.error = null;
            }}
            showIcon
            style={{ margin: "8px" }}
          />
        )}
        <ConnectionList
          connections={store.connections}
          activeConnectionId={store.activeConnectionId}
          loading={store.loading}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onSelect={handleSelect}
          onNew={handleNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
        <DatabaseTree
          key={store.activeConnectionId}
          connectionId={store.activeConnectionId}
          dbType={store.activeConnection?.dbType ?? null}
          onSelectTable={() => {}}
        />
        <ConnectionForm
          visible={showForm.value}
          connectionId={editingId.value}
          savedConfigs={Array.from(store.configMap.values())}
          onSave={handleSave}
          onTest={handleTestConnection}
          onClose={() => {
            showForm.value = false;
          }}
        />
        {/* 插件管理按钮 */}
        <div style={{ padding: "8px", borderTop: "1px solid var(--el-border-color-lighter)" }}>
          <el-button
            type="default"
            size="small"
            style={{ width: "100%" }}
            onClick={() => {
              showPluginModal.value = true;
            }}
          >
            插件管理
          </el-button>
        </div>
        <PluginManagerModal
          visible={showPluginModal.value}
          onClose={() => {
            showPluginModal.value = false;
          }}
        />
      </div>
    );
  },
});

/** 中间编辑器面板 */
const EditorPanel = defineComponent({
  name: "SqlEditorPanel",
  setup() {
    const store = useSqlStore();

    const handleExecute = async (sql: string) => {
      await store.executeQuery(sql);
    };

    // 防抖保存草稿（500ms）
    const debouncedSave = useDebounceFn((sql: string) => {
      store.saveDraftSqlAction(sql);
    }, 500);

    const handleDraftChange = (sql: string) => {
      debouncedSave(sql);
    };

    return () => (
      <div class="ran-sql-studio__editor">
        <QueryEditor
          connectionId={store.activeConnectionId}
          executing={store.executing}
          queryHistory={store.queryHistory}
          draftContent={store.draftSql}
          onExecute={handleExecute}
          onDraftChange={handleDraftChange}
        />
      </div>
    );
  },
});

/** 右侧结果面板 */
const ResultPanel = defineComponent({
  name: "SqlResultPanel",
  setup() {
    const store = useSqlStore();

    return () => (
      <div class="ran-sql-studio__result">
        <ResultTable
          result={store.currentResult}
          error={store.queryError}
          loading={store.executing}
        />
      </div>
    );
  },
});

// ==================== 主组件 ====================

const SqlStudio = defineComponent({
  name: "SqlStudio",

  components: {
    SidebarPanel,
    EditorPanel,
    ResultPanel,
  },

  setup() {
    const ns = useCsNamespace("sql-studio");
    const store = useSqlStore();

    onMounted(async () => {
      await store.refreshConnections();
    });

    const onReady = (event: SplitviewReadyEvent) => {
      // 左栏：连接列表 + 对象树
      event.api.addPanel({
        id: "sidebar",
        component: "SidebarPanel",
        minimumSize: 200,
        maximumSize: 400,
        size: 260,
        index: 0,
      });

      // 中栏：SQL 编辑器
      event.api.addPanel({
        id: "editor",
        component: "EditorPanel",
        minimumSize: 300,
        size: 500,
        index: 1,
      });

      // 右栏：查询结果
      event.api.addPanel({
        id: "result",
        component: "ResultPanel",
        minimumSize: 300,
        size: 500,
        index: 2,
      });
    };

    return () => (
      <div class={ns.b()}>
        <SplitviewVue
          components={{
            SidebarPanel,
            EditorPanel,
            ResultPanel,
          }}
          orientation={Orientation.HORIZONTAL}
          onReady={onReady}
          class={ns.e("splitview")}
        />
      </div>
    );
  },
});

export default SqlStudio;
