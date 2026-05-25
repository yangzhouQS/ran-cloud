/**
 * 命令日志面板组件
 *
 * 展示 Redis 命令执行日志：
 * - 命令名称、参数、耗时、状态
 * - 按时间倒序排列
 * - 支持清空日志
 * - 自动刷新
 *
 * @block ran-command-log
 */

import { Delete, Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import { useCsNamespace } from "../../layout/hooks/use-namespace";
import { useRedisStore } from "../stores/redis-store";
import "./command-log-panel.less";

/** 格式化时间戳 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(Math.floor(d.getMilliseconds() / 10))}`;
}

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}μs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

const CommandLogPanel = defineComponent({
  name: "CommandLogPanel",
  setup() {
    const ns = useCsNamespace("command-log");
    const store = useRedisStore();

    const autoRefresh = ref(true);
    let timer: ReturnType<typeof setInterval> | null = null;

    // ---- 自动刷新 ----
    onMounted(() => {
      if (store.activeConnectionId) {
        store.loadCommandLogs(store.activeConnectionId);
      }
      timer = setInterval(() => {
        if (autoRefresh.value && store.activeConnectionId) {
          store.loadCommandLogs(store.activeConnectionId);
        }
      }, 3000);
    });

    onUnmounted(() => {
      if (timer) {
        clearInterval(timer);
      }
    });

    // ---- 倒序日志 ----
    const reversedLogs = computed(() =>
      [...store.commandLogs].reverse(),
    );

    // ---- 操作 ----

    /** 手动刷新 */
    async function handleRefresh() {
      if (!store.activeConnectionId) {
        return;
      }
      await store.loadCommandLogs(store.activeConnectionId);
    }

    /** 清空日志 */
    async function handleClear() {
      if (!store.activeConnectionId) {
        return;
      }
      try {
        await ElMessageBox.confirm("确定清空所有命令日志？", "清空确认", {
          confirmButtonText: "清空",
          cancelButtonText: "取消",
          type: "warning",
        });
        await store.clearCommandLogs(store.activeConnectionId);
        ElMessage.success("日志已清空");
      } catch {
        // 用户取消
      }
    }

    return () => (
      <div class={ns.b()}>
        {/* ---- 工具栏 ---- */}
        <div class={ns.e("toolbar")}>
          <div class={ns.e("toolbar-left")}>
            <span class={ns.e("count")}>
              共
              {" "}
              {store.commandLogs.length}
              {" "}
              条日志
            </span>
          </div>
          <div class={ns.e("toolbar-right")}>
            <el-switch
              v-model={autoRefresh.value}
              active-text="自动刷新"
              size="small"
              style={{ marginRight: "8px" }}
            />
            <el-button size="small" icon={Refresh} onClick={handleRefresh}>
              刷新
            </el-button>
            <el-button size="small" type="danger" icon={Delete} onClick={handleClear}>
              清空
            </el-button>
          </div>
        </div>

        {/* ---- 日志列表 ---- */}
        <div class={ns.e("list")}>
          {reversedLogs.value.length === 0
            ? (
                <div class={ns.e("empty")}>
                  <el-empty description="暂无命令日志" />
                </div>
              )
            : (
                reversedLogs.value.map((log, idx) => (
                  <div
                    key={log.id || idx}
                    class={[
                      ns.e("item"),
                      !log.success && ns.is("error"),
                    ]}
                  >
                    <div class={ns.e("item-header")}>
                      <span class={ns.e("item-time")}>{formatTime(log.timestamp)}</span>
                      <span class={[
                        ns.e("item-status"),
                        log.success ? ns.is("success") : ns.is("error"),
                      ]}
                      >
                        {log.success ? "✓" : "✗"}
                      </span>
                      <span class={ns.e("item-duration")}>{formatDuration(log.durationMs)}</span>
                      <span class={ns.e("item-db")}>
                        db
                        {log.db}
                      </span>
                    </div>
                    <div class={ns.e("item-command")}>
                      <span class={ns.e("item-cmd-name")}>{log.command}</span>
                      {log.args && (
                        <span class={ns.e("item-cmd-args")}>{log.args}</span>
                      )}
                    </div>
                    {!log.success && log.error && (
                      <div class={ns.e("item-error")}>{log.error}</div>
                    )}
                  </div>
                ))
              )}
        </div>
      </div>
    );
  },
});

export default CommandLogPanel;
