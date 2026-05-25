import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ElMessage } from "element-plus";
import { computed, defineComponent, ref } from "vue";
import { Json2TsPanel } from "./modules/develop-tools/json2ts";
import { TelepresencePanel } from "./modules/develop-tools/telepresence";
import { getCategoriesByNav, getCategoryTitle } from "./modules/layout/components/category-panel";
import Layout from "./modules/layout/components/Layout";
import { useCsNamespace } from "./modules/layout/hooks/use-namespace";
import SqlStudio from "./modules/sql-studio";
import "./modules/layout/components/layout.less";

/** 检测是否运行在 Tauri 环境中 */
const isTauri = () => "__TAURI_INTERNALS__" in window;

/**
 * 构建模块 URL（基于独立 HTML 页面）
 * 在 dev 环境下使用 /模块名.html，在 Tauri 生产环境中使用相对路径
 */
function buildModuleUrl(moduleName: string) {
  const base = window.location.origin + window.location.pathname;
  const basePath = base.substring(0, base.lastIndexOf("/") + 1);
  return `${basePath}${moduleName}.html`;
}

const App = defineComponent({
  name: "App",
  setup() {
    // ===== BEM 命名空间 =====
    const nsPage = useCsNamespace("content-page");

    // ===== 导航状态 =====
    const activeNav = ref("k8s");
    const activeCategory = ref("k8s-network-tools");

    // ===== 计算属性 =====
    const categories = computed(() => getCategoriesByNav(activeNav.value));
    const categoryTitle = computed(() => getCategoryTitle(activeNav.value));

    // ===== 事件处理 =====

    /** 打开 Redis Desktop Manager 独立窗口 */
    const openRedisWindow = async () => {
      if (!isTauri()) {
        window.open(buildModuleUrl("redis"), "_blank");
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
          url: buildModuleUrl("redis"),
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
      const cats = getCategoriesByNav(key);
      if (cats.length > 0) {
        activeCategory.value = cats[0].key;
      }
    };

    const handleCategorySelect = (key: string) => {
      activeCategory.value = key;
    };

    /** 底部工具栏点击：创建独立 OS 级窗口 */
    const handleToolClick = async (key: string) => {
      // 非 Tauri 环境（纯浏览器开发模式）降级为新标签页打开
      if (!isTauri()) {
        window.open(buildModuleUrl(key), "_blank");
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
            console.log(err2);
          }
          return;
        }

        const windowConfig = key === "settings"
          ? {
              url: buildModuleUrl("settings"),
              title: "设置 - Ran RS Desktop",
              width: 600,
              height: 500,
              resizable: true,
            }
          : {
              url: buildModuleUrl("about"),
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
      switch (activeNav.value) {
        case "k8s":
          switch (activeCategory.value) {
            case "json2ts":
              return <Json2TsPanel />;
            default:
              return <TelepresencePanel />;
          }
        case "database":
          return <SqlStudio />;
        case "home":
          return (
            <div class={nsPage.b()}>
              <h2 class={nsPage.e("title")}>首页</h2>
              <div class={nsPage.e("placeholder")}>
                <el-empty description="欢迎使用 Ran RS Desktop" />
              </div>
            </div>
          );
        default:
          return null;
      }
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
