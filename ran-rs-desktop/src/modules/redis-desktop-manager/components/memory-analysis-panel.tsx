/**
 * memory-analysis-panel.tsx
 * 内存分析面板
 *
 * 功能：
 * - SCAN + MEMORY USAGE 分析 Key 内存占用
 * - 按内存使用量排序（升序/降序切换）
 * - Pattern 过滤
 * - 统计汇总（总 Key 数、已分析数、总内存、耗时）
 * - 刷新按钮
 *
 * @block ran-memory-analysis
 */

import type { MemoryAnalysisEntry, MemoryAnalysisResult } from "../types/key-data";
import { defineComponent, onMounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { redisToolMemoryAnalysis } from "../services/redis-commands";
import "./memory-analysis-panel.less";

/** 字节大小格式化 */
function humanFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const threshold = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(threshold));
  return `${(bytes / threshold ** i).toFixed(2)} ${units[i]}`;
}

const MemoryAnalysisPanel = defineComponent({
  name: "MemoryAnalysisPanel",
  props: {
    connectionId: { type: String, required: true },
    db: { type: Number, default: 0 },
  },
  setup(props) {
    const ns = useCsNamespace("memory-analysis");

    const loading = ref(false);
    const entries = ref<MemoryAnalysisEntry[]>([]);
    const sortOrder = ref<"asc" | "desc">("desc");
    const pattern = ref("*");
    const scanCount = ref(1000);

    // 汇总统计
    const totalKeys = ref(0);
    const analyzedKeys = ref(0);
    const totalMemory = ref(0);
    const durationMs = ref(0);

    // ---- 执行内存分析 ----
    const runAnalysis = async () => {
      loading.value = true;
      try {
        const result: MemoryAnalysisResult = await redisToolMemoryAnalysis(
          props.connectionId,
          props.db,
          pattern.value || undefined,
          scanCount.value,
        );
        entries.value = result.entries;
        totalKeys.value = result.totalKeys;
        analyzedKeys.value = result.analyzedKeys;
        totalMemory.value = result.totalMemory;
        durationMs.value = result.durationMs;
        sortEntries();
      } catch (e: any) {
        console.error("[MemoryAnalysisPanel] runAnalysis error:", e);
      } finally {
        loading.value = false;
      }
    };

    // ---- 排序 ----
    const sortEntries = () => {
      const sorted = [...entries.value];
      if (sortOrder.value === "asc") {
        sorted.sort((a, b) => a.memoryUsage - b.memoryUsage);
      } else {
        sorted.sort((a, b) => b.memoryUsage - a.memoryUsage);
      }
      entries.value = sorted;
    };

    const toggleSort = () => {
      sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
      sortEntries();
    };

    onMounted(() => {
      runAnalysis();
    });

    return () => (
      <div class={ns.b()}>
        {/* 头部 */}
        <div class={ns.e("header")}>
          <span class={ns.e("title")}>内存分析</span>
          {loading.value && <el-icon class="is-loading"><el-icon-loading /></el-icon>}
          <div class={ns.e("actions")}>
            <el-input
              v-model={pattern.value}
              size="small"
              placeholder="Pattern (如 user:*)"
              style={{ width: "180px" }}
              clearable
            />
            <el-button
              size="small"
              type="primary"
              onClick={runAnalysis}
              loading={loading.value}
            >
              分析
            </el-button>
          </div>
        </div>

        {/* 统计汇总 */}
        <div class={ns.e("summary")} style={{ marginBottom: "12px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
          <el-tag size="small" style={{ marginRight: "8px" }}>
            总 Key:
            {" "}
            {totalKeys.value}
          </el-tag>
          <el-tag size="small" type="success" style={{ marginRight: "8px" }}>
            已分析:
            {" "}
            {analyzedKeys.value}
          </el-tag>
          <el-tag size="small" type="warning" style={{ marginRight: "8px" }}>
            总内存:
            {" "}
            {humanFileSize(totalMemory.value)}
          </el-tag>
          <el-tag size="small" type="info">
            耗时:
            {" "}
            {durationMs.value}
            ms
          </el-tag>
        </div>

        {/* 列表头 */}
        <div class={ns.e("list-header")}>
          <span class={ns.e("col-index")}>#</span>
          <span class={ns.e("col-key")}>Key</span>
          <span class={ns.e("col-type")}>类型</span>
          <span class={ns.e("col-size")} onClick={toggleSort}>
            内存
            {" "}
            {sortOrder.value === "asc" ? "↑" : "↓"}
          </span>
        </div>

        {/* 列表体 */}
        {entries.value.length > 0
          ? (
              <div class={ns.e("list-body")}>
                {entries.value.map((entry, index) => (
                  <div class={ns.e("row")} key={`${entry.key}-${index}`}>
                    <span class={ns.e("row-index")}>
                      {index + 1}
                      .
                    </span>
                    <span class={ns.e("row-key")} title={entry.key}>
                      {entry.key}
                    </span>
                    <span class={ns.e("row-type")}>
                      <el-tag size="small">{entry.keyType}</el-tag>
                    </span>
                    <span class={ns.e("row-size")}>
                      <el-tag size="small" type="warning">{humanFileSize(entry.memoryUsage)}</el-tag>
                    </span>
                  </div>
                ))}
              </div>
            )
          : (
              <div class={ns.e("empty")}>
                {loading.value ? "分析中..." : "暂无数据，点击「分析」开始"}
              </div>
            )}

        {/* 底部 */}
        <div class={ns.e("footer")}>
          <el-tag size="small">
            通过 SCAN + MEMORY USAGE 分析 | 按内存排序
          </el-tag>
        </div>
      </div>
    );
  },
});

export default MemoryAnalysisPanel;
