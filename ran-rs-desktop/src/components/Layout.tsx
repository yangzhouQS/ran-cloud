import { defineComponent, type PropType } from 'vue';
import Sidebar from './sidebar';
import CategoryPanel, { type CategoryItem } from './category-panel';

const Layout = defineComponent({
  name: 'Layout',
  props: {
    activeNav: { type: String, required: true },
    activeCategory: { type: String, required: true },
    categories: { type: Array as PropType<CategoryItem[]>, required: true },
    categoryTitle: { type: String, default: '' },
    onNavSelect: { type: Function as PropType<(key: string) => void>, required: true },
    onCategorySelect: { type: Function as PropType<(key: string) => void>, required: true },
    onToolClick: { type: Function as PropType<(key: string) => void>, required: true },
  },
  setup(props, { slots }) {
    return () => (
      <div class="app-layout">
        <Sidebar
          activeKey={props.activeNav}
          onSelect={props.onNavSelect}
          onToolClick={props.onToolClick}
        />
        <CategoryPanel
          categories={props.categories}
          title={props.categoryTitle}
          activeKey={props.activeCategory}
          onSelect={props.onCategorySelect}
        />
        <div class="main-content">
          {slots.default?.()}
        </div>
      </div>
    );
  },
});

export default Layout;
