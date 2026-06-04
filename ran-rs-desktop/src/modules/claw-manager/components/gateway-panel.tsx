/**
 * 网关管理面板
 *
 * 功能：
 * - 网关状态展示（运行中/已停止/异常）
 * - 启动/停止/重启网关（openclaw gateway start/stop/restart）
 * - 安装/卸载网关服务（openclaw gateway install/uninstall）
 * - Windows 计划任务运行（schtasks /Run /TN "OpenClaw Gateway"）
 * - 查看状态、打开 Dashboard、打开 TUI
 * - 命令执行日志
 *
 * @block ran-claw-gateway
 */

import type { GatewayStatus } from "../types";
import {
  Connection,
  DataBoard,
  Download,
  Monitor,
  RefreshRight,
  SetUp,
  SwitchButton,
  Upload,
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

    // ---- 网关操作 ----

    /** 启动网关（openclaw gateway start） */
    const startGateway = () => execCommand(
      "openclaw gateway start",
      { url: dashboardUrl() },
    ).then((result) => {
      if (result.success) {
        gatewayStatus.value = "running";
        gatewayUptime.value = 0;
      }
    });

    /** 停止网关 */
    const stopGateway = () => execCommand(
      "openclaw gateway stop",
    ).then((result) => {
      if (result.success) {
        gatewayStatus.value = "stopped";
        gatewayUptime.value = 0;
      }
    });

    /** 重启网关 */
    const restartGateway = () => execCommand(
      "openclaw gateway restart",
      { url: dashboardUrl() },
    ).then((result) => {
      if (result.success) {
        gatewayStatus.value = "running";
        gatewayUptime.value = 0;
      }
    });

    /** 查看网关状态 */
    const checkStatus = () => execCommand(
      "openclaw gateway status",
    );

    /** 打开 Dashboard */
    const openDashboard = () => execCommand(
      "openclaw dashboard",
      { url: dashboardUrl() },
    );

    /** 打开 TUI */
    const openTui = () => execCommand(
      "openclaw tui",
    );

    // ---- 服务管理 ----

    /** 安装网关服务（openclaw gateway install） */
    const installGateway = () => execCommand(
      "openclaw gateway install",
    ).then((result) => {
      if (result.success) {
        // 安装成功后查询状态
        checkStatus();
      }
    });

    /** 卸载网关服务（openclaw gateway uninstall） */
    const uninstallGateway = () => execCommand(
      "openclaw gateway uninstall",
    );

    /** 通过 Windows 计划任务启动网关（schtasks /Run /TN "OpenClaw Gateway"） */
    const startViaSchtasks = () => execCommand(
      'schtasks /Run /TN "OpenClaw Gateway"',
      { url: dashboardUrl() },
    ).then((result) => {
      if (result.success) {
        gatewayStatus.value = "running";
        gatewayUptime.value = 0;
      }
    });

    /** 直接启动网关（openclaw gateway，无子命令） */
    const startBareGateway = () => execCommand(
      "openclaw gateway",
      { url: dashboardUrl() },
    ).then((result) => {
      if (result.success) {
        gatewayStatus.value = "running";
        gatewayUptime.value = 0;
      }
    });

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

        {/* 服务管理区域 */}
        <div class={ns.e("service-section")}>
          <div class={ns.e("section-title")}>
            <el-icon><SetUp /></el-icon>
            <span>服务管理</span>
          </div>
          <div class={ns.e("actions")}>
            <el-button type="primary" icon={Download} loading={loading.value} onClick={installGateway}>
              安装服务
            </el-button>
            <el-button type="danger" icon={Upload} loading={loading.value} onClick={uninstallGateway}>
              卸载服务
            </el-button>
            <el-button type="success" icon={VideoPlay} loading={loading.value} onClick={startViaSchtasks}>
              计划任务启动
            </el-button>
            <el-button icon={VideoPlay} loading={loading.value} onClick={startBareGateway}>
              直接启动
            </el-button>
          </div>
        </div>

        {/* 命令执行日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default GatewayPanel;
