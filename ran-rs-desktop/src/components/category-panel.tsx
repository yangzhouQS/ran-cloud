import { defineComponent, type PropType } from 'vue';
import {
  Connection,
  Refresh,
  SwitchButton,
  Monitor,
  Setting,
  Document,
  Grid,
} from '@element-plus/icons-vue';
import { useCsNamespace } from '../hooks/use-namespace';
import './category-panel.less';

/** 分类项定义 */
export interface CategoryItem {
  key: string;
  label: string;
  icon: typeof Connection;
  description?: string;
}

/** K8s 连接分类 */
export const k8sCategories: CategoryItem[] = [
  { key: 'connect', label: '连接管理', icon: Connection, description: 'Telepresence 连接/断开' },
  { key: 'status', label: '状态监控', icon: Monitor, description: '查看连接状态' },
  { key: 'config', label: '配置管理', icon: Setting, description: '连接参数配置' },
  { key: 'logs', label: '操作日志', icon: Document, description: '查看操作记录' },
];

/** 首页分类 */
export const homeCategories: CategoryItem[] = [
  { key: 'overview', label: '总览', icon: Grid, description: '系统概览' },
  { key: 'quick', label: '快速操作', icon: Connection, description: '常用快捷操作' },
];

/** 设置分类 */
export const settingsCategories: CategoryItem[] = [
  { key: 'general', label: '通用设置', icon: Setting, description: '基本参数' },
  { key: 'k8s-config', label: 'K8s 配置', icon: Document, description: 'Kubernetes 配置' },
];

/** 关于分类 */
export const aboutCategories: CategoryItem[] = [
  { key: 'info', label: '关于应用', icon: Document, description: '版本信息' },
];

/** 根据主导航 key 获取分类列表 */
export function getCategoriesByNav(navKey: string): CategoryItem[] {
  switch (navKey) {
    case 'home':
      return homeCategories;
    case 'k8s':
      return k8sCategories;
    case 'settings':
      return settingsCategories;
    case 'about':
      return aboutCategories;
    default:
      return [];
  }
}

/** 根据主导航 key 获取面板标题 */
export function getCategoryTitle(navKey: string): string {
  switch (navKey) {
    case 'home':
      return '首页';
    case 'k8s':
      return 'K8s 连接';
    case 'settings':
      return '设置';
    case 'about':
      return '关于';
    default:
      return '';
  }
}

const CategoryPanel = defineComponent({
  name: 'CategoryPanel',
  props: {
    categories: {
      type: Array as PropType<CategoryItem[]>,
      required: true,
    },
    title: {
      type: String,
      default: '',
    },
    activeKey: {
      type: String,
      required: true,
    },
    onSelect: {
      type: Function as PropType<(key: string) => void>,
      required: true,
    },
  },
  setup(props) {
    const ns = useCsNamespace('category');

    return () => (
      <div class={ns.b()}>
        {props.title && (
          <div class={ns.e('title')}>{props.title}</div>
        )}
        <div class={ns.e('list')}>
          {props.categories.map((item) => (
            <div
              key={item.key}
              class={[
                ns.e('item'),
                props.activeKey === item.key && ns.is('active'),
              ]}
              onClick={() => props.onSelect(item.key)}
            >
              <el-icon size={16} class={ns.e('item-icon')}>
                <item.icon />
              </el-icon>
              <div class={ns.e('item-content')}>
                <span class={ns.e('item-label')}>{item.label}</span>
                {item.description && (
                  <span class={ns.e('item-desc')}>{item.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
});

export default CategoryPanel;
