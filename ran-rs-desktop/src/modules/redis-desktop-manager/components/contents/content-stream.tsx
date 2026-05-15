/**
 * Stream 类型数据编辑器
 *
 * 功能：
 * - 分页展示 Stream 条目（ID + 字段）
 * - XADD 添加条目
 * - XDEL 删除条目
 * - 查看消费者组信息
 *
 * @block ran-content-stream
 */

import type { StreamEntry, StreamGroupInfo, StreamPageParams } from "../../types";
import { Delete, InfoFilled, Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, ref, watch } from "vue";
import { useCsNamespace } from "../../../../hooks/use-namespace";
import {
  redisDataStreamAdd,
  redisDataStreamDelete,
  redisDataStreamGroups,
  redisDataStreamPage,
} from "../../services/redis-commands";
import { useRedisStore } from "../../stores/redis-store";

const ContentStream = defineComponent({
  name: "ContentStream",
  setup() {
    const ns = useCsNamespace("content-stream");
    const store = useRedisStore();

    const loading = ref(false);
    const items = ref<StreamEntry[]>([]);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(50);

    // 添加对话框
    const addVisible = ref(false);
    const addId = ref("*");
    const addFields = ref<{ key: string; value: string }[]>([{ key: "", value: "" }]);

    // 消费者组对话框
    const groupsVisible = ref(false);
    const groups = ref<StreamGroupInfo[]>([]);
    const groupsLoading = ref(false);

    // 条目详情对话框
    const detailVisible = ref(false);
    const detailEntry = ref<StreamEntry | null>(null);

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
        const params: StreamPageParams = {
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          page: currentPage.value,
          pageSize: pageSize.value,
        };
        const result = await redisDataStreamPage(params);
        items.value = result.items;
        total.value = result.total;
      } catch (e) {
        ElMessage.error(`加载 Stream 数据失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        loading.value = false;
      }
    }

    function showAddDialog() {
      addId.value = "*";
      addFields.value = [{ key: "", value: "" }];
      addVisible.value = true;
    }

    function addFieldRow() {
      addFields.value.push({ key: "", value: "" });
    }

    function removeFieldRow(index: number) {
      addFields.value.splice(index, 1);
    }

    async function confirmAdd() {
      const info = getKeyInfo();
      if (!info) {
        return;
      }

      const validFields = addFields.value.filter(f => f.key.trim());
      if (validFields.length === 0) {
        ElMessage.warning("请至少填写一个字段");
        return;
      }

      try {
        const fields: Record<string, string> = {};
        validFields.forEach((f) => {
          fields[f.key] = f.value;
        });
        await redisDataStreamAdd({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          id: addId.value || "*",
          fields,
        });
        ElMessage.success("添加成功");
        addVisible.value = false;
        loadData();
      } catch (e) {
        ElMessage.error(`添加失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    async function handleDelete(row: StreamEntry) {
      const info = getKeyInfo();
      if (!info) {
        return;
      }

      try {
        await ElMessageBox.confirm(
          `确定要删除条目 "${row.id}" 吗？`,
          "删除确认",
          { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
        );
        await redisDataStreamDelete({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
          field: row.id,
        });
        ElMessage.success("删除成功");
        loadData();
      } catch {
        // 用户取消
      }
    }

    function showDetail(row: StreamEntry) {
      detailEntry.value = row;
      detailVisible.value = true;
    }

    async function loadGroups() {
      const info = getKeyInfo();
      if (!info) {
        return;
      }

      groupsLoading.value = true;
      groupsVisible.value = true;
      try {
        groups.value = await redisDataStreamGroups({
          connectionId: info.connectionId,
          db: info.db,
          key: info.key,
        });
      } catch (e) {
        ElMessage.error(`加载消费者组失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        groupsLoading.value = false;
      }
    }

    function handlePageChange(page: number) {
      currentPage.value = page;
      loadData();
    }

    watch(
      () => [store.activeTabId, store.keyDetail?.key],
      () => {
        if (store.keyDetail?.keyType === "stream") {
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
            <span class={ns.e("total")}>
              共
              {total.value}
              {" "}
              个条目
            </span>
            <div class={ns.e("actions")}>
              <el-button size="small" type="primary" icon={Plus} onClick={showAddDialog}>添加条目</el-button>
              <el-button size="small" icon={InfoFilled} onClick={loadGroups}>消费者组</el-button>
              <el-button size="small" loading={loading.value} onClick={loadData}>刷新</el-button>
            </div>
          </div>

          <el-table data={items.value} v-loading={loading.value} stripe border max-height={500}>
            <el-table-column prop="id" label="ID" width={200} show-overflow-tooltip />
            <el-table-column label="字段" min-width={400}>
              {({ row }: { row: StreamEntry }) => {
                const fields = row.fields || {};
                const keys = Object.keys(fields);
                if (keys.length === 0) {
                  return <span style={{ color: "#999" }}>空</span>;
                }
                const preview = keys.slice(0, 3).map(k => `${k}: ${fields[k]}`).join(", ");
                return (
                  <span
                    style={{ cursor: "pointer" }}
                    title="点击查看详情"
                    onClick={() => showDetail(row)}
                  >
                    {preview}
                    {keys.length > 3 && ` ... (${keys.length} 个字段)`}
                  </span>
                );
              }}
            </el-table-column>
            <el-table-column label="操作" width={80} fixed="right">
              {({ row }: { row: StreamEntry }) => (
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

          {/* 添加条目对话框 */}
          <el-dialog v-model={addVisible.value} title="添加条目 (XADD)" width="600px" append-to-body>
            <el-form label-width="80px">
              <el-form-item label="ID">
                <el-input v-model={addId.value} placeholder="* 表示自动生成" />
              </el-form-item>
              <el-form-item label="字段">
                <div style={{ width: "100%" }}>
                  {addFields.value.map((field, index) => (
                    <div key={index} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <el-input
                        v-model={field.key}
                        placeholder="字段名"
                        style={{ flex: 1 }}
                      />
                      <el-input
                        v-model={field.value}
                        placeholder="字段值"
                        style={{ flex: 1 }}
                      />
                      <el-button
                        link
                        type="danger"
                        onClick={() => removeFieldRow(index)}
                        disabled={addFields.value.length <= 1}
                      >
                        删除
                      </el-button>
                    </div>
                  ))}
                  <el-button size="small" onClick={addFieldRow}>+ 添加字段</el-button>
                </div>
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

          {/* 条目详情对话框 */}
          <el-dialog v-model={detailVisible.value} title="条目详情" width="600px" append-to-body>
            {detailEntry.value && (
              <div>
                <p>
                  <strong>ID:</strong>
                  {" "}
                  {detailEntry.value.id}
                </p>
                <el-table
                  data={Object.entries(detailEntry.value.fields || {}).map(([k, v]) => ({ key: k, value: v }))}
                  stripe
                  border
                  size="small"
                >
                  <el-table-column prop="key" label="字段名" width={200} />
                  <el-table-column prop="value" label="字段值" min-width={300} show-overflow-tooltip />
                </el-table>
              </div>
            )}
          </el-dialog>

          {/* 消费者组对话框 */}
          <el-dialog v-model={groupsVisible.value} title="消费者组" width="700px" append-to-body>
            <el-table data={groups.value} v-loading={groupsLoading.value} stripe border size="small">
              <el-table-column prop="name" label="组名" width={150} show-overflow-tooltip />
              <el-table-column prop="consumers" label="消费者数" width={100} />
              <el-table-column prop="pending" label="待处理数" width={100} />
              <el-table-column prop="lastDeliveredId" label="最后投递ID" min-width={200} show-overflow-tooltip />
            </el-table>
          </el-dialog>
        </div>
      );
    };
  },
});

export default ContentStream;
