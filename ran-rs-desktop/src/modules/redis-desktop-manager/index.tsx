/**
 * Redis Desktop Manager 主入口
 *
 * 基于 dockview-vue Splitview 的三栏可拖拽布局：
 * - 左栏：ConnectionSidebar（连接列表 + DB 选择器）
 * - 中栏：KeyPanel（Key 列表 + 搜索 + SCAN）
 * - 右栏：DockviewVue（标签页管理 + 内容区）
 *
 * @block ran-redis-desktop
 */

import type { SplitviewReadyEvent } from "dockview-vue";
import { listen } from "@tauri-apps/api/event";
import { DockviewVue, Orientation, SplitviewVue, themeVisualStudio } from "dockview-vue";
import { defineComponent, onMounted, onUnmounted, ref, watch } from "vue";
import { useCsNamespace } from "../layout/hooks/use-namespace";
import CliTerminal from "./components/cli-terminal";
import CommandLogPanel from "./components/command-log-panel";
import ConnectionSidebar from "./components/connection-sidebar";
import KeyDetail from "./components/key-detail";
import KeyPanel from "./components/key-panel";
import MemoryAnalysisPanel from "./components/memory-analysis-panel";
import SlowLogPanel from "./components/slow-log-panel";
import StatusPanel from "./components/status-panel";
import { useRedisStore } from "./stores/redis-store";
import "dockview-vue/dist/styles/dockview.css";
import "./index.less";

// ==================== dockview 面板适配组件 ====================

/**
 * dockview 面板组件通过 props.params 接收参数
 * 适配器从 props.params.params 中提取 connectionId、db、key 传给实际组件
 */

/** 状态面板适配 */
const StatusPanelAdapter = defineComponent({
  name: "StatusPanelAdapter",
  props: { params: { type: Object, required: true } },
  setup(props) {
    return () => (
      <StatusPanel
        connectionId={props.params.params.connectionId}
        db={props.params.params.db}
      />
    );
  },
});

/** CLI 终端适配 */
const CliTerminalAdapter = defineComponent({
  name: "CliTerminalAdapter",
  props: { params: { type: Object, required: true } },
  setup(props) {
    return () => (
      <CliTerminal
        connectionId={props.params.params.connectionId}
        db={props.params.params.db}
      />
    );
  },
});

/** Key 详情适配 */
const KeyDetailAdapter = defineComponent({
  name: "KeyDetailAdapter",
  props: { params: { type: Object, required: true } },
  setup() {
    return () => <KeyDetail />;
  },
});

/** 慢日志适配 */
const SlowLogPanelAdapter = defineComponent({
  name: "SlowLogPanelAdapter",
  props: { params: { type: Object, required: true } },
  setup(props) {
    return () => (
      <SlowLogPanel
        connectionId={props.params.params.connectionId}
        db={props.params.params.db}
      />
    );
  },
});

/** 内存分析适配 */
const MemoryAnalysisPanelAdapter = defineComponent({
  name: "MemoryAnalysisPanelAdapter",
  props: { params: { type: Object, required: true } },
  setup(props) {
    return () => (
      <MemoryAnalysisPanel
        connectionId={props.params.params.connectionId}
        db={props.params.params.db}
      />
    );
  },
});

/** 命令日志适配 */
const CommandLogPanelAdapter = defineComponent({
  name: "CommandLogPanelAdapter",
  props: { params: { type: Object, required: true } },
  setup() {
    return () => <CommandLogPanel />;
  },
});

// ==================== dockview 自定义 Tab 组件 ====================

/**
 * 自定义 Tab 渲染组件
 * - 显示标签标题
 * - 根据 closable 参数控制关闭按钮显示
 */
const CustomTab = defineComponent({
  name: "CustomTab",
  props: { params: { type: Object, required: true } },
  setup(props) {
    return () => {
      const title = props.params.api.title;
      const closable = props.params.params?.closable ?? true;

      return (
        <div class="ran-dockview-tab">
          <span class="ran-dockview-tab__title">{title}</span>
          {closable && (
            <span
              class="ran-dockview-tab__close"
              onClick={(e: Event) => {
                e.stopPropagation();
                props.params.api.close();
              }}
            >
              ×
            </span>
          )}
        </div>
      );
    };
  },
});

// ==================== dockview 空状态水印组件 ====================

const EmptyWatermark = defineComponent({
  name: "EmptyWatermark",
  setup() {
    return () => (
      <div class="ran-dockview-watermark">
        <el-empty description="请选择一个连接开始" />
      </div>
    );
  },
});

// ==================== Splitview 面板包装组件 ====================

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
 * 主内容面板（DockviewVue）
 *
 * 使用 dockview 管理标签页，替代自定义 TabBar + ContentArea
 */
const MainPanelWrapper = defineComponent({
  name: "MainPanelWrapper",

  /**
   * dockview-vue 的 findComponent() 通过 instance.components[name] 查找组件，
   * 因此注册键名必须与 addPanel({ component: "xxx" }) 中的 component 值一致。
   * DockviewVue 没有 components prop，组件注册完全依赖父组件的 components 选项。
   */
  components: {
    DockviewVue,
    // 面板组件：键名 = panel type，用于 findComponent 解析
    "status": StatusPanelAdapter,
    "cli": CliTerminalAdapter,
    "key-detail": KeyDetailAdapter,
    "slow-log": SlowLogPanelAdapter,
    "memory-analysis": MemoryAnalysisPanelAdapter,
    "command-log": CommandLogPanelAdapter,
    // Tab 和水印组件
    CustomTab,
    EmptyWatermark,
  },

  setup() {
    const store = useRedisStore();

    /** DockviewVue ready 回调 */
    const onDockviewReady = (event: { api: any }) => {
      store.setDockviewApi(event.api);
    };

    return () => (
      <div class="ran-redis-desktop__main-panel">
        <DockviewVue
          theme={themeVisualStudio}
          watermarkComponent="EmptyWatermark"
          disableFloatingGroups={true}
          onReady={onDockviewReady}
          style="width:100%;height:100%"
        />
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

      // 右栏：主内容区（DockviewVue）
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
