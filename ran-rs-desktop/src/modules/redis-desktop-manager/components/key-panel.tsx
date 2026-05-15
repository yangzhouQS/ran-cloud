/**
 * Key 面板组件
 *
 * 中间面板，显示当前 DB 的 Key 列表。
 * 功能：
 * - 搜索框（Pattern 匹配）
 * - 流式 SCAN 进度条
 * - Key 列表（虚拟滚动）
 * - Key 操作（删除/重命名/TTL）
 *
 * @block ran-key-panel
 */

import type { UnlistenFn } from "@tauri-apps/api/event";
import type { KeyScanResult } from "../types";
import { Close, Delete, RefreshRight, Search } from "@element-plus/icons-vue";
import { listen } from "@tauri-apps/api/event";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, onMounted, onUnmounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useRedisStore } from "../stores/redis-store";
import "./key-panel.less";

const KeyPanel = defineComponent({
  name: "KeyPanel",
  setup() {
    const ns = useCsNamespace("key-panel");
    const store = useRedisStore();

    // ===== 状态 =====
    const searchPattern = ref("*");
    // const viewMode = ref<"list" | "tree">("list");

    // ===== Tauri 事件监听 =====
    let unlisten: UnlistenFn | null = null;

    const setupEventListener = async () => {
      unlisten = await listen("redis:key:scan:progress", (event) => {
        store.handleScanProgress(event.payload as {
          keys: KeyScanResult[];
          progress: number;
          total: number;
          done: boolean;
        });
      });
    };

    onMounted(() => {
      setupEventListener();
    });

    onUnmounted(() => {
      unlisten?.();
    });

    // ===== 事件处理 =====

    /** 执行搜索 */
    const handleSearch = () => {
      if (!store.activeConnectionId) {
        ElMessage.warning("请先连接到 Redis");
        return;
      }
      store.startScan(searchPattern.value);
    };

    /** 取消扫描 */
    const handleCancelScan = () => {
      store.cancelScan();
    };

    /** 选中 Key */
    const handleKeyClick = (key: string) => {
      store.openKeyDetailTab(store.activeConnectionId, store.activeDb, key);
    };

    /** 删除 Key */
    const handleDeleteKey = async (key: string, e: Event) => {
      e.stopPropagation();
      try {
        await ElMessageBox.confirm(
          `确定要删除 Key "${key}" 吗？`,
          "删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await store.deleteKeys([key]);
        ElMessage.success("已删除");
      } catch {
        // 取消
      }
    };

    /** 批量删除选中 Key */
    const handleBatchDelete = async () => {
      if (selectedKeys.value.length === 0) {
        return;
      }
      try {
        await ElMessageBox.confirm(
          `确定要删除选中的 ${selectedKeys.value.length} 个 Key 吗？`,
          "批量删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await store.deleteKeys(selectedKeys.value);
        selectedKeys.value = [];
        ElMessage.success("批量删除完成");
      } catch {
        // 取消
      }
    };

    // ===== 多选 =====
    const selectedKeys = ref<string[]>([]);

    const handleKeySelect = (key: string, checked: boolean) => {
      if (checked) {
        if (!selectedKeys.value.includes(key)) {
          selectedKeys.value.push(key);
        }
      } else {
        selectedKeys.value = selectedKeys.value.filter(k => k !== key);
      }
    };

    // ===== 格式化 =====

    /** 格式化 TTL */
    const formatTtl = (ttl: number): string => {
      if (ttl === -1) {
        return "永不过期";
      }
      if (ttl === -2) {
        return "已过期";
      }
      if (ttl < 60) {
        return `${ttl}s`;
      }
      if (ttl < 3600) {
        return `${Math.floor(ttl / 60)}m ${ttl % 60}s`;
      }
      if (ttl < 86400) {
        return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;
      }
      return `${Math.floor(ttl / 86400)}d ${Math.floor((ttl % 86400) / 3600)}h`;
    };

    // ===== 渲染 =====

    return () => (
      <div class={ns.b()}>
        {/* 搜索栏 */}
        <div class={ns.e("search")}>
          <el-input
            v-model={searchPattern.value}
            placeholder="搜索 Pattern（如 user:*）"
            clearable
            onKeydown={(e: KeyboardEvent) => e.key === "Enter" && handleSearch()}
          >
            {{
              prefix: () => <el-icon><Search /></el-icon>,
              suffix: () => (
                <el-button link type="primary" onClick={handleSearch}>
                  <el-icon><RefreshRight /></el-icon>
                </el-button>
              ),
            }}
          </el-input>
        </div>

        {/* SCAN 进度 */}
        {store.scanState.scanning && (
          <div class={ns.e("progress")}>
            <el-progress
              percentage={store.scanState.total > 0
                ? Math.round((store.scanState.progress / store.scanState.total) * 100)
                : 0}
              striped
              stripedFlow
              strokeWidth={4}
            />
            <div class={ns.e("progress-info")}>
              <span>
                已扫描:
                {store.scanState.progress}
              </span>
              <span>
                已找到:
                {store.keys.length}
              </span>
              <el-button link type="danger" size="small" onClick={handleCancelScan}>
                <el-icon><Close /></el-icon>
                {" "}
                停止
              </el-button>
            </div>
          </div>
        )}

        {/* 工具栏 */}
        {selectedKeys.value.length > 0 && (
          <div class={ns.e("toolbar")}>
            <span>
              已选中
              {selectedKeys.value.length}
              {" "}
              项
            </span>
            <el-button type="danger" size="small" onClick={handleBatchDelete}>
              <el-icon><Delete /></el-icon>
              {" "}
              批量删除
            </el-button>
          </div>
        )}

        {/* Key 列表 */}
        <div class={ns.e("list")}>
          {!store.activeConnectionId
            ? (
                <div class={ns.e("empty")}>
                  <el-empty description="请先连接到 Redis 服务器" image-size={80} />
                </div>
              )
            : store.keys.length === 0 && !store.scanState.scanning
              ? (
                  <div class={ns.e("empty")}>
                    <el-empty description={store.scanState.pattern !== "*" ? "未找到匹配的 Key" : "点击搜索加载 Key"} image-size={80} />
                  </div>
                )
              : (
                  <div class={ns.e("list-inner")}>
                    {store.keys.map(keyItem => (
                      <div
                        key={keyItem.key}
                        class={[
                          ns.e("key-item"),
                          store.selectedKey === keyItem.key && ns.is("selected"),
                        ]}
                        onClick={() => handleKeyClick(keyItem.key)}
                      >
                        <el-checkbox
                          checked={selectedKeys.value.includes(keyItem.key)}
                          onChange={(val: boolean) => handleKeySelect(keyItem.key, val)}
                          onClick={(e: Event) => e.stopPropagation()}
                        />
                        <div class={ns.e("key-info")}>
                          <span class={ns.e("key-name")}>{keyItem.key}</span>
                          <div class={ns.e("key-meta")}>
                            <el-tag size="small" type="info">{keyItem.keyType}</el-tag>
                            <span class={ns.e("key-ttl")}>{formatTtl(keyItem.ttl)}</span>
                          </div>
                        </div>
                        <div class={ns.e("key-actions")}>
                          <el-button
                            link
                            size="small"
                            type="danger"
                            onClick={(e: Event) => handleDeleteKey(keyItem.key, e)}
                          >
                            <el-icon><Delete /></el-icon>
                          </el-button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
        </div>

        {/* 底部状态栏 */}
        {store.activeConnectionId && (
          <div class={ns.e("status")}>
            <span>
              DB
              {store.activeDb}
            </span>
            <span>
              共
              {store.keys.length}
              {" "}
              个 Key
            </span>
          </div>
        )}
      </div>
    );
  },
});

export default KeyPanel;
