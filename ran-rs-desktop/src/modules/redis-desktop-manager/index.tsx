import { defineComponent } from 'vue';
import { Coin } from '@element-plus/icons-vue';
import { useCsNamespace } from '../../hooks/use-namespace';
import './index.less';

/**
 * Redis Desktop Manager 模块入口组件
 * 作为独立窗口的页面渲染
 */
const RedisDesktopManager = defineComponent({
  name: 'RedisDesktopManager',
  setup() {
    const ns = useCsNamespace('redis');

    return () => (
      <div class={ns.b()}>
        {/* 顶部标题栏 */}
        <div class={ns.e('header')}>
          <div class={ns.e('header-title')}>
            <el-icon size={20} color="#409eff">
              <Coin />
            </el-icon>
            <span>Redis Desktop Manager</span>
          </div>
        </div>

        {/* 主体内容 */}
        <div class={ns.e('body')}>
          <div class={ns.e('empty')}>
            <el-empty description="Redis Desktop Manager">
              <el-text type="info" size="small">
                连接管理功能即将上线，敬请期待...
              </el-text>
            </el-empty>
          </div>
        </div>
      </div>
    );
  },
});

export default RedisDesktopManager;
