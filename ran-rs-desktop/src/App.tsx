/**
 * App 主应用组件
 *
 * 三栏布局：Sidebar（主导航） + CategoryPanel（二级分类） + MainContent（模块内容）。
 * 各业务模块通过 registerModule() 注册，App 从注册表读取分类和组件。
 * Redis / Settings / About 以独立 OS 级窗口打开。
 */

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ElMessage } from "element-plus";
import { computed, defineComponent, ref } from "vue";
import Layout from "./components/layout";
import { useCsNamespace } from "./hooks/use-namespace";
import { getModule, registerModule } from "./modules/_shared/module-registry";
import ClawManager from "./modules/claw-manager";
import { clawManagerCategories, clawManagerTitle } from "./modules/claw-manager/categories";
import DevelopTools from "./modules/develop-tools";
import { developToolsCategories, developToolsTitle } from "./modules/develop-tools/categories";
import "./components/layout.less";

// ===== 注册业务模块 =====
registerModule({
  navKey: "k8s",
  categoryTitle: developToolsTitle,
  categories: developToolsCategories,
  component: DevelopTools,
});

registerModule({
  navKey: "claw-manager",
  categoryTitle: clawManagerTitle,
  categories: clawManagerCategories,
  component: ClawManager,
});

/** 检测是否运行在 Tauri 环境中 */
const isTauri = () => "__TAURI_INTERNALS__" in window;

/** 构建新窗口的 URL（基于当前页面地址，替换 hash 部分） */
function buildWindowUrl(hash: string) {
  const base = window.location.href.split("#")[0];
  return `${base}#${hash}`;
}

const App = defineComponent({
  name: "App",
  setup() {
    // ===== BEM 命名空间 =====
    const nsPage = useCsNamespace("content-page");

    // ===== 导航状态 =====
    const activeNav = ref("k8s");
    const activeCategory = ref("k8s-network-tools");

    // ===== 计算属性（从注册表获取） =====
    const currentModule = computed(() => getModule(activeNav.value));
    const categories = computed(() => currentModule.value?.categories ?? []);
    const categoryTitle = computed(() => currentModule.value?.categoryTitle ?? "");

    // ===== 事件处理 =====

    /** 打开 Redis Desktop Manager 独立窗口 */
    const openRedisWindow = async () => {
      if (!isTauri()) {
        window.open(buildWindowUrl("/redis"), "_blank");
        return;
      }

      const windowLabel = "redis";

      try {
        const existingWin = await WebviewWindow.getByLabel(windowLabel);
        if (existingWin) {
          try {
            await existingWin.setFocus();
          } catch (err) {
            console.log(err);
          }
          return;
        }

        const webview = new WebviewWindow(windowLabel, {
          url: buildWindowUrl("/redis"),
          title: "Redis Desktop Manager - Ran RS Desktop",
          width: 1200,
          height: 800,
          center: true,
          minimizable: true,
          closable: true,
          resizable: true,
        });

        webview.once("tauri://error", (e) => {
          console.error("[Tauri] Redis 窗口创建错误:", e);
          ElMessage.error("无法打开 Redis Desktop Manager 窗口");
        });
      } catch (err) {
        console.error("[Tauri] 创建 Redis 窗口异常:", err);
        ElMessage.error("创建 Redis 窗口失败，请检查 Tauri 权限配置");
      }
    };

    const handleNavSelect = (key: string) => {
      // Redis 模块打开独立窗口
      if (key === "redis") {
        openRedisWindow();
        return;
      }

      activeNav.value = key;
      const mod = getModule(key);
      if (mod && mod.categories.length > 0) {
        activeCategory.value = mod.categories[0].key;
      }
    };

    const handleCategorySelect = (key: string) => {
      activeCategory.value = key;
    };

    /** 底部工具栏点击：创建独立 OS 级窗口 */
    const handleToolClick = async (key: string) => {
      console.log(`key = ${key}`);
      // 非 Tauri 环境（纯浏览器开发模式）降级为新标签页打开
      if (!isTauri()) {
        const hash = key === "settings" ? "/settings" : "/about";
        window.open(buildWindowUrl(hash), "_blank");
        return;
      }

      const windowLabel = key; // 'settings' 或 'about'

      try {
        // 检查窗口是否已存在
        const existingWin = await WebviewWindow.getByLabel(windowLabel);
        if (existingWin) {
          try {
            await existingWin.setFocus();
          } catch (err2) {
            // 聚焦失败，忽略
            console.log(err2);
          }
          return;
        }

        const windowConfig = key === "settings"
          ? {
              url: buildWindowUrl("/settings"),
              title: "设置 - Ran RS Desktop",
              width: 600,
              height: 500,
              resizable: true,
            }
          : {
              url: buildWindowUrl("/about"),
              title: "关于 - Ran RS Desktop",
              width: 420,
              height: 480,
              resizable: false,
            };

        const webview = new WebviewWindow(windowLabel, {
          ...windowConfig,
          center: true,
          minimizable: true,
          closable: true,
        });

        webview.once("tauri://error", (e) => {
          console.error("[Tauri] 窗口创建错误:", e);
          ElMessage.error(`无法打开${key === "settings" ? "设置" : "关于"}窗口`);
        });
      } catch (err) {
        console.error("[Tauri] 创建窗口异常:", err);
        ElMessage.error("创建窗口失败，请检查 Tauri 权限配置");
      }
    };

    // ===== 渲染主内容 =====
    const renderMainContent = () => {
      // 首页特殊处理（无注册模块）
      if (activeNav.value === "home") {
        return (
          <div class={nsPage.b()}>
            <h2 class={nsPage.e("title")}>首页</h2>
            <div class={nsPage.e("placeholder")}>
              <el-empty description="欢迎使用 Ran RS Desktop" />
            </div>
          </div>
        );
      }

      // 从注册表获取模块组件
      const mod = currentModule.value;
      if (!mod) {
        return null;
      }

      const Comp = mod.component;
      return <Comp activeCategory={activeCategory.value} />;
    };

    return () => (
      <Layout
        activeNav={activeNav.value}
        activeCategory={activeCategory.value}
        categories={categories.value}
        categoryTitle={categoryTitle.value}
        onNavSelect={handleNavSelect}
        onCategorySelect={handleCategorySelect}
        onToolClick={handleToolClick}
      >
        {renderMainContent()}
      </Layout>
    );
  },
});

export default App;
