/**
 * 网关管理面板
 *
 * 功能：
 * - 网关状态展示（运行中/已停止/异常）
 * - 启动/停止/重启网关
 * - 查看状态、打开 Dashboard、打开 TUI
 * - 命令执行日志
 *
 * @block ran-claw-gateway
 */

import type { GatewayStatus } from "../types";
import {
  Connection,
  DataBoard,
  Monitor,
  RefreshRight,
  SwitchButton,
  VideoPlay,
} from "@element-plus/icons-vue";
import { defineComponent, onMounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./gateway-panel.less";

const GatewayPanel = defineComponent({
  name: "ClawGatewayPanel",
  setup() {
    const ns = useCsNamespace("claw-gateway");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 网关状态 ----
    const gatewayStatus = ref<GatewayStatus>("stopped");
    const gatewayPort = ref(8080);
    const gatewayUptime = ref(0);
    const gatewayVersion = ref("0.0.0");

    /** 获取 Dashboard 本地地址 */
    const dashboardUrl = () => `http://127.0.0.1:${gatewayPort.value}`;

    /** 启动网关 */
    const startGateway = () => execCommand(
      "openclaw gateway start",
      `✓ 网关已启动，监听端口 ${gatewayPort.value}\n\nDashboard 地址:`,
      1500,
      dashboardUrl(),
    ).then(() => {
      gatewayStatus.value = "running";
      gatewayUptime.value = 0;
    });

    /** 停止网关 */
    const stopGateway = () => execCommand(
      "openclaw gateway stop",
      "✓ 网关已停止",
      800,
    ).then(() => {
      gatewayStatus.value = "stopped";
      gatewayUptime.value = 0;
    });

    /** 重启网关 */
    const restartGateway = () => execCommand(
      "openclaw gateway restart",
      `✓ 网关已重启，监听端口 ${gatewayPort.value}\n\nDashboard 地址:`,
      2000,
      dashboardUrl(),
    ).then(() => {
      gatewayStatus.value = "running";
      gatewayUptime.value = 0;
    });

    /** 查看网关状态 */
    const checkStatus = () => execCommand(
      "openclaw gateway status",
      `网关状态: ${gatewayStatus.value}\n端口: ${gatewayPort.value}\n运行时间: ${gatewayUptime.value}s\n版本: v${gatewayVersion.value}`,
      500,
    );

    /** 打开 Dashboard */
    const openDashboard = () => execCommand(
      "openclaw dashboard",
      "✓ 已在浏览器中打开 Web 管理面板\n\n本地访问地址:",
      800,
      dashboardUrl(),
    );

    /** 打开 TUI */
    const openTui = () => execCommand(
      "openclaw tui",
      "✓ 已启动终端字符图形控制台",
      600,
    );

    onMounted(() => {
      // TODO: 初始化时查询网关状态
      gatewayVersion.value = "1.0.0";
    });

    return () => (
      <div class={ns.b()}>
        {/* 网关状态卡片 */}
        <div class={[ns.e("status-card"), ns.is(gatewayStatus.value)]}>
          <div class={ns.e("status-indicator")}>
            <div class={ns.e("status-dot")} />
            <span class={ns.e("status-text")}>
              {gatewayStatus.value === "running" ? "运行中" : gatewayStatus.value === "stopped" ? "已停止" : "异常"}
            </span>
          </div>
          <div class={ns.e("status-info")}>
            <span>
              端口:
              {gatewayPort.value}
            </span>
            <span>
              版本: v
              {gatewayVersion.value}
            </span>
          </div>
        </div>

        {/* 操作按钮组 */}
        <div class={ns.e("actions")}>
          {gatewayStatus.value === "stopped" && (
            <el-button type="success" icon={VideoPlay} loading={loading.value} onClick={startGateway}>
              启动网关
            </el-button>
          )}
          {gatewayStatus.value === "running" && (
            <>
              <el-button type="danger" icon={SwitchButton} loading={loading.value} onClick={stopGateway}>
                停止网关
              </el-button>
              <el-button type="warning" icon={RefreshRight} loading={loading.value} onClick={restartGateway}>
                重启网关
              </el-button>
            </>
          )}
          <el-button icon={Monitor} loading={loading.value} onClick={checkStatus}>
            查看状态
          </el-button>
          <el-button type="primary" icon={DataBoard} loading={loading.value} onClick={openDashboard}>
            打开 Dashboard
          </el-button>
          <el-button icon={Connection} loading={loading.value} onClick={openTui}>
            打开 TUI
          </el-button>
        </div>

        {/* 命令执行日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default GatewayPanel;
