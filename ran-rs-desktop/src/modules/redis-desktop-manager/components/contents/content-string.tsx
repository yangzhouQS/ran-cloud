/**
 * String 类型数据编辑器
 *
 * 功能：
 * - 显示/编辑 String 值（大文本区域）
 * - 保存按钮
 * - 字符长度和编码信息
 *
 * @block ran-content-string
 */

import { ElMessage } from 'element-plus';
import { defineComponent, ref, watch } from 'vue';
import { useCsNamespace } from '../../../../hooks/use-namespace';
import { useRedisStore } from '../../stores/redis-store';
import { redisDataStringGet, redisDataStringSet } from '../../services/redis-commands';

const ContentString = defineComponent({
  name: 'ContentString',
  setup() {
    const ns = useCsNamespace('content-string');
    const store = useRedisStore();

    const loading = ref(false);
    const saving = ref(false);
    const stringValue = ref('');
    const originalValue = ref('');
    const encoding = ref('');
    const valueLength = ref(0);

    /** 当前 key 信息 */
    function getKeyInfo() {
      const tab = store.activeTab;
      if (!tab || tab.type !== 'key-detail') return null;
      return {
        connectionId: tab.connectionId,
        db: tab.db,
        key: tab.key!,
      };
    }

    /** 加载 String 值 */
    async function loadValue() {
      const info = getKeyInfo();
      if (!info) return;

      loading.value = true;
      try {
        const result = await redisDataStringGet(info.connectionId, info.db, info.key);
        stringValue.value = result.value;
        originalValue.value = result.value;
        encoding.value = result.encoding;
        valueLength.value = result.length;
      } catch (e) {
        ElMessage.error(`加载 String 值失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        loading.value = false;
      }
    }

    /** 保存 String 值 */
    async function saveValue() {
      const info = getKeyInfo();
      if (!info) return;

      saving.value = true;
      try {
        await redisDataStringSet(info.connectionId, info.db, info.key, stringValue.value);
        originalValue.value = stringValue.value;
        ElMessage.success('保存成功');
      } catch (e) {
        ElMessage.error(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        saving.value = false;
      }
    }

    /** 是否已修改 */
    function isModified(): boolean {
      return stringValue.value !== originalValue.value;
    }

    // 监听 key 变化自动加载
    watch(
      () => [store.activeTabId, store.keyDetail?.key],
      () => {
        if (store.keyDetail?.keyType === 'string') {
          loadValue();
        }
      },
      { immediate: true },
    );

    return () => {
      const info = getKeyInfo();
      if (!info) return null;

      return (
        <div class={ns.b()}>
          {/* 工具栏 */}
          <div class={ns.e('toolbar')}>
            <div class={ns.e('info')}>
              <span>长度: {valueLength.value}</span>
              <span>编码: {encoding.value}</span>
            </div>
            <div class={ns.e('actions')}>
              <el-button
                size="small"
                loading={loading.value}
                onClick={loadValue}
              >
                刷新
              </el-button>
              <el-button
                size="small"
                type="primary"
                loading={saving.value}
                disabled={!isModified()}
                onClick={saveValue}
              >
                保存
              </el-button>
            </div>
          </div>

          {/* 编辑区域 */}
          <div class={ns.e('editor')}>
            <el-input
              v-model={stringValue.value}
              type="textarea"
              rows={16}
              placeholder="String 值"
              resize="vertical"
            />
          </div>
        </div>
      );
    };
  },
});

export default ContentString;
