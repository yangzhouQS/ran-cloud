/**
 * Set 类型数据编辑器
 *
 * 功能：
 * - 分页展示 Set 成员
 * - 添加/删除成员
 * - 搜索过滤
 *
 * @block ran-content-set
 */

import type { SetMember, SetPageParams } from "../../types";
import { Delete, Plus, Search } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, ref, watch } from "vue";
import { useCsNamespace } from "../../../layout/hooks/use-namespace";
import { redisDataSetAdd, redisDataSetDelete, redisDataSetPage } from "../../services/redis-commands";
import { useRedisStore } from "../../stores/redis-store";

const ContentSet = defineComponent({
  name: "ContentSet",
  setup() {
    const ns = useCsNamespace("content-set");
    const store = useRedisStore();

    const loading = ref(false);
    const items = ref<SetMember[]>([]);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(50);
    const searchPattern = ref("");

    const addVisible = ref(false);
    const addValue = ref("");

    function getKeyInfo() {
      const tab = store.activeTab;
      if (!tab || tab.type !== "key-detail") {
        return null;
      }
      return { connectionId: tab.connectionId, db: tab.db, key: tab.key! };
    }

    async function loadData() {
      const info = getKeyInfo();
      if (!info) {
        return;
      }

      loading.value = true;
      try {
        const params: SetPageParams = {
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          page: currentPage.value,
          pageSize: pageSize.value,
          pattern: searchPattern.value || undefined,
        };
        const result = await redisDataSetPage(params);
        items.value = result.items;
        total.value = result.total;
      } catch (e) {
        ElMessage.error(`加载 Set 数据失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        loading.value = false;
      }
    }

    function showAddDialog() {
      addValue.value = "";
      addVisible.value = true;
    }

    async function confirmAdd() {
      const info = getKeyInfo();
      if (!info || !addValue.value.trim()) {
        return;
      }

      try {
        await redisDataSetAdd({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          value: addValue.value,
        });
        ElMessage.success("添加成功");
        addVisible.value = false;
        loadData();
      } catch (e) {
        ElMessage.error(`添加失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    async function handleDelete(row: SetMember) {
      const info = getKeyInfo();
      if (!info) {
        return;
      }

      try {
        await ElMessageBox.confirm(
          `确定要删除成员 "${row.member}" 吗？`,
          "删除确认",
          { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
        );
        await redisDataSetDelete({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          field: row.member,
        });
        ElMessage.success("删除成功");
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
        if (store.keyDetail?.keyType === "set") {
          currentPage.value = 1;
          loadData();
        }
      },
      { immediate: true },
    );

    return () => {
      const info = getKeyInfo();
      if (!info) {
        return null;
      }

      return (
        <div class={ns.b()}>
          <div class={ns.e("toolbar")}>
            <div class={ns.e("search")}>
              <el-input
                v-model={searchPattern.value}
                placeholder="搜索成员..."
                prefixIcon={Search}
                size="small"
                clearable
                style={{ width: "200px" }}
                onClear={() => {
                  currentPage.value = 1;
                  loadData();
                }}
                onKeydown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    currentPage.value = 1;
                    loadData();
                  }
                }}
              />
            </div>
            <div class={ns.e("actions")}>
              <el-button size="small" type="primary" icon={Plus} onClick={showAddDialog}>添加成员</el-button>
              <el-button size="small" loading={loading.value} onClick={loadData}>刷新</el-button>
            </div>
          </div>

          <el-table data={items.value} v-loading={loading.value} stripe border max-height={500}>
            <el-table-column type="index" label="#" width={60} />
            <el-table-column prop="member" label="成员" min-width={400} show-overflow-tooltip />
            <el-table-column label="操作" width={80} fixed="right">
              {({ row }: { row: SetMember }) => (
                <el-button link type="danger" icon={Delete} onClick={() => handleDelete(row)} />
              )}
            </el-table-column>
          </el-table>

          {total.value > pageSize.value && (
            <div class={ns.e("pagination")}>
              <el-pagination
                currentPage={currentPage.value}
                pageSize={pageSize.value}
                total={total.value}
                layout="total, prev, pager, next"
                onUpdate:currentPage={handlePageChange}
              />
            </div>
          )}

          <el-dialog v-model={addVisible.value} title="添加成员" width="500px" append-to-body>
            <el-form label-width="80px">
              <el-form-item label="成员值">
                <el-input v-model={addValue.value} type="textarea" rows={4} placeholder="请输入成员值" />
              </el-form-item>
            </el-form>
            {{
              footer: () => (
                <div>
                  <el-button onClick={() => {
                    addVisible.value = false;
                  }}
                  >
                    取消
                  </el-button>
                  <el-button type="primary" onClick={confirmAdd}>确定</el-button>
                </div>
              ),
            }}
          </el-dialog>
        </div>
      );
    };
  },
});

export default ContentSet;
