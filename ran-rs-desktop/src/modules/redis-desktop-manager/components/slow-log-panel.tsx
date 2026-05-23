/**
 * slow-log-panel.tsx
 * 慢日志面板
 *
 * 功能：
 * - 展示 SLOWLOG GET 结果（命令、耗时、时间戳）
 * - 按耗时排序（升序/降序切换）
 * - 显示慢日志配置信息
 * - 刷新按钮
 *
 * @block ran-slow-log-panel
 */

import type { SlowLogEntry } from "../types/key-data";
import { defineComponent, onMounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { redisToolSlowLog } from "../services/redis-commands";
import "./slow-log-panel.less";

/** 格式化时间戳为本地时间字符串 */
function formatTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const Y = d.getFullYear();
  const M = `${d.getMonth() + 1}`.padStart(2, "0");
  const D = `${d.getDate()}`.padStart(2, "0");
  const h = `${d.getHours()}`.padStart(2, "0");
  const m = `${d.getMinutes()}`.padStart(2, "0");
  const s = `${d.getSeconds()}`.padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

/** 格式化时间（仅时分秒） */
function formatTimeShort(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const h = `${d.getHours()}`.padStart(2, "0");
  const m = `${d.getMinutes()}`.padStart(2, "0");
  const s = `${d.getSeconds()}`.padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const SlowLogPanel = defineComponent({
  name: "SlowLogPanel",
  props: {
    connectionId: { type: String, required: true },
    db: { type: Number, default: 0 },
  },
  setup(props) {
    const ns = useCsNamespace("slow-log-panel");

    const loading = ref(false);
    const entries = ref<SlowLogEntry[]>([]);
    const sortOrder = ref<"asc" | "desc">("desc");

    // ---- 排序 ----
    const sortEntries = () => {
      const sorted = [...entries.value];
      if (sortOrder.value === "asc") {
        sorted.sort((a, b) => a.durationUs - b.durationUs);
      } else {
        sorted.sort((a, b) => b.durationUs - a.durationUs);
      }
      entries.value = sorted;
    };

    // ---- 获取慢日志 ----
    const fetchSlowLog = async () => {
      loading.value = true;
      try {
        const result = await redisToolSlowLog(props.connectionId, props.db, 200);
        entries.value = result;
        sortEntries();
      } catch (e: any) {
        console.error("[SlowLogPanel] fetchSlowLog error:", e);
      } finally {
        loading.value = false;
      }
    };

    const toggleSort = () => {
      sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
      sortEntries();
    };

    // ---- 格式化耗时 ----
    const formatCost = (durationUs: number): string => {
      return `${(durationUs / 1000).toFixed(3)}`;
    };

    onMounted(() => {
      fetchSlowLog();
    });

    return () => (
      <div class={ns.b()}>
        {/* 头部 */}
        <div class={ns.e("header")}>
          <span class={ns.e("title")}>慢日志</span>
          {loading.value && <el-icon class="is-loading"><el-icon-loading /></el-icon>}
          <el-button
            size="small"
            onClick={fetchSlowLog}
            loading={loading.value}
          >
            刷新
          </el-button>
          <span class={ns.e("config")}>
            单位: ms | 共
            {" "}
            {entries.value.length}
            {" "}
            条
          </span>
        </div>

        {/* 列表头 */}
        <div class={ns.e("list-header")}>
          <span class={ns.e("col-index")}>#</span>
          <span class={ns.e("col-time")}>时间</span>
          <span class={ns.e("col-cmd")}>命令</span>
          <span class={ns.e("col-cost")} onClick={toggleSort}>
            耗时(ms)
            {" "}
            {sortOrder.value === "asc" ? "↑" : "↓"}
          </span>
        </div>

        {/* 列表体 */}
        {entries.value.length > 0
          ? (
              <div class={ns.e("list-body")}>
                {entries.value.map((entry, index) => (
                  <div class={ns.e("row")} key={entry.id}>
                    <span class={ns.e("row-index")}>
                      {index + 1}
                      .
                    </span>
                    <span class={ns.e("row-time")} title={formatTime(entry.timestamp)}>
                      {formatTimeShort(entry.timestamp)}
                    </span>
                    <span class={ns.e("row-cmd")} title={entry.command.join(" ")}>
                      {entry.command.join(" ")}
                    </span>
                    <span class={ns.e("row-cost")}>
                      <el-tag size="small">{formatCost(entry.durationUs)}</el-tag>
                    </span>
                  </div>
                ))}
              </div>
            )
          : (
              <div class={ns.e("empty")}>
                {loading.value ? "加载中..." : "暂无慢日志"}
              </div>
            )}

        {/* 底部 */}
        <div class={ns.e("footer")}>
          <el-tag size="small">
            通过 SLOWLOG GET 获取 | 1000μs = 1ms
          </el-tag>
        </div>
      </div>
    );
  },
});

export default SlowLogPanel;
