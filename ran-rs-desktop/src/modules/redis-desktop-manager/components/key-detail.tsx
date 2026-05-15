/**
 * Key 详情面板组件
 *
 * 展示选中 Key 的元数据和操作：
 * - Key 名称、类型、TTL、编码、内存占用、长度
 * - 操作：重命名、删除、设置 TTL、刷新
 * - 数据内容区（Phase 2 实现具体数据类型编辑器）
 *
 * @block ran-key-detail
 */

import { CopyDocument, Delete, Edit, RefreshRight, Timer } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, defineComponent, ref, watch } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useRedisStore } from "../stores/redis-store";
import ContentHash from "./contents/content-hash";
import ContentList from "./contents/content-list";
import ContentSet from "./contents/content-set";
import ContentStream from "./contents/content-stream";
import ContentString from "./contents/content-string";
import ContentZset from "./contents/content-zset";
import "./key-detail.less";

/** TTL 格式化 */
function formatTtl(ttl: number): string {
  if (ttl === -1) {
    return "永不过期";
  }
  if (ttl === -2) {
    return "已过期/不存在";
  }
  if (ttl < 60) {
    return `${ttl} 秒`;
  }
  if (ttl < 3600) {
    return `${Math.floor(ttl / 60)} 分 ${ttl % 60} 秒`;
  }
  if (ttl < 86400) {
    return `${Math.floor(ttl / 3600)} 时 ${Math.floor((ttl % 3600) / 60)} 分`;
  }
  return `${Math.floor(ttl / 86400)} 天 ${Math.floor((ttl % 86400) / 3600)} 时`;
}

/** 内存格式化 */
function formatMemory(bytes?: number): string {
  if (bytes === undefined || bytes === null) {
    return "未知";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** 类型标签颜色 */
const typeColorMap: Record<string, string> = {
  string: "#67c23a",
  list: "#e6a23c",
  set: "#409eff",
  zset: "#f56c6c",
  hash: "#909399",
  stream: "#b37feb",
};

const KeyDetail = defineComponent({
  name: "KeyDetail",
  setup() {
    const ns = useCsNamespace("key-detail");
    const store = useRedisStore();

    // ---- 重命名对话框 ----
    const renameVisible = ref(false);
    const renameNewKey = ref("");

    // ---- TTL 对话框 ----
    const ttlVisible = ref(false);
    const ttlNewValue = ref(0);
    const ttlUnit = ref<"seconds" | "minutes" | "hours" | "days">("seconds");

    // ---- 加载状态 ----
    const refreshing = ref(false);

    /** 当前活跃的 key-detail 标签页 */
    const activeKeyTab = computed(() => {
      const tab = store.activeTab;
      if (tab?.type !== "key-detail") {
        return null;
      }
      return tab;
    });

    /** 当前 key 详情 */
    const detail = computed(() => store.keyDetail);

    /** 类型颜色 */
    const typeColor = computed(() => {
      if (!detail.value) {
        return "#909399";
      }
      return typeColorMap[detail.value.keyType.toLowerCase()] || "#909399";
    });

    // ---- 监听标签页切换，自动加载详情 ----
    watch(
      () => store.activeTabId,
      () => {
        const tab = activeKeyTab.value;
        if (tab?.key) {
          store.loadKeyDetail(tab.key);
        }
      },
    );

    // ---- 操作方法 ----

    /** 刷新 */
    async function handleRefresh() {
      if (!activeKeyTab.value?.key) {
        return;
      }
      refreshing.value = true;
      try {
        await store.loadKeyDetail(activeKeyTab.value.key);
        ElMessage.success("刷新成功");
      } finally {
        refreshing.value = false;
      }
    }

    /** 复制 Key 名称 */
    function handleCopyKey() {
      if (!detail.value) {
        return;
      }
      navigator.clipboard.writeText(detail.value.key).then(() => {
        ElMessage.success("已复制 Key 名称");
      });
    }

    /** 删除 Key */
    async function handleDelete() {
      if (!activeKeyTab.value?.key) {
        return;
      }
      try {
        await ElMessageBox.confirm(
          `确定要删除 Key "${activeKeyTab.value.key}" 吗？此操作不可撤销。`,
          "删除确认",
          { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
        );
        await store.deleteKeys([activeKeyTab.value.key]);
        store.closeTab(store.activeTabId);
        ElMessage.success("删除成功");
      } catch {
        // 用户取消
      }
    }

    /** 打开重命名对话框 */
    function showRenameDialog() {
      if (!detail.value) {
        return;
      }
      renameNewKey.value = detail.value.key;
      renameVisible.value = true;
    }

    /** 确认重命名 */
    async function confirmRename() {
      if (!activeKeyTab.value?.key || !renameNewKey.value.trim()) {
        return;
      }
      if (renameNewKey.value === activeKeyTab.value.key) {
        renameVisible.value = false;
        return;
      }
      try {
        await store.renameKey(activeKeyTab.value.key, renameNewKey.value.trim());
        renameVisible.value = false;
        ElMessage.success("重命名成功");
      } catch (e) {
        ElMessage.error(`重命名失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    /** 打开 TTL 设置对话框 */
    function showTtlDialog() {
      if (!detail.value) {
        return;
      }
      ttlNewValue.value = detail.value.ttl === -1 ? 0 : Math.ceil(detail.value.ttl / getUnitSeconds());
      ttlVisible.value = true;
    }

    /** 获取当前单位对应的秒数 */
    function getUnitSeconds(): number {
      switch (ttlUnit.value) {
        case "minutes": return 60;
        case "hours": return 3600;
        case "days": return 86400;
        default: return 1;
      }
    }

    /** 确认设置 TTL */
    async function confirmTtl() {
      if (!activeKeyTab.value?.key) {
        return;
      }
      const seconds = ttlNewValue.value * getUnitSeconds();
      try {
        await store.setExpire(activeKeyTab.value.key, seconds);
        ttlVisible.value = false;
        ElMessage.success(seconds === 0 ? "已设为永不过期" : `TTL 已设置为 ${seconds} 秒`);
      } catch (e) {
        ElMessage.error(`设置 TTL 失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return () => {
      if (!activeKeyTab.value || !detail.value) {
        return (
          <div class={ns.b()}>
            <div class={ns.e("empty")}>
              <el-empty description="选择一个 Key 查看详情" />
            </div>
          </div>
        );
      }

      const d = detail.value;

      return (
        <div class={ns.b()}>
          {/* ---- 头部：Key 信息 + 操作 ---- */}
          <div class={ns.e("header")}>
            <div class={ns.e("header-info")}>
              <span class={ns.e("type-badge")} style={{ backgroundColor: typeColor.value }}>
                {d.keyType.toUpperCase()}
              </span>
              <span class={ns.e("key-name")} title={d.key}>
                {d.key}
              </span>
            </div>
            <div class={ns.e("header-actions")}>
              <el-tooltip content="复制 Key 名称">
                <el-button size="small" icon={CopyDocument} onClick={handleCopyKey} />
              </el-tooltip>
              <el-tooltip content="刷新">
                <el-button size="small" icon={RefreshRight} loading={refreshing.value} onClick={handleRefresh} />
              </el-tooltip>
              <el-tooltip content="设置 TTL">
                <el-button size="small" icon={Timer} onClick={showTtlDialog} />
              </el-tooltip>
              <el-tooltip content="重命名">
                <el-button size="small" icon={Edit} onClick={showRenameDialog} />
              </el-tooltip>
              <el-tooltip content="删除">
                <el-button size="small" type="danger" icon={Delete} onClick={handleDelete} />
              </el-tooltip>
            </div>
          </div>

          {/* ---- 元数据 ---- */}
          <div class={ns.e("meta")}>
            <div class={ns.e("meta-item")}>
              <span class={ns.e("meta-label")}>类型</span>
              <span class={ns.e("meta-value")}>{d.keyType}</span>
            </div>
            <div class={ns.e("meta-item")}>
              <span class={ns.e("meta-label")}>TTL</span>
              <span class={ns.e("meta-value")}>{formatTtl(d.ttl)}</span>
            </div>
            <div class={ns.e("meta-item")}>
              <span class={ns.e("meta-label")}>编码</span>
              <span class={ns.e("meta-value")}>{d.encoding}</span>
            </div>
            <div class={ns.e("meta-item")}>
              <span class={ns.e("meta-label")}>长度</span>
              <span class={ns.e("meta-value")}>{d.length.toLocaleString()}</span>
            </div>
            <div class={ns.e("meta-item")}>
              <span class={ns.e("meta-label")}>内存</span>
              <span class={ns.e("meta-value")}>{formatMemory(d.memoryUsage)}</span>
            </div>
          </div>

          {/* ---- 数据内容区：根据类型渲染对应编辑器 ---- */}
          <div class={ns.e("content")}>
            {d.keyType === "string" && <ContentString />}
            {d.keyType === "hash" && <ContentHash />}
            {d.keyType === "list" && <ContentList />}
            {d.keyType === "set" && <ContentSet />}
            {d.keyType === "zset" && <ContentZset />}
            {d.keyType === "stream" && <ContentStream />}
            {!["string", "hash", "list", "set", "zset", "stream"].includes(d.keyType) && (
              <el-empty description={`暂不支持 ${d.keyType} 类型的数据编辑`} />
            )}
          </div>

          {/* ---- 重命名对话框 ---- */}
          <el-dialog v-model={renameVisible.value} title="重命名 Key" width="460px" append-to-body>
            <el-form label-width="80px">
              <el-form-item label="当前名称">
                <el-input modelValue={d.key} disabled />
              </el-form-item>
              <el-form-item label="新名称">
                <el-input
                  v-model={renameNewKey.value}
                  placeholder="请输入新的 Key 名称"
                  onKeydown={(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      confirmRename();
                    }
                  }}
                />
              </el-form-item>
            </el-form>
            {{
              footer: () => (
                <div>
                  <el-button onClick={() => {
                    renameVisible.value = false;
                  }}
                  >
                    取消
                  </el-button>
                  <el-button type="primary" onClick={confirmRename}>确定</el-button>
                </div>
              ),
            }}
          </el-dialog>

          {/* ---- TTL 设置对话框 ---- */}
          <el-dialog v-model={ttlVisible.value} title="设置 TTL" width="460px" append-to-body>
            <el-form label-width="80px">
              <el-form-item label="当前 TTL">
                <span>{formatTtl(d.ttl)}</span>
              </el-form-item>
              <el-form-item label="新 TTL">
                <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                  <el-input-number
                    v-model={ttlNewValue.value}
                    min={0}
                    style={{ flex: 1 }}
                  />
                  <el-select v-model={ttlUnit.value} style={{ width: "100px" }}>
                    <el-option label="秒" value="seconds" />
                    <el-option label="分" value="minutes" />
                    <el-option label="时" value="hours" />
                    <el-option label="天" value="days" />
                  </el-select>
                </div>
                <div style={{ marginTop: "4px", fontSize: "12px", color: "#909399" }}>
                  设为 0 表示永不过期
                </div>
              </el-form-item>
            </el-form>
            {{
              footer: () => (
                <div>
                  <el-button onClick={() => {
                    ttlVisible.value = false;
                  }}
                  >
                    取消
                  </el-button>
                  <el-button type="primary" onClick={confirmTtl}>确定</el-button>
                </div>
              ),
            }}
          </el-dialog>
        </div>
      );
    };
  },
});

export default KeyDetail;
