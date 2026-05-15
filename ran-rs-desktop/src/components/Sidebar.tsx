import { defineComponent, type PropType } from 'vue';
import {
  HomeFilled,
  Link as LinkIcon,
  Setting,
  InfoFilled,
  Monitor,
} from '@element-plus/icons-vue';
import iconRedis from '../assets/images/icon-redis.jpeg';
import { useCsNamespace } from '../hooks/use-namespace';
import './sidebar.less';

/** 主导航项（顶部） */
export interface NavItem {
  key: string;
  label: string;
  icon?: typeof HomeFilled;
  /** 自定义图片图标（优先于 icon） */
  iconSrc?: string;
}

/** 底部工具项 */
export interface ToolItem {
  key: string;
  label: string;
  icon: typeof HomeFilled;
}

/** 主导航项 */
export const navItems: NavItem[] = [
  { key: 'home', label: '首页', icon: HomeFilled },
  { key: 'k8s', label: 'K8s 连接', icon: LinkIcon },
  { key: 'redis', label: 'Redis', iconSrc: iconRedis },
];

/** 底部工具项 */
export const toolItems: ToolItem[] = [
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
    onToolClick: {
      type: Function as PropType<(key: string) => void>,
      required: true,
    },
  },
  setup(props) {
    const ns = useCsNamespace('sidebar');

    return () => (
      <div class={ns.b()}>
        {/* Logo */}
        <div class={ns.e('logo')}>
          <el-icon size={24} color="#fff">
            <Monitor />
          </el-icon>
        </div>

        {/* 主导航（顶部） */}
        <div class={ns.e('nav')}>
          {navItems.map((item) => (
            <el-tooltip
              key={item.key}
              content={item.label}
              placement="right"
              showAfter={300}
            >
              <div
                class={[
                  ns.e('item'),
                  props.activeKey === item.key && ns.is('active'),
                ]}
                onClick={() => props.onSelect(item.key)}
              >
                {item.iconSrc ? (
                  <img src={item.iconSrc} class={ns.e('icon-img')} alt={item.label} />
                ) : (
                  <el-icon size={20}>
                    <item.icon />
                  </el-icon>
                )}
              </div>
            </el-tooltip>
          ))}
        </div>

        {/* 底部工具栏 */}
        <div class={ns.e('tools')}>
          {toolItems.map((item) => (
            <el-tooltip
              key={item.key}
              content={item.label}
              placement="right"
              showAfter={300}
            >
              <div
                class={ns.e('item')}
                onClick={() => props.onToolClick(item.key)}
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
