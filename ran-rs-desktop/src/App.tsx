import { defineComponent, ref, computed, watch } from 'vue';
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
      // 切换主导航时，自动选中第一个分类
      const cats = getCategoriesByNav(key);
      if (cats.length > 0) {
        activeCategory.value = cats[0].key;
      }
    };

    const handleCategorySelect = (key: string) => {
      activeCategory.value = key;
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
        case 'settings':
          return (
            <div class="content-page">
              <h2 class="content-page-title">设置</h2>
              <div class="content-placeholder">
                <el-empty description="设置功能开发中..." />
              </div>
            </div>
          );
        case 'about':
          return (
            <div class="content-page">
              <h2 class="content-page-title">关于</h2>
              <div class="content-placeholder">
                <el-empty description="Ran RS Desktop v0.1.0" />
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
      >
        {renderMainContent()}
      </Layout>
    );
  },
});

export default App;
