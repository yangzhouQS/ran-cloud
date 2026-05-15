/**
 * List 类型数据编辑器
 *
 * 功能：
 * - 分页展示 List 元素（索引 + 值）
 * - LPUSH/RPUSH 添加元素
 * - LSET 按索引更新
 * - LREM 删除元素
 *
 * @block ran-content-list
 */

import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { defineComponent, ref, watch } from 'vue';
import { useCsNamespace } from '../../../../hooks/use-namespace';
import { useRedisStore } from '../../stores/redis-store';
import type { ListEntry, ListPageParams } from '../../types';
import { redisDataListPage, redisDataListAdd, redisDataListUpdate, redisDataListDelete } from '../../services/redis-commands';

const ContentList = defineComponent({
  name: 'ContentList',
  setup() {
    const ns = useCsNamespace('content-list');
    const store = useRedisStore();

    const loading = ref(false);
    const items = ref<ListEntry[]>([]);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(50);

    // 添加对话框
    const addVisible = ref(false);
    const addValue = ref('');
    const addPosition = ref<'left' | 'right'>('right');

    // 编辑对话框
    const editVisible = ref(false);
    const editIndex = ref(0);
    const editValue = ref('');

    function getKeyInfo() {
      const tab = store.activeTab;
      if (!tab || tab.type !== 'key-detail') return null;
      return { connectionId: tab.connectionId, db: tab.db, key: tab.key! };
    }

    async function loadData() {
      const info = getKeyInfo();
      if (!info) return;

      loading.value = true;
      try {
        const params: ListPageParams = {
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          page: currentPage.value,
          pageSize: pageSize.value,
        };
        const result = await redisDataListPage(params);
        items.value = result.items;
        total.value = result.total;
      } catch (e) {
        ElMessage.error(`加载 List 数据失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        loading.value = false;
      }
    }

    function showAddDialog() {
      addValue.value = '';
      addPosition.value = 'right';
      addVisible.value = true;
    }

    async function confirmAdd() {
      const info = getKeyInfo();
      if (!info || !addValue.value.trim()) return;

      try {
        await redisDataListAdd({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          value: addValue.value,
          position: addPosition.value,
        });
        ElMessage.success('添加成功');
        addVisible.value = false;
        loadData();
      } catch (e) {
        ElMessage.error(`添加失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    function showEditDialog(row: ListEntry) {
      editIndex.value = row.index;
      editValue.value = row.value;
      editVisible.value = true;
    }

    async function confirmEdit() {
      const info = getKeyInfo();
      if (!info) return;

      try {
        await redisDataListUpdate({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          field: String(editIndex.value),
          index: editIndex.value,
          value: editValue.value,
        });
        ElMessage.success('更新成功');
        editVisible.value = false;
        loadData();
      } catch (e) {
        ElMessage.error(`更新失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    async function handleDelete(row: ListEntry) {
      const info = getKeyInfo();
      if (!info) return;

      try {
        await ElMessageBox.confirm(
          `确定要删除索引 ${row.index} 的元素吗？`,
          '删除确认',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
        );
        await redisDataListDelete({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          value: row.value,
          count: 1,
        });
        ElMessage.success('删除成功');
        loadData();
      } catch {
        // 用户取消
      }
    }

    function handlePageChange(page: number) {
      currentPage.value = page;
      loadData();
    }

    watch(
      () => [store.activeTabId, store.keyDetail?.key],
      () => {
        if (store.keyDetail?.keyType === 'list') {
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
          <div class={ns.e('toolbar')}>
            <span class={ns.e('total')}>共 {total.value} 个元素</span>
            <div class={ns.e('actions')}>
              <el-button size="small" type="primary" icon={Plus} onClick={showAddDialog}>添加</el-button>
              <el-button size="small" loading={loading.value} onClick={loadData}>刷新</el-button>
            </div>
          </div>

          <el-table data={items.value} v-loading={loading.value} stripe border max-height={500}>
            <el-table-column prop="index" label="索引" width={80} />
            <el-table-column prop="value" label="值" min-width={400} show-overflow-tooltip />
            <el-table-column label="操作" width={120} fixed="right">
              {({ row }: { row: ListEntry }) => (
                <div>
                  <el-button link type="primary" icon={Edit} onClick={() => showEditDialog(row)} />
                  <el-button link type="danger" icon={Delete} onClick={() => handleDelete(row)} />
                </div>
              )}
            </el-table-column>
          </el-table>

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

          {/* 添加对话框 */}
          <el-dialog v-model={addVisible.value} title="添加元素" width="500px" append-to-body>
            <el-form label-width="80px">
              <el-form-item label="插入位置">
                <el-radio-group v-model={addPosition.value}>
                  <el-radio value="left">左侧 (LPUSH)</el-radio>
                  <el-radio value="right">右侧 (RPUSH)</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="值">
                <el-input v-model={addValue.value} type="textarea" rows={4} placeholder="请输入值" />
              </el-form-item>
            </el-form>
            {{
              footer: () => (
                <div>
                  <el-button onClick={() => { addVisible.value = false; }}>取消</el-button>
                  <el-button type="primary" onClick={confirmAdd}>确定</el-button>
                </div>
              ),
            }}
          </el-dialog>

          {/* 编辑对话框 */}
          <el-dialog v-model={editVisible.value} title="编辑元素" width="500px" append-to-body>
            <el-form label-width="80px">
              <el-form-item label="索引">
                <el-input-number v-model={editIndex.value} disabled />
              </el-form-item>
              <el-form-item label="值">
                <el-input v-model={editValue.value} type="textarea" rows={4} />
              </el-form-item>
            </el-form>
            {{
              footer: () => (
                <div>
                  <el-button onClick={() => { editVisible.value = false; }}>取消</el-button>
                  <el-button type="primary" onClick={confirmEdit}>确定</el-button>
                </div>
              ),
            }}
          </el-dialog>
        </div>
      );
    };
  },
});

export default ContentList;
