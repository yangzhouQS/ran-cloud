/**
 * Hash 类型数据编辑器
 *
 * 功能：
 * - 分页展示 Hash 字段和值
 * - 添加/编辑/删除字段
 * - 字段搜索过滤
 *
 * @block ran-content-hash
 */

import { Delete, Edit, Plus, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { defineComponent, ref, watch } from 'vue';
import { useCsNamespace } from '../../../../hooks/use-namespace';
import { useRedisStore } from '../../stores/redis-store';
import type { HashField, HashPageParams } from '../../types';
import { redisDataHashPage, redisDataHashAdd, redisDataHashUpdate, redisDataHashDelete } from '../../services/redis-commands';

const ContentHash = defineComponent({
  name: 'ContentHash',
  setup() {
    const ns = useCsNamespace('content-hash');
    const store = useRedisStore();

    const loading = ref(false);
    const items = ref<HashField[]>([]);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(50);
    const searchPattern = ref('');

    // 添加/编辑对话框
    const dialogVisible = ref(false);
    const dialogMode = ref<'add' | 'edit'>('add');
    const dialogField = ref('');
    const dialogValue = ref('');
    const dialogOldField = ref('');

    function getKeyInfo() {
      const tab = store.activeTab;
      if (!tab || tab.type !== 'key-detail') return null;
      return { connectionId: tab.connectionId, db: tab.db, key: tab.key! };
    }

    /** 加载 Hash 数据 */
    async function loadData() {
      const info = getKeyInfo();
      if (!info) return;

      loading.value = true;
      try {
        const params: HashPageParams = {
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          page: currentPage.value,
          pageSize: pageSize.value,
          pattern: searchPattern.value || undefined,
        };
        const result = await redisDataHashPage(params);
        items.value = result.items;
        total.value = result.total;
      } catch (e) {
        ElMessage.error(`加载 Hash 数据失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        loading.value = false;
      }
    }

    /** 打开添加对话框 */
    function showAddDialog() {
      dialogMode.value = 'add';
      dialogField.value = '';
      dialogValue.value = '';
      dialogOldField.value = '';
      dialogVisible.value = true;
    }

    /** 打开编辑对话框 */
    function showEditDialog(row: HashField) {
      dialogMode.value = 'edit';
      dialogField.value = row.field;
      dialogValue.value = row.value;
      dialogOldField.value = row.field;
      dialogVisible.value = true;
    }

    /** 确认添加/编辑 */
    async function confirmDialog() {
      const info = getKeyInfo();
      if (!info || !dialogField.value.trim()) return;

      try {
        if (dialogMode.value === 'add') {
          await redisDataHashAdd({
            connectionId: info.connectionId,
            db: info.db,
            key: info.key,
            field: dialogField.value.trim(),
            value: dialogValue.value,
          });
          ElMessage.success('字段添加成功');
        } else {
          await redisDataHashUpdate({
            connectionId: info.connectionId,
            db: info.db,
            key: info.key,
            field: dialogField.value.trim(),
            oldField: dialogOldField.value,
            value: dialogValue.value,
          });
          ElMessage.success('字段更新成功');
        }
        dialogVisible.value = false;
        loadData();
      } catch (e) {
        ElMessage.error(`操作失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    /** 删除字段 */
    async function handleDelete(row: HashField) {
      const info = getKeyInfo();
      if (!info) return;

      try {
        await ElMessageBox.confirm(
          `确定要删除字段 "${row.field}" 吗？`,
          '删除确认',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
        );
        await redisDataHashDelete({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          fields: [row.field],
        });
        ElMessage.success('删除成功');
        loadData();
      } catch {
        // 用户取消
      }
    }

    /** 分页变化 */
    function handlePageChange(page: number) {
      currentPage.value = page;
      loadData();
    }

    // 监听 key 变化自动加载
    watch(
      () => [store.activeTabId, store.keyDetail?.key],
      () => {
        if (store.keyDetail?.keyType === 'hash') {
          currentPage.value = 1;
          loadData();
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
            <div class={ns.e('search')}>
              <el-input
                v-model={searchPattern.value}
                placeholder="搜索字段..."
                prefixIcon={Search}
                size="small"
                clearable
                style={{ width: '200px' }}
                onClear={() => { currentPage.value = 1; loadData(); }}
                onKeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { currentPage.value = 1; loadData(); } }}
              />
            </div>
            <div class={ns.e('actions')}>
              <el-button size="small" type="primary" icon={Plus} onClick={showAddDialog}>
                添加字段
              </el-button>
              <el-button size="small" loading={loading.value} onClick={loadData}>
                刷新
              </el-button>
            </div>
          </div>

          {/* 数据表格 */}
          <el-table
            data={items.value}
            v-loading={loading.value}
            stripe
            border
            max-height={500}
            style={{ width: '100%' }}
          >
            <el-table-column prop="field" label="字段" min-width={200} show-overflow-tooltip />
            <el-table-column prop="value" label="值" min-width={300} show-overflow-tooltip />
            <el-table-column label="操作" width={120} fixed="right">
              {({ row }: { row: HashField }) => (
                <div>
                  <el-button link type="primary" icon={Edit} onClick={() => showEditDialog(row)} />
                  <el-button link type="danger" icon={Delete} onClick={() => handleDelete(row)} />
                </div>
              )}
            </el-table-column>
          </el-table>

          {/* 分页 */}
          {total.value > pageSize.value && (
            <div class={ns.e('pagination')}>
              <el-pagination
                currentPage={currentPage.value}
                pageSize={pageSize.value}
                total={total.value}
                layout="total, prev, pager, next"
                onUpdate:currentPage={handlePageChange}
              />
            </div>
          )}

          {/* 添加/编辑对话框 */}
          <el-dialog
            v-model={dialogVisible.value}
            title={dialogMode.value === 'add' ? '添加字段' : '编辑字段'}
            width="500px"
            append-to-body
          >
            <el-form label-width="80px">
              <el-form-item label="字段名">
                <el-input
                  v-model={dialogField.value}
                  placeholder="请输入字段名"
                  disabled={dialogMode.value === 'edit'}
                />
              </el-form-item>
              <el-form-item label="值">
                <el-input
                  v-model={dialogValue.value}
                  type="textarea"
                  rows={6}
                  placeholder="请输入值"
                />
              </el-form-item>
            </el-form>
            {{
              footer: () => (
                <div>
                  <el-button onClick={() => { dialogVisible.value = false; }}>取消</el-button>
                  <el-button type="primary" onClick={confirmDialog}>确定</el-button>
                </div>
              ),
            }}
          </el-dialog>
        </div>
      );
    };
  },
});

export default ContentHash;
