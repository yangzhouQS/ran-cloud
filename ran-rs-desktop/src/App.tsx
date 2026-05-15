import { defineComponent, ref, computed } from 'vue';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ElMessage } from 'element-plus';
import Layout from './components/Layout';
import { getCategoriesByNav, getCategoryTitle } from './components/CategoryPanel';
import TelepresencePanel from './components/TelepresencePanel';

/** 检测是否运行在 Tauri 环境中 */
const isTauri = () => '__TAURI_INTERNALS__' in window;

/** 构建新窗口的 URL（基于当前页面地址，替换 hash 部分） */
const buildWindowUrl = (hash: string) => {
  const base = window.location.href.split('#')[0];
  return base + '#' + hash;
};

const App = defineComponent({
  name: 'App',
  setup() {
    // ===== 导航状态 =====
    const activeNav = ref('k8s');
    const activeCategory = ref('connect');

    // ===== 计算属性 =====
    const categories = computed(() => getCategoriesByNav(activeNav.value));
    const categoryTitle = computed(() => getCategoryTitle(activeNav.value));

    // ===== 事件处理 =====
    const handleNavSelect = (key: string) => {
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
	    console.log(`key = ${key}`);
      // 非 Tauri 环境（纯浏览器开发模式）降级为新标签页打开
      if (!isTauri()) {
        const hash = key === 'settings' ? '/settings' : '/about';
        window.open(buildWindowUrl(hash), '_blank');
        return;
      }

      const windowLabel = key; // 'settings' 或 'about'

      try {
        // 检查窗口是否已存在
        const existingWin = await WebviewWindow.getByLabel(windowLabel);
        if (existingWin) {
          try {
            await existingWin.setFocus();
          } catch (err2){
            // 聚焦失败，忽略
	          console.log(err2);
          }
          return;
        }

        const windowConfig = key === 'settings'
          ? {
              url: buildWindowUrl('/settings'),
              title: '设置 - Ran RS Desktop',
              width: 600,
              height: 500,
              resizable: true,
            }
          : {
              url: buildWindowUrl('/about'),
              title: '关于 - Ran RS Desktop',
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

        webview.once('tauri://error', (e) => {
          console.error('[Tauri] 窗口创建错误:', e);
          ElMessage.error(`无法打开${key === 'settings' ? '设置' : '关于'}窗口`);
        });
      } catch (err) {
        console.error('[Tauri] 创建窗口异常:', err);
        ElMessage.error('创建窗口失败，请检查 Tauri 权限配置');
      }
    };

    // ===== 渲染主内容 =====
    const renderMainContent = () => {
      switch (activeNav.value) {
        case 'k8s':
          return <TelepresencePanel activeCategory={activeCategory.value} />;
        case 'home':
          return (
            <div class="content-page">
              <h2 class="content-page-title">首页</h2>
              <div class="content-placeholder">
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
