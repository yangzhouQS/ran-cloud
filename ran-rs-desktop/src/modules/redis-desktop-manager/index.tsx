/**
 * Redis Desktop Manager 主入口
 *
 * 基于 dockview-vue Splitview 的三栏可拖拽布局：
 * - 左栏：ConnectionSidebar（连接列表 + DB 选择器）
 * - 中栏：KeyPanel（Key 列表 + 搜索 + SCAN）
 * - 右栏：TabBar + ContentArea（标签页 + 内容区）
 *
 * @block ran-redis-desktop
 */

import type { SplitviewReadyEvent } from "dockview-vue";
import type { TabItem } from "./stores/redis-store";
import { listen } from "@tauri-apps/api/event";
import { Orientation, SplitviewVue } from "dockview-vue";
import { computed, defineComponent, onMounted, onUnmounted, ref, watch } from "vue";
import { useCsNamespace } from "../../hooks/use-namespace";
import CliTerminal from "./components/cli-terminal";
import CommandLogPanel from "./components/command-log-panel";
import ConnectionSidebar from "./components/connection-sidebar";
import KeyDetail from "./components/key-detail";
import KeyPanel from "./components/key-panel";
import MemoryAnalysisPanel from "./components/memory-analysis-panel";
import SlowLogPanel from "./components/slow-log-panel";
import StatusPanel from "./components/status-panel";
import TabBar from "./components/tab-bar";
import { useRedisStore } from "./stores/redis-store";
import "dockview-vue/dist/styles/dockview.css";
import "./index.less";

// ==================== 面板包装组件 ====================

/**
 * 连接侧边栏面板
 *
 * 包装 ConnectionSidebar，使其适配 dockview Splitview 面板
 */
const SidebarPanel = defineComponent({
  name: "SidebarPanel",
  setup() {
    return () => (
      <div class="ran-redis-desktop__sidebar-panel">
        <ConnectionSidebar />
      </div>
    );
  },
});

/**
 * Key 列表面板
 *
 * 包装 KeyPanel，连接激活时显示 Key 列表，未激活时显示空状态
 */
const KeyPanelWrapper = defineComponent({
  name: "KeyPanelWrapper",
  setup() {
    const store = useRedisStore();

    return () => (
      <div class="ran-redis-desktop__key-panel-wrapper">
        {store.activeConnectionId
          ? (
              <KeyPanel />
            )
          : (
              <div class="ran-redis-desktop__key-panel-empty">
                <el-empty description="请先选择一个连接" />
              </div>
            )}
      </div>
    );
  },
});

/**
 * 主内容面板
 *
 * 包装 TabBar + 内容区，根据当前激活标签页渲染对应内容
 */
const MainPanelWrapper = defineComponent({
  name: "MainPanelWrapper",
  setup() {
    const ns = useCsNamespace("redis-desktop");
    const store = useRedisStore();
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
            <StatusPanel
              connectionId={tab.connectionId}
              db={tab.db}
            />
          );
        case "cli":
          return (
            <CliTerminal
              connectionId={tab.connectionId}
              db={tab.db}
            />
          );
        case "key-detail":
          return <KeyDetail />;
        case "slow-log":
          return (
            <SlowLogPanel
              connectionId={tab.connectionId}
              db={tab.db}
            />
          );
        case "memory-analysis":
          return (
            <MemoryAnalysisPanel
              connectionId={tab.connectionId}
              db={tab.db}
            />
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
      <div class={ns.e("main-panel")}>
        {store.tabs.length > 0 && <TabBar />}
        <div class={ns.e("content")}>
          {renderTabContent(activeTab.value)}
        </div>
      </div>
    );
  },
});

// ==================== 主组件 ====================

const RedisDesktopManager = defineComponent({
  name: "RedisDesktopManager",

  components: {
    SidebarPanel,
    KeyPanelWrapper,
    MainPanelWrapper,
  },

  setup() {
    const ns = useCsNamespace("redis-desktop");
    const store = useRedisStore();
    const splitviewApi = ref<ReturnType<typeof Object> | null>(null);

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

    // ---- 监听连接状态，动态显示/隐藏 Key 面板 ----
    watch(
      () => store.activeConnectionId,
      (activeId) => {
        if (!splitviewApi.value) {
          return;
        }
        try {
          const panel = (splitviewApi.value as any).getPanel("keyPanel");
          if (panel) {
            panel.api.setVisible(!!activeId);
          }
        } catch {
          // panel 可能尚未初始化
        }
      },
    );

    // ---- Splitview Ready 回调 ----
    const onReady = (event: SplitviewReadyEvent) => {
      splitviewApi.value = event.api as any;

      // 左栏：连接侧边栏
      event.api.addPanel({
        id: "sidebar",
        component: "SidebarPanel",
        minimumSize: 200,
        maximumSize: 400,
        size: 260,
        index: 0,
      });

      // 中栏：Key 列表面板
      event.api.addPanel({
        id: "keyPanel",
        component: "KeyPanelWrapper",
        minimumSize: 200,
        maximumSize: 500,
        size: 280,
        index: 1,
      });

      // 右栏：主内容区
      event.api.addPanel({
        id: "main",
        component: "MainPanelWrapper",
        minimumSize: 400,
        size: 800,
        index: 2,
      });

      // 初始状态：无活跃连接时隐藏 Key 面板
      if (!store.activeConnectionId) {
        const panel = event.api.getPanel("keyPanel");
        if (panel) {
          panel.api.setVisible(false);
        }
      }
    };

    return () => (
      <div class={ns.b()}>
        <SplitviewVue
          components={{
            SidebarPanel: "SidebarPanel",
            KeyPanelWrapper: "KeyPanelWrapper",
            MainPanelWrapper: "MainPanelWrapper",
          }}
          orientation={Orientation.HORIZONTAL}
          onReady={onReady}
          class={ns.e("splitview")}
        />
      </div>
    );
  },
});

export default RedisDesktopManager;
