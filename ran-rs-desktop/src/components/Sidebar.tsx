import { defineComponent, type PropType } from 'vue';
import {
  HomeFilled,
  Link as LinkIcon,
  Setting,
  InfoFilled,
  Monitor,
} from '@element-plus/icons-vue';

/** 导航项定义 */
export interface NavItem {
  key: string;
  label: string;
  icon: typeof HomeFilled;
}

/** 全局导航项列表 */
export const navItems: NavItem[] = [
  { key: 'home', label: '首页', icon: HomeFilled },
  { key: 'k8s', label: 'K8s 连接', icon: LinkIcon },
  { key: 'settings', label: '设置', icon: Setting },
  { key: 'about', label: '关于', icon: InfoFilled },
];

const Sidebar = defineComponent({
  name: 'Sidebar',
  props: {
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
    return () => (
      <div class="sidebar">
        <div class="sidebar-logo">
          <el-icon size={24} color="#fff">
            <Monitor />
          </el-icon>
        </div>
        <div class="sidebar-nav">
          {navItems.map((item) => (
            <el-tooltip
              key={item.key}
              content={item.label}
              placement="right"
              showAfter={300}
            >
              <div
                class={[
                  'sidebar-nav-item',
                  props.activeKey === item.key && 'is-active',
                ]}
                onClick={() => props.onSelect(item.key)}
              >
                <el-icon size={20}>
                  <item.icon />
                </el-icon>
              </div>
            </el-tooltip>
          ))}
        </div>
      </div>
    );
  },
});

export default Sidebar;
