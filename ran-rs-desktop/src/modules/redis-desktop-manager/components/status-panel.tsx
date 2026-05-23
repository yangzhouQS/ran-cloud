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

import type { DatabaseInfo, ServerStatus } from "../types/key-data";
import { Cpu, DataLine, Loading, Monitor, Search } from "@element-plus/icons-vue";
import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { redisToolServerInfo, redisToolServerStatus } from "../services/redis-commands";
import "./status-panel.less";

/** 人类可读文件大小 */
function humanFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
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
    const allInfo = ref<{ key: string; value: string; section: string }[]>([]);
    const allInfoFilter = ref("");

    // ---- 过滤后的全部信息 ----
    const filteredInfo = computed(() => {
      const filter = allInfoFilter.value.toLowerCase().trim();
      if (!filter) {
        return allInfo.value;
      }
      return allInfo.value.filter(item =>
        item.key.toLowerCase().includes(filter)
        || item.section.toLowerCase().includes(filter)
        || item.value.toLowerCase().includes(filter),
      );
    });

    // ---- 加载服务器状态 ----
    const fetchStatus = async () => {
      loading.value = true;
      try {
        const status = await redisToolServerStatus(props.connectionId);
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
        const info = await redisToolServerInfo(props.connectionId);

        const lines: { key: string; value: string; section: string }[] = [];
        const dbs: DatabaseInfo[] = [];

        // 后端返回 { sections: { "Server": { k:v, ... }, "Memory": { ... } } }
        const sections = (info as any).sections ?? info;

        if (typeof sections === "object" && sections !== null) {
          for (const [_sectionName, sectionData] of Object.entries(sections)) {
            if (typeof sectionData === "object" && sectionData !== null) {
              for (const [k, v] of Object.entries(sectionData as Record<string, unknown>)) {
                // 防御性处理：确保 value 是字符串
                const valueStr = v === null || v === undefined
                  ? ""
                  : typeof v === "string"
                    ? v
                    : JSON.stringify(v);

                lines.push({ key: k, value: valueStr, section: _sectionName });

                // 解析 db 统计（如 db0:keys=1,expires=0,avg_ttl=0）
                if (/^db\d+$/.test(k) && typeof v === "string") {
                  const match = v.match(/keys=(\d+),expires=(\d+),avg_ttl=(-?\d+)/);
                  if (match) {
                    const dbNum = Number.parseInt(k.replace("db", ""), 10);
                    dbs.push({
                      db: dbNum,
                      keys: Number.parseInt(match[1], 10),
                      expires: Number.parseInt(match[2], 10),
                      avgTtl: Number.parseInt(match[3], 10),
                    });
                  }
                }
              }
            }
          }
        }

        allInfo.value = lines;
        databases.value = dbs;
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

        {loading.value && !serverStatus.value
          ? (
              <div class={ns.e("loading")}>
                <el-icon class="is-loading"><Loading /></el-icon>
                <span style="margin-left: 8px;">加载中...</span>
              </div>
            )
          : (
              <>
                {/* 状态卡片行 */}
                <div class={ns.e("cards")}>
                  {/* 服务器信息 */}
                  <div class={ns.e("card")}>
                    <div class={ns.e("card-header")}>
                      <el-icon><Monitor /></el-icon>
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
                        <span class={ns.e("item-value")}>
                          {serverStatus.value?.uptimeDays ?? "-"}
                          {" "}
                          天
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 内存信息 */}
                  <div class={ns.e("card")}>
                    <div class={ns.e("card-header")}>
                      <el-icon><Cpu /></el-icon>
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
                        <span class={ns.e("item-value")}>
                          {serverStatus.value?.hitRate?.toFixed(2) ?? "-"}
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 统计信息 */}
                  <div class={ns.e("card")}>
                    <div class={ns.e("card-header")}>
                      <el-icon><DataLine /></el-icon>
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
                    <span>
                      全部 Redis INFO（
                      {filteredInfo.value.length}
                      {" "}
                      条）
                    </span>
                    <el-input
                      modelValue={allInfoFilter.value}
                      onUpdate:modelValue={(val: string) => {
                        allInfoFilter.value = val;
                      }}
                      size="small"
                      placeholder="搜索..."
                      clearable
                      class={ns.e("filter-input")}
                      v-slots={{ suffix: () => <el-icon><Search /></el-icon> }}
                    />
                  </div>
                  <el-table
                    data={filteredInfo.value}
                    stripe
                    size="small"
                    style="width: 100%;"
                    max-height={400}
                    border
                  >
                    <el-table-column prop="section" label="Section" width="130" sortable />
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
