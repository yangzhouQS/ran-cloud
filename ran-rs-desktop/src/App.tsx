import { defineComponent, ref, computed } from 'vue';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ElMessage } from 'element-plus';
import Layout from './components/Layout';
import { getCategoriesByNav, getCategoryTitle } from './components/CategoryPanel';
import TelepresencePanel from './components/TelepresencePanel';

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
      const windowLabel = key; // 'settings' 或 'about'

      // 检查窗口是否已存在
      const existingWin = WebviewWindow.getByLabel(windowLabel);
      if (existingWin) {
        // 窗口已存在，聚焦它
        try {
          await existingWin.setFocus();
        } catch {
          // 聚焦失败，忽略
        }
        return;
      }

      try {
        if (key === 'settings') {
          const webview = new WebviewWindow(windowLabel, {
            url: '/#/settings',
            title: '设置 - Ran RS Desktop',
            width: 600,
            height: 500,
            center: true,
            resizable: true,
            minimizable: true,
            closable: true,
          });
          webview.once('tauri://error', () => {
            ElMessage.error('无法打开设置窗口');
          });
        } else if (key === 'about') {
          const webview = new WebviewWindow(windowLabel, {
            url: '/#/about',
            title: '关于 - Ran RS Desktop',
            width: 420,
            height: 480,
            center: true,
            resizable: false,
            minimizable: true,
            closable: true,
          });
          webview.once('tauri://error', () => {
            ElMessage.error('无法打开关于窗口');
          });
        }
      } catch {
        ElMessage.error('创建窗口失败');
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
