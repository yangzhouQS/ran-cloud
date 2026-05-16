/**
 * status-panel.tsx
 * 服务器状态监控面板
 *
 * 功能：
 * - 服务器信息（版本、OS、进程ID）
 * - 内存信息（已用内存、峰值、Lua内存）
 * - 统计信息（连接数、命令数、OPS）
 * - Key 统计表格（DB、Keys、Expires、Avg TTL）
 * - 全部 Redis INFO 搜索过滤
 * - 自动刷新开关
 *
 * @block ran-status-panel
 */

import type { ServerStatus, DatabaseInfo } from "../types/key-data";
import { defineComponent, onMounted, onUnmounted, ref, computed } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { redisToolServerStatus, redisToolServerInfo } from "../services/redis-commands";
import "./status-panel.less";

/** 人类可读文件大小 */
function humanFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

const StatusPanel = defineComponent({
  name: "StatusPanel",
  props: {
    connectionId: { type: String, required: true },
    db: { type: Number, default: 0 },
  },
  setup(props) {
    const ns = useCsNamespace("status-panel");

    // ---- 状态 ----
    const loading = ref(false);
    const autoRefresh = ref(false);
    const refreshTimer = ref<ReturnType<typeof setInterval> | null>(null);
    const refreshInterval = 3000;

    const serverStatus = ref<ServerStatus | null>(null);
    const databases = ref<DatabaseInfo[]>([]);
    const allInfo = ref<{ key: string; value: string }[]>([]);
    const allInfoFilter = ref("");

    // ---- 过滤后的全部信息 ----
    const filteredInfo = computed(() => {
      const filter = allInfoFilter.value.toLowerCase().trim();
      if (!filter) return allInfo.value;
      return allInfo.value.filter(item =>
        item.key.toLowerCase().includes(filter)
      );
    });

    // ---- 加载服务器状态 ----
    const fetchStatus = async () => {
      loading.value = true;
      try {
        const status = await redisToolServerStatus(props.connectionId, props.db);
        serverStatus.value = status;
      } catch (e: any) {
        console.error("[StatusPanel] fetchStatus error:", e);
      } finally {
        loading.value = false;
      }
    };

    // ---- 加载全部 INFO ----
    const fetchAllInfo = async () => {
      try {
        const info = await redisToolServerInfo(props.connectionId, props.db);
        // 解析为 key-value 数组
        const lines: { key: string; value: string }[] = [];
        if (typeof info === "string") {
          const parts = info.split("\n");
          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const idx = trimmed.indexOf(":");
            if (idx > 0) {
              lines.push({
                key: trimmed.substring(0, idx),
                value: trimmed.substring(idx + 1),
              });
            }
          }
        } else if (typeof info === "object" && info !== null) {
          // 后端可能返回已解析的对象
          for (const [k, v] of Object.entries(info as Record<string, any>)) {
            lines.push({ key: k, value: String(v) });

            // 解析 db 统计
            if (/^db\d+$/.test(k) && typeof v === "string") {
              const parts = v.split(",");
              const keysPart = parts.find(p => p.startsWith("keys="));
              const expiresPart = parts.find(p => p.startsWith("expires="));
              const ttlPart = parts.find(p => p.startsWith("avg_ttl="));
              const dbNum = parseInt(k.replace("db", ""), 10);

              databases.value.push({
                db: dbNum,
                keys: keysPart ? parseInt(keysPart.split("=")[1], 10) : 0,
                expires: expiresPart ? parseInt(expiresPart.split("=")[1], 10) : 0,
                avgTtl: ttlPart ? parseInt(ttlPart.split("=")[1], 10) : 0,
              });
            }
          }
        }
        allInfo.value = lines;
      } catch (e: any) {
        console.error("[StatusPanel] fetchAllInfo error:", e);
      }
    };

    // ---- 刷新 ----
    const refreshAll = async () => {
      databases.value = [];
      await Promise.all([fetchStatus(), fetchAllInfo()]);
    };

    // ---- 自动刷新 ----
    const toggleAutoRefresh = (val: boolean) => {
      if (refreshTimer.value) {
        clearInterval(refreshTimer.value);
        refreshTimer.value = null;
      }
      if (val) {
        refreshAll();
        refreshTimer.value = setInterval(refreshAll, refreshInterval);
      }
    };

    // ---- 生命周期 ----
    onMounted(() => {
      refreshAll();
    });

    onUnmounted(() => {
      if (refreshTimer.value) {
        clearInterval(refreshTimer.value);
      }
    });

    return () => (
      <div class={ns.b()}>
        {/* 顶部操作栏 */}
        <div class={ns.e("header")}>
          <div class={ns.e("auto-refresh")}>
            <span>自动刷新</span>
            <el-switch
              modelValue={autoRefresh.value}
              onUpdate:modelValue={(val: boolean) => {
                autoRefresh.value = val;
                toggleAutoRefresh(val);
              }}
            />
          </div>
        </div>

        {loading.value && !serverStatus.value ? (
          <div class={ns.e("loading")}>
            <el-icon class="is-loading"><el-icon-loading /></el-icon>
            <span style="margin-left: 8px;">加载中...</span>
          </div>
        ) : (
          <>
            {/* 状态卡片行 */}
            <div class={ns.e("cards")}>
              {/* 服务器信息 */}
              <div class={ns.e("card")}>
                <div class={ns.e("card-header")}>
                  <el-icon><el-icon-monitor /></el-icon>
                  <span>服务器</span>
                </div>
                <div class={ns.e("card-body")}>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>Redis 版本</span>
                    <span class={ns.e("item-value")}>{serverStatus.value?.redisVersion ?? "-"}</span>
                  </div>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>运行模式</span>
                    <span class={ns.e("item-value")}>{serverStatus.value?.mode ?? "-"}</span>
                  </div>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>运行天数</span>
                    <span class={ns.e("item-value")}>{serverStatus.value?.uptimeDays ?? "-"} 天</span>
                  </div>
                </div>
              </div>

              {/* 内存信息 */}
              <div class={ns.e("card")}>
                <div class={ns.e("card-header")}>
                  <el-icon><el-icon-cpu /></el-icon>
                  <span>内存</span>
                </div>
                <div class={ns.e("card-body")}>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>已用内存</span>
                    <span class={ns.e("item-value")}>{humanFileSize(serverStatus.value?.usedMemory ?? 0)}</span>
                  </div>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>内存峰值</span>
                    <span class={ns.e("item-value")}>{humanFileSize(serverStatus.value?.usedMemoryPeak ?? 0)}</span>
                  </div>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>命中率</span>
                    <span class={ns.e("item-value")}>{serverStatus.value?.hitRate?.toFixed(2) ?? "-"}%</span>
                  </div>
                </div>
              </div>

              {/* 统计信息 */}
              <div class={ns.e("card")}>
                <div class={ns.e("card-header")}>
                  <el-icon><el-icon-data-line /></el-icon>
                  <span>统计</span>
                </div>
                <div class={ns.e("card-body")}>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>连接客户端</span>
                    <span class={ns.e("item-value")}>{serverStatus.value?.connectedClients ?? "-"}</span>
                  </div>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>每秒操作数</span>
                    <span class={ns.e("item-value")}>{serverStatus.value?.instantaneousOpsPerSec ?? "-"}</span>
                  </div>
                  <div class={ns.e("item")}>
                    <span class={ns.e("item-label")}>总 Key 数</span>
                    <span class={ns.e("item-value")}>{serverStatus.value?.totalKeys ?? "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Key 统计表格 */}
            {databases.value.length > 0 && (
              <div class={ns.e("section")}>
                <div class={ns.e("section-header")}>
                  <span>Key 统计</span>
                </div>
                <el-table
                  data={databases.value}
                  stripe
                  size="small"
                  style="width: 100%;"
                >
                  <el-table-column prop="db" label="DB" width="100" sortable />
                  <el-table-column prop="keys" label="Keys" width="150" sortable />
                  <el-table-column prop="expires" label="Expires" width="150" sortable />
                  <el-table-column prop="avgTtl" label="Avg TTL" sortable />
                </el-table>
              </div>
            )}

            {/* 全部 Redis INFO */}
            <div class={ns.e("section")}>
              <div class={ns.e("section-header")}>
                <span>全部 Redis INFO</span>
                <el-input
                  modelValue={allInfoFilter.value}
                  onUpdate:modelValue={(val: string) => { allInfoFilter.value = val; }}
                  size="small"
                  placeholder="搜索..."
                  clearable
                  class={ns.e("filter-input")}
                >
                  {{ suffix: () => <el-icon><el-icon-search /></el-icon> }}
                </el-input>
              </div>
              <el-table
                data={filteredInfo.value}
                stripe
                size="small"
                style="width: 100%;"
                max-height={400}
              >
                <el-table-column prop="key" label="Key" width="300" sortable />
                <el-table-column prop="value" label="Value" show-overflow-tooltip />
              </el-table>
            </div>
          </>
        )}
      </div>
    );
  },
});

export default StatusPanel;
