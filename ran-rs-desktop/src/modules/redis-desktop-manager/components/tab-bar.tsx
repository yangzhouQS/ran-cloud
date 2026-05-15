/**
 * 标签栏组件
 *
 * 管理多标签页切换，支持：
 * - 状态页、CLI、Key 详情、慢日志、命令日志等标签类型
 * - 关闭标签、关闭其他标签
 * - 右键菜单
 *
 * @block ran-tab-bar
 */

import { Close } from '@element-plus/icons-vue';
import { defineComponent } from 'vue';
import { useCsNamespace } from '../../../hooks/use-namespace';
import { useRedisStore } from '../stores/redis-store';
import './tab-bar.less';

/** 标签类型图标映射 */
const tabTypeIcon: Record<string, string> = {
  'status': 'Monitor',
  'cli': 'Monitor',
  'key-detail': 'Key',
  'slow-log': 'Timer',
  'memory-analysis': 'DataAnalysis',
  'command-log': 'Document',
};

const TabBar = defineComponent({
  name: 'TabBar',
  setup() {
    const ns = useCsNamespace('tab-bar');
    const store = useRedisStore();

    /** 渲染标签项 */
    const renderTab = (tab: import('../stores/redis-store').TabItem) => {
      const isActive = store.activeTabId === tab.id;

      return (
        <div
          key={tab.id}
          class={[
            ns.e('item'),
            isActive && ns.is('active'),
          ]}
          onClick={() => { store.activeTabId = tab.id; }}
        >
          <span class={ns.e('item-title')}>{tab.title}</span>
          {tab.closable && (
            <span
              class={ns.e('item-close')}
              onClick={(e: Event) => {
                e.stopPropagation();
                store.closeTab(tab.id);
              }}
            >
              <el-icon size={12}><Close /></el-icon>
            </span>
          )}
        </div>
      );
    };

    return () => (
      <div class={ns.b()}>
        <div class={ns.e('list')}>
          {store.tabs.map(tab => renderTab(tab))}
        </div>
      </div>
    );
  },
});

export default TabBar;
