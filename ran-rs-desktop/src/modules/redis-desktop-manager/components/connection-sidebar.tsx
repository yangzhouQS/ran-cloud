/**
 * 连接侧边栏组件
 *
 * 左侧面板，显示：
 * - 搜索/过滤输入框
 * - 连接列表（带状态指示器、hover 显示操作菜单）
 * - 新建连接按钮
 * - 通过 ElDropdown 提供丰富操作菜单（连接/断开/编辑/复制/删除/刷新）
 * - DB 选择器（连接后以下拉选择器展示，紧凑友好）
 *
 * @block ran-connection-sidebar
 */

import type { ConnectionConfig } from "../types";
import {
  CopyDocument,
  Delete,
  Edit,
  Link as LinkIcon,
  MoreFilled,
  Plus,
  RefreshRight,
  Search,
  SwitchButton,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, defineComponent, ref } from "vue";
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
    const searchKeyword = ref("");

    /** Redis 默认数据库数量（可通过 CONFIG GET databases 获取，这里使用默认值） */
    const dbCount = 16;

    // ===== 初始化 =====
    store.loadConnections();

    // ===== 计算属性 =====

    /** 按搜索关键词过滤的连接列表 */
    const filteredConnections = computed(() => {
      if (!searchKeyword.value) {
        return store.connectionList;
      }
      const keyword = searchKeyword.value.toLowerCase();
      return store.connectionList.filter(item =>
        item.config.name.toLowerCase().includes(keyword),
      );
    });

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
    const handleToggleConnect = async (config: ConnectionConfig) => {
      const info = store.connectionInfos.get(config.id);
      if (info?.status === ConnectionStatus.Connected) {
        await store.disconnect(config.id);
      } else {
        try {
          await store.connect(config);
          ElMessage.success(`已连接到 ${config.name}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          ElMessage.error(`连接失败: ${msg}`);
        }
      }
    };

    /** 删除连接 */
    const handleDelete = async (config: ConnectionConfig) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除连接 "${config.name}" 吗？`,
          "删除确认",
          {
            confirmButtonText: "确定",
            cancelButtonText: "取消",
            type: "warning",
          },
        );
        await store.deleteConnection(config.id);
        ElMessage.success("已删除");
      } catch {
        // 取消删除
      }
    };

    /** 复制连接 */
    const handleCopy = async (config: ConnectionConfig) => {
      const newConfig: ConnectionConfig = {
        ...config,
        id: crypto.randomUUID(),
        name: `${config.name} (副本)`,
      };
      await store.saveConnection(newConfig);
      ElMessage.success(`已复制连接: ${newConfig.name}`);
    };

    /** 刷新连接 */
    const handleRefresh = async (config: ConnectionConfig) => {
      try {
        await store.pingConnection(config.id);
        ElMessage.success("连接正常");
      } catch {
        ElMessage.error("连接异常");
      }
    };

    /** 切换 DB */
    const handleSwitchDb = (db: number) => {
      store.switchDb(db);
      // 显式触发 key 列表加载（switchDb 已重置状态）
      store.startScan();
    };

    /** 点击连接项 — 激活连接 */
    const handleConnectionClick = (config: ConnectionConfig) => {
      const info = store.connectionInfos.get(config.id);
      if (info?.status === ConnectionStatus.Connected) {
        // 已连接：切换为活跃连接，恢复上次选择的 DB
        if (store.activeConnectionId !== config.id) {
          store.activeConnectionId = config.id;
          const lastDb = store.getConnectionActiveDb(config.id);
          store.switchDb(lastDb);
          store.startScan();
        }
      }
    };

    /** 表单保存回调 */
    const handleFormSave = async (config: ConnectionConfig) => {
      await store.saveConnection(config);
      showFormDialog.value = false;
      ElMessage.success(
        editingConnection.value ? "连接已更新" : "连接已创建",
      );
    };

    /** Dropdown 菜单命令处理 */
    const handleDropdownCommand = (command: string, config: ConnectionConfig) => {
      switch (command) {
        case "connect":
          handleToggleConnect(config);
          break;
        case "edit":
          handleEdit(config.id);
          break;
        case "copy":
          handleCopy(config);
          break;
        case "delete":
          handleDelete(config);
          break;
        case "refresh":
          handleRefresh(config);
          break;
      }
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

    /** 渲染 DB 选择器 — 紧凑下拉模式 */
    const renderDbSelector = (connectionId: string) => {
      // 仅在活跃连接时显示
      if (store.activeConnectionId !== connectionId) {
        return null;
      }

      return (
        <div class={ns.e("db-selector")} onClick={(e: MouseEvent) => e.stopPropagation()}>
          <span class={ns.e("db-selector-label")}>数据库</span>
          <el-select
            modelValue={store.activeDb}
            size="small"
            class={ns.e("db-select")}
            teleported={false}
            placement="bottom-start"
            onChange={(val: number) => handleSwitchDb(val)}
          >
            {Array.from({ length: dbCount }, (_, i) => (
              <el-option
                key={i}
                label={`db${i}`}
                value={i}
              />
            ))}
          </el-select>
        </div>
      );
    };

    /** 渲染下拉操作菜单 */
    const renderDropdownMenu = (config: ConnectionConfig, isConnected: boolean) => {
      return (
        <el-dropdown-menu>
          {isConnected
            ? (
                <el-dropdown-item
                  command="connect"
                >
                  <el-icon style="margin-right: 6px;">
                    <SwitchButton />
                  </el-icon>
                  断开连接
                </el-dropdown-item>
              )
            : (
                <el-dropdown-item command="connect">
                  <el-icon style="margin-right: 6px;">
                    <LinkIcon />
                  </el-icon>
                  打开连接
                </el-dropdown-item>
              )}
          <el-dropdown-item command="edit">
            <el-icon style="margin-right: 6px;">
              <Edit />
            </el-icon>
            编辑连接
          </el-dropdown-item>
          <el-dropdown-item command="copy">
            <el-icon style="margin-right: 6px;">
              <CopyDocument />
            </el-icon>
            复制连接
          </el-dropdown-item>
          <el-dropdown-item command="delete" divided>
            <el-icon style="margin-right: 6px;">
              <Delete />
            </el-icon>
            删除连接
          </el-dropdown-item>
          {isConnected && (
            <el-dropdown-item command="refresh" divided>
              <el-icon style="margin-right: 6px;">
                <RefreshRight />
              </el-icon>
              刷新连接
            </el-dropdown-item>
          )}
        </el-dropdown-menu>
      );
    };

    /** 渲染连接项 */
    const renderConnectionItem = (item: {
      config: ConnectionConfig;
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
            onClick={() => handleConnectionClick(config)}
          >
            {renderStatusDot(status)}
            <span class={ns.e("item-name")}>{config.name}</span>
            <span class={ns.e("item-host")}>
              {config.host}
              :
              {config.port}
            </span>

            {/* Dropdown 操作菜单 — hover 时可见 */}
            <div
              class={ns.e("item-dropdown")}
              onClick={(e: MouseEvent) => {
                // 阻止冒泡，防止触发连接激活
                e.stopPropagation();
              }}
            >
              <el-dropdown
                trigger="click"
                placement="bottom-end"
                onCommand={(command: string) =>
                  handleDropdownCommand(command, config)}
                v-slots={{
                  dropdown: () => renderDropdownMenu(config, isConnected),
                }}
              >
                <span class={ns.e("item-dropdown-trigger")}>
                  <el-icon size={16}>
                    <MoreFilled />
                  </el-icon>
                </span>
              </el-dropdown>
            </div>
          </div>

          {/* DB 选择器 — 仅活跃连接显示 */}
          {renderDbSelector(config.id)}
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
            <el-icon>
              <Plus />
            </el-icon>
          </el-button>
        </div>

        {/* 搜索框 — 仅在有足够连接时显示 */}
        {store.connections.length >= 4 && (
          <div class={ns.e("search")}>
            <el-input
              v-model={searchKeyword}
              placeholder="搜索连接..."
              size="small"
              clearable
              suffix-icon={(
                <el-icon>
                  <Search />
                </el-icon>
              )}
            />
          </div>
        )}

        {/* 连接列表 */}
        <div class={ns.e("list")}>
          {filteredConnections.value.length === 0 && searchKeyword.value
            ? (
                <div class={ns.e("empty")}>
                  <el-empty description="无匹配连接" image-size={50} />
                </div>
              )
            : store.connectionList.length === 0
              ? (
                  <div class={ns.e("empty")}>
                    <el-empty description="暂无连接" image-size={60} />
                  </div>
                )
              : (
                  filteredConnections.value.map(item =>
                    renderConnectionItem(item),
                  )
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
