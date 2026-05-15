import { defineComponent, type PropType } from 'vue';
import Sidebar from './Sidebar';
import CategoryPanel, { type CategoryItem } from './CategoryPanel';

const Layout = defineComponent({
  name: 'Layout',
  props: {
    /** 当前选中的主导航 key */
    activeNav: {
      type: String,
      required: true,
    },
    /** 当前选中的分类 key */
    activeCategory: {
      type: String,
      required: true,
    },
    /** 分类列表 */
    categories: {
      type: Array as PropType<CategoryItem[]>,
      required: true,
    },
    /** 分类面板标题 */
    categoryTitle: {
      type: String,
      default: '',
    },
    /** 主导航切换回调 */
    onNavSelect: {
      type: Function as PropType<(key: string) => void>,
      required: true,
    },
    /** 分类切换回调 */
    onCategorySelect: {
      type: Function as PropType<(key: string) => void>,
      required: true,
    },
  },
  setup(props, { slots }) {
    return () => (
      <div class="app-layout">
        {/* 第一栏：全局导航侧边栏 */}
        <Sidebar
          activeKey={props.activeNav}
          onSelect={props.onNavSelect}
        />

        {/* 第二栏：二级分类列表 */}
        <CategoryPanel
          categories={props.categories}
          title={props.categoryTitle}
          activeKey={props.activeCategory}
          onSelect={props.onCategorySelect}
        />

        {/* 第三栏：主内容详情 */}
        <div class="main-content">
          {slots.default?.()}
        </div>
      </div>
    );
  },
});

export default Layout;
