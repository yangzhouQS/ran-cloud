/**
 * 连接侧边栏组件
 *
 * 左侧面板，显示：
 * - 连接列表（带状态指示器）
 * - 新建连接按钮
 * - 连接操作（连接/断开/编辑/删除）
 * - DB 选择器（连接后展开）
 *
 * @block ran-connection-sidebar
 */

import { Delete, Edit, Link as LinkIcon, Plus, RefreshRight } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useRedisStore } from "../stores/redis-store";
import { ConnectionStatus } from "../types";
import ConnectionForm from "./connection-form";
import "./connection-sidebar.less";

const ConnectionSidebar = defineComponent({
  name: "ConnectionSidebar",
  setup() {
    const ns = useCsNamespace("connection-sidebar");
    const store = useRedisStore();

    // ===== 状态 =====
    const showFormDialog = ref(false);
    const editingConnection = ref<string | null>(null);
    const expandedConnections = ref<Set<string>>(new Set());

    // ===== 初始化 =====
    store.loadConnections();

    // ===== 事件处理 =====

    /** 新建连接 */
    const handleCreate = () => {
      editingConnection.value = null;
      showFormDialog.value = true;
    };

    /** 编辑连接 */
    const handleEdit = (id: string) => {
      editingConnection.value = id;
      showFormDialog.value = true;
    };

    /** 连接/断开 */
    const handleToggleConnect = async (config: import("../types").ConnectionConfig) => {
      const info = store.connectionInfos.get(config.id);
      if (info?.status === ConnectionStatus.Connected) {
        await store.disconnect(config.id);
        expandedConnections.value.delete(config.id);
      } else {
        try {
          await store.connect(config);
          expandedConnections.value.add(config.id);
          ElMessage.success(`已连接到 ${config.name}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          ElMessage.error(`连接失败: ${msg}`);
        }
      }
    };

    /** 删除连接 */
    const handleDelete = async (config: import("../types").ConnectionConfig) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除连接 "${config.name}" 吗？`,
          "删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await store.deleteConnection(config.id);
        ElMessage.success("已删除");
      } catch {
        // 取消删除
      }
    };

    /** 刷新连接 */
    const handleRefresh = async (config: import("../types").ConnectionConfig) => {
      try {
        await store.pingConnection(config.id);
        ElMessage.success("连接正常");
      } catch {
        ElMessage.error("连接异常");
      }
    };

    /** 切换展开/折叠 */
    const handleToggleExpand = (id: string) => {
      if (expandedConnections.value.has(id)) {
        expandedConnections.value.delete(id);
      } else {
        expandedConnections.value.add(id);
      }
    };

    /** 切换 DB */
    const handleSwitchDb = (db: number) => {
      store.switchDb(db);
    };

    /** 表单保存回调 */
    const handleFormSave = async (config: import("../types").ConnectionConfig) => {
      await store.saveConnection(config);
      showFormDialog.value = false;
      ElMessage.success(editingConnection.value ? "连接已更新" : "连接已创建");
    };

    // ===== 渲染 =====

    /** 渲染状态指示器 */
    const renderStatusDot = (status: ConnectionStatus) => {
      const colorMap: Record<string, string> = {
        [ConnectionStatus.Connected]: "#67c23a",
        [ConnectionStatus.Connecting]: "#e6a23c",
        [ConnectionStatus.Disconnected]: "#909399",
        [ConnectionStatus.Error]: "#f56c6c",
      };
      return (
        <span
          class={ns.e("status-dot")}
          style={{ backgroundColor: colorMap[status] || "#909399" }}
        />
      );
    };

    /** 渲染 DB 列表 */
    const renderDbList = (connectionId: string) => {
      if (!expandedConnections.value.has(connectionId)) {
        return null;
      }
      if (store.activeConnectionId !== connectionId) {
        return null;
      }

      const dbs = Array.from({ length: 16 }, (_, i) => i);

      return (
        <div class={ns.e("db-list")}>
          {dbs.map(db => (
            <div
              key={db}
              class={[
                ns.e("db-item"),
                store.activeDb === db && ns.is("active"),
              ]}
              onClick={() => handleSwitchDb(db)}
            >
              <span class={ns.e("db-index")}>
                DB
                {db}
              </span>
            </div>
          ))}
        </div>
      );
    };

    /** 渲染连接项 */
    const renderConnectionItem = (item: {
      config: import("../types").ConnectionConfig;
      status: ConnectionStatus;
    }) => {
      const { config, status } = item;
      const isConnected = status === ConnectionStatus.Connected;
      const isActive = store.activeConnectionId === config.id;

      return (
        <div
          key={config.id}
          class={[
            ns.e("item"),
            isActive && ns.is("active"),
          ]}
        >
          {/* 连接信息行 */}
          <div
            class={ns.e("item-header")}
            onClick={() => isConnected && handleToggleExpand(config.id)}
          >
            {renderStatusDot(status)}
            <span class={ns.e("item-name")}>{config.name}</span>
            <span class={ns.e("item-host")}>
              {config.host}
              :
              {config.port}
            </span>
          </div>

          {/* 操作按钮 */}
          <div class={ns.e("item-actions")}>
            <el-tooltip content={isConnected ? "断开" : "连接"} placement="top" showAfter={300}>
              <el-button
                link
                size="small"
                type={isConnected ? "danger" : "primary"}
                onClick={() => handleToggleConnect(config)}
              >
                <el-icon><LinkIcon /></el-icon>
              </el-button>
            </el-tooltip>

            {!isConnected && (
              <el-tooltip content="编辑" placement="top" showAfter={300}>
                <el-button
                  link
                  size="small"
                  onClick={() => handleEdit(config.id)}
                >
                  <el-icon><Edit /></el-icon>
                </el-button>
              </el-tooltip>
            )}

            {!isConnected && (
              <el-tooltip content="删除" placement="top" showAfter={300}>
                <el-button
                  link
                  size="small"
                  type="danger"
                  onClick={() => handleDelete(config)}
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            )}

            {isConnected && (
              <el-tooltip content="刷新" placement="top" showAfter={300}>
                <el-button
                  link
                  size="small"
                  onClick={() => handleRefresh(config)}
                >
                  <el-icon><RefreshRight /></el-icon>
                </el-button>
              </el-tooltip>
            )}
          </div>

          {/* DB 列表 */}
          {renderDbList(config.id)}
        </div>
      );
    };

    return () => (
      <div class={ns.b()}>
        {/* 标题栏 */}
        <div class={ns.e("header")}>
          <span class={ns.e("title")}>连接</span>
          <el-button
            type="primary"
            size="small"
            circle
            onClick={handleCreate}
          >
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>

        {/* 连接列表 */}
        <div class={ns.e("list")}>
          {store.connectionList.length === 0
            ? (
                <div class={ns.e("empty")}>
                  <el-empty description="暂无连接" image-size={60} />
                </div>
              )
            : (
                store.connectionList.map(item => renderConnectionItem(item))
              )}
        </div>

        {/* 连接表单对话框 */}
        <ConnectionForm
          visible={showFormDialog.value}
          connectionId={editingConnection.value}
          connections={store.connections}
          onSave={handleFormSave}
          onClose={() => {
            showFormDialog.value = false;
          }}
        />
      </div>
    );
  },
});

export default ConnectionSidebar;
