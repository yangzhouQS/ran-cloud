/**
 * ZSet（有序集合）类型数据编辑器
 *
 * 功能：
 * - 分页展示 ZSet 成员（成员 + 分值）
 * - 添加/更新/删除成员
 * - 正序/倒序排列切换
 *
 * @block ran-content-zset
 */

import type { ZSetEntry, ZSetPageParams } from "../../types";
import { Delete, Edit, Plus, Search, Sort } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, ref, watch } from "vue";
import { useCsNamespace } from "../../../../hooks/use-namespace";
import { redisDataZsetAdd, redisDataZsetDelete, redisDataZsetPage, redisDataZsetUpdate } from "../../services/redis-commands";
import { useRedisStore } from "../../stores/redis-store";

const ContentZset = defineComponent({
  name: "ContentZset",
  setup() {
    const ns = useCsNamespace("content-zset");
    const store = useRedisStore();

    const loading = ref(false);
    const items = ref<ZSetEntry[]>([]);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(50);
    const reverse = ref(false);
    const searchPattern = ref("");

    // 添加/编辑对话框
    const dialogVisible = ref(false);
    const dialogMode = ref<"add" | "edit">("add");
    const dialogMember = ref("");
    const dialogScore = ref(0);

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
        const params: ZSetPageParams = {
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          page: currentPage.value,
          pageSize: pageSize.value,
          reverse: reverse.value,
          pattern: searchPattern.value || undefined,
        };
        const result = await redisDataZsetPage(params);
        items.value = result.items;
        total.value = result.total;
      } catch (e) {
        ElMessage.error(`加载 ZSet 数据失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        loading.value = false;
      }
    }

    function showAddDialog() {
      dialogMode.value = "add";
      dialogMember.value = "";
      dialogScore.value = 0;
      dialogVisible.value = true;
    }

    function showEditDialog(row: ZSetEntry) {
      dialogMode.value = "edit";
      dialogMember.value = row.member;
      dialogScore.value = row.score;
      dialogVisible.value = true;
    }

    async function confirmDialog() {
      const info = getKeyInfo();
      if (!info || !dialogMember.value.trim()) {
        return;
      }

      try {
        if (dialogMode.value === "add") {
          await redisDataZsetAdd({
            connectionId: info.connectionId,
            db: info.db,
            key: info.key,
            member: dialogMember.value,
            score: dialogScore.value,
          });
          ElMessage.success("添加成功");
        } else {
          await redisDataZsetUpdate({
            connectionId: info.connectionId,
            db: info.db,
            key: info.key,
            field: dialogMember.value,
            score: dialogScore.value,
          });
          ElMessage.success("更新成功");
        }
        dialogVisible.value = false;
        loadData();
      } catch (e) {
        ElMessage.error(`${dialogMode.value === "add" ? "添加" : "更新"}失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    async function handleDelete(row: ZSetEntry) {
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
        await redisDataZsetDelete({
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

    function toggleReverse() {
      reverse.value = !reverse.value;
      currentPage.value = 1;
      loadData();
    }

    function handlePageChange(page: number) {
      currentPage.value = page;
      loadData();
    }

    watch(
      () => [store.activeTabId, store.keyDetail?.key],
      () => {
        if (store.keyDetail?.keyType === "zset") {
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
                  currentPage.value = 1; loadData();
                }}
                onKeydown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    currentPage.value = 1;
                    loadData();
                  }
                }}
              />
              <el-button
                size="small"
                icon={Sort}
                onClick={toggleReverse}
                type={reverse.value ? "primary" : "default"}
                title={reverse.value ? "当前: 倒序 (点击切换)" : "当前: 正序 (点击切换)"}
                style={{ marginLeft: "8px" }}
              >
                {reverse.value ? "倒序" : "正序"}
              </el-button>
            </div>
            <div class={ns.e("actions")}>
              <el-button size="small" type="primary" icon={Plus} onClick={showAddDialog}>添加成员</el-button>
              <el-button size="small" loading={loading.value} onClick={loadData}>刷新</el-button>
            </div>
          </div>

          <el-table data={items.value} v-loading={loading.value} stripe border max-height={500}>
            <el-table-column type="index" label="#" width={60} />
            <el-table-column prop="member" label="成员" min-width={300} show-overflow-tooltip />
            <el-table-column prop="score" label="分值" width={150} sortable />
            <el-table-column label="操作" width={120} fixed="right">
              {({ row }: { row: ZSetEntry }) => (
                <div>
                  <el-button link type="primary" icon={Edit} onClick={() => showEditDialog(row)} />
                  <el-button link type="danger" icon={Delete} onClick={() => handleDelete(row)} />
                </div>
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

          <el-dialog
            v-model={dialogVisible.value}
            title={dialogMode.value === "add" ? "添加成员" : "编辑分值"}
            width="500px"
            append-to-body
          >
            <el-form label-width="80px">
              <el-form-item label="成员">
                <el-input
                  v-model={dialogMember.value}
                  placeholder="请输入成员"
                  disabled={dialogMode.value === "edit"}
                />
              </el-form-item>
              <el-form-item label="分值">
                <el-input-number v-model={dialogScore.value} step={0.1} style={{ width: "100%" }} />
              </el-form-item>
            </el-form>
            {{
              footer: () => (
                <div>
                  <el-button onClick={() => {
                    dialogVisible.value = false;
                  }}
                  >
                    取消
                  </el-button>
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

export default ContentZset;
