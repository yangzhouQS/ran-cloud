/**
 * Redis Desktop Manager 主入口
 *
 * 三栏布局：
 * - 左栏：ConnectionSidebar（连接列表 + DB 选择器）
 * - 中栏：KeyPanel（Key 列表 + 搜索 + SCAN）
 * - 右栏：TabBar + ContentArea（标签页 + 内容区）
 *
 * @block ran-redis-desktop
 */

import type { TabItem } from "./stores/redis-store";
import { listen } from "@tauri-apps/api/event";
import { computed, defineComponent, onMounted, onUnmounted } from "vue";
import { useCsNamespace } from "../../hooks/use-namespace";
import CommandLogPanel from "./components/command-log-panel";
import ConnectionSidebar from "./components/connection-sidebar";
import KeyDetail from "./components/key-detail";
import KeyPanel from "./components/key-panel";
import TabBar from "./components/tab-bar";
import { useRedisStore } from "./stores/redis-store";
import "./index.less";

const RedisDesktopManager = defineComponent({
  name: "RedisDesktopManager",
  setup() {
    const ns = useCsNamespace("redis-desktop");
    const store = useRedisStore();

    // ---- Tauri 事件监听 ----
    const unlisteners: Array<() => void> = [];

    onMounted(async () => {
      // 加载已保存的连接列表
      await store.loadConnections();

      // 监听 SCAN 进度事件
      const unlistenScan = await listen("redis:key:scan:progress", (event) => {
        store.handleScanProgress(event.payload as any);
      });
      unlisteners.push(unlistenScan);
    });

    onUnmounted(() => {
      unlisteners.forEach(fn => fn());
    });

    // ---- 计算属性 ----
    const hasActiveConnection = computed(() => !!store.activeConnectionId);
    const activeTab = computed(() => store.activeTab);

    /** 渲染标签页内容 */
    const renderTabContent = (tab: TabItem | undefined) => {
      if (!tab) {
        return (
          <div class={ns.e("content-empty")}>
            <el-empty description="请选择一个连接开始" />
          </div>
        );
      }

      switch (tab.type) {
        case "status":
          return (
            <div class={ns.e("content-placeholder")}>
              <el-empty description="服务器状态面板将在 Phase 4 实现" />
            </div>
          );
        case "cli":
          return (
            <div class={ns.e("content-placeholder")}>
              <el-empty description="CLI 终端将在 Phase 4 实现" />
            </div>
          );
        case "key-detail":
          return <KeyDetail />;
        case "slow-log":
          return (
            <div class={ns.e("content-placeholder")}>
              <el-empty description="慢日志面板将在 Phase 4 实现" />
            </div>
          );
        case "memory-analysis":
          return (
            <div class={ns.e("content-placeholder")}>
              <el-empty description="内存分析将在 Phase 4 实现" />
            </div>
          );
        case "command-log":
          return <CommandLogPanel />;
        default:
          return (
            <div class={ns.e("content-placeholder")}>
              <el-empty description="未知标签类型" />
            </div>
          );
      }
    };

    return () => (
      <div class={ns.b()}>
        {/* ---- 左栏：连接侧边栏 ---- */}
        <div class={ns.e("sidebar")}>
          <ConnectionSidebar />
        </div>

        {/* ---- 中栏：Key 列表面板 ---- */}
        {hasActiveConnection.value && (
          <div class={ns.e("key-panel")}>
            <KeyPanel />
          </div>
        )}

        {/* ---- 右栏：标签栏 + 内容区 ---- */}
        <div class={ns.e("main")}>
          {store.tabs.length > 0 && <TabBar />}
          <div class={ns.e("content")}>
            {renderTabContent(activeTab.value)}
          </div>
        </div>
      </div>
    );
  },
});

export default RedisDesktopManager;
