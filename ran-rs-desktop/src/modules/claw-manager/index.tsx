/**
 * Claw Manager 主入口
 *
 * OpenClaw 管理模块，按功能分为三个子页面：
 * - 网关管理：gateway start/stop/restart/status、dashboard、tui
 * - 系统配置：version、onboard、configure
 * - 健康检查与维护：doctor、fix、update、reset、backup
 *
 * @block ran-claw-manager
 */

import {
  CircleCheck,
  CircleClose,
  CirclePlus,
  Connection,
  DataBoard,
  Edit,
  FolderAdd,
  Link,
  Monitor,
  Refresh,
  RefreshRight,
  Setting,
  SwitchButton,
  Tools,
  VideoPlay,
  Warning,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, onMounted, ref } from "vue";
import { useCsNamespace } from "../../hooks/use-namespace";
import "./index.less";

// ==================== 类型定义 ====================

/** 网关运行状态 */
type GatewayStatus = "running" | "stopped" | "error";

/** 命令执行结果 */
interface CommandResult {
  success: boolean;
  output: string;
  timestamp: string;
}

// ==================== 网关管理子页面 ====================

const GatewayPanel = defineComponent({
  name: "ClawGatewayPanel",
  setup() {
    const ns = useCsNamespace("claw-gateway");
    const loading = ref(false);

    // ---- 网关状态 ----
    const gatewayStatus = ref<GatewayStatus>("stopped");
    const gatewayPort = ref(8080);
    const gatewayUptime = ref(0);
    const gatewayVersion = ref("0.0.0");

    // ---- 命令输出日志 ----
    const commandLogs = ref<{ cmd: string; output: string; time: string; success: boolean; url?: string }[]>([]);

    /** 获取 Dashboard 本地地址 */
    const dashboardUrl = () => `http://127.0.0.1:${gatewayPort.value}`;

    /** 模拟执行命令 */
    const execCommand = async (cmd: string, successOutput: string, duration = 1000, url?: string) => {
      loading.value = true;
      const entry = { cmd, output: "执行中...", time: new Date().toLocaleTimeString(), success: false, url };
      commandLogs.value.unshift(entry);
      try {
        // TODO: 调用 Tauri 后端 Command API 执行 openclaw 命令
        await new Promise(resolve => setTimeout(resolve, duration));
        entry.output = successOutput;
        entry.success = true;
        entry.time = new Date().toLocaleTimeString();
      } catch (err) {
        entry.output = `执行失败: ${err}`;
        entry.success = false;
      } finally {
        loading.value = false;
      }
    };

    /** 启动网关 */
    const startGateway = () => execCommand(
      "openclaw gateway start",
      `✓ 网关已启动，监听端口 ${gatewayPort.value}\n\nDashboard 地址:`,
      1500,
      dashboardUrl(),
    ).then(() => { gatewayStatus.value = "running"; gatewayUptime.value = 0; });

    /** 停止网关 */
    const stopGateway = () => execCommand(
      "openclaw gateway stop",
      "✓ 网关已停止",
      800,
    ).then(() => { gatewayStatus.value = "stopped"; gatewayUptime.value = 0; });

    /** 重启网关 */
    const restartGateway = () => execCommand(
      "openclaw gateway restart",
      `✓ 网关已重启，监听端口 ${gatewayPort.value}\n\nDashboard 地址:`,
      2000,
      dashboardUrl(),
    ).then(() => { gatewayStatus.value = "running"; gatewayUptime.value = 0; });

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

    /** 打开 URL */
    const openUrl = (url: string) => {
      window.open(url, "_blank");
    };

    /** 清空日志 */
    const clearLogs = () => {
      commandLogs.value = [];
    };

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
            <span>端口: {gatewayPort.value}</span>
            <span>版本: v{gatewayVersion.value}</span>
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
        <div class={ns.e("log-section")}>
          <div class={ns.e("log-header")}>
            <span class={ns.e("log-title")}>命令日志</span>
            <el-button size="small" text onClick={clearLogs}>清空</el-button>
          </div>
          <div class={ns.e("log-list")}>
            {commandLogs.value.length === 0 && (
              <div class={ns.e("log-empty")}>暂无执行记录</div>
            )}
            {commandLogs.value.map((log, idx) => (
              <div key={idx} class={[ns.e("log-item"), !log.success && ns.is("error")]}>
                <div class={ns.e("log-cmd")}>
                  <span class={ns.e("log-time")}>{log.time}</span>
                  <code>$ {log.cmd}</code>
                </div>
                <pre class={ns.e("log-output")}>{log.output}</pre>
                {log.url && (
                  <div class={ns.e("log-url")}>
                    <el-link
                      type="primary"
                      icon={Link}
                      onClick={() => { openUrl(log.url!); }}
                    >
                      {log.url}
                    </el-link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
});

// ==================== 系统配置子页面 ====================

const ConfigPanel = defineComponent({
  name: "ClawConfigPanel",
  setup() {
    const ns = useCsNamespace("claw-config");
    const loading = ref(false);
    const commandLogs = ref<{ cmd: string; output: string; time: string; success: boolean }[]>([]);

    // ---- 版本信息 ----
    const versionInfo = ref("查询中...");
    const checkingVersion = ref(false);

    /** 模拟执行命令 */
    const execCommand = async (cmd: string, successOutput: string, duration = 1000) => {
      loading.value = true;
      const entry = { cmd, output: "执行中...", time: new Date().toLocaleTimeString(), success: false };
      commandLogs.value.unshift(entry);
      try {
        await new Promise(resolve => setTimeout(resolve, duration));
        entry.output = successOutput;
        entry.success = true;
        entry.time = new Date().toLocaleTimeString();
      } catch (err) {
        entry.output = `执行失败: ${err}`;
        entry.success = false;
      } finally {
        loading.value = false;
      }
    };

    /** 查看版本 */
    const checkVersion = async () => {
      checkingVersion.value = true;
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 500));
        versionInfo.value = "OpenClaw v1.0.0 (build 20260602)";
      } finally {
        checkingVersion.value = false;
      }
    };

    /** 查看帮助 */
    const showHelp = () => execCommand(
      "openclaw --help",
      `用法: openclaw <command> [options]\n\n命令:\n  gateway    网关管理\n  configure  配置向导\n  onboard    首次初始化\n  doctor     环境自检\n  update     升级\n  reset      重置配置\n  backup     备份管理\n  dashboard  打开Web面板\n  tui        终端控制台`,
      300,
    );

    /** 首次初始化 */
    const runOnboard = () => execCommand(
      "openclaw onboard",
      "✓ 交互式初始化完成\n  - 本地 LLM 已配置\n  - 网关端口: 8080\n  - 沙箱环境: 就绪",
      2000,
    );

    /** 重新配置 */
    const runConfigure = () => execCommand(
      "openclaw configure",
      "✓ 配置向导完成\n  - 模型: 已更新\n  - 沙箱: 已更新\n  - 网关: 已更新",
      2000,
    );

    /** 清空日志 */
    const clearLogs = () => {
      commandLogs.value = [];
    };

    onMounted(() => {
      checkVersion();
    });

    return () => (
      <div class={ns.b()}>
        {/* 版本信息卡片 */}
        <div class={ns.e("version-card")}>
          <div class={ns.e("version-header")}>
            <el-icon size={20} color="var(--el-color-primary)"><Monitor /></el-icon>
            <span class={ns.e("version-title")}>版本信息</span>
          </div>
          <div class={ns.e("version-content")}>
            <code>{versionInfo.value}</code>
          </div>
          <el-button
            size="small"
            icon={Refresh}
            loading={checkingVersion.value}
            onClick={checkVersion}
            style={{ marginTop: "8px" }}
          >
            刷新
          </el-button>
        </div>

        {/* 配置操作 */}
        <div class={ns.e("config-actions")}>
          <div class={ns.e("action-card")}>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>首次初始化</span>
              <span class={ns.e("action-cmd")}>openclaw onboard</span>
              <span class={ns.e("action-desc")}>交互式配置本地 LLM、网关端口等基础环境</span>
            </div>
            <el-button type="primary" icon={CirclePlus} loading={loading.value} onClick={runOnboard}>
              执行
            </el-button>
          </div>

          <div class={ns.e("action-card")}>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>重新配置</span>
              <span class={ns.e("action-cmd")}>openclaw configure</span>
              <span class={ns.e("action-desc")}>重新向导配置模型、沙箱、网关参数</span>
            </div>
            <el-button type="warning" icon={Edit} loading={loading.value} onClick={runConfigure}>
              执行
            </el-button>
          </div>

          <div class={ns.e("action-card")}>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>查看帮助</span>
              <span class={ns.e("action-cmd")}>openclaw --help</span>
              <span class={ns.e("action-desc")}>查看全部指令帮助信息</span>
            </div>
            <el-button icon={Tools} loading={loading.value} onClick={showHelp}>
              执行
            </el-button>
          </div>
        </div>

        {/* 命令日志 */}
        <div class={ns.e("log-section")}>
          <div class={ns.e("log-header")}>
            <span class={ns.e("log-title")}>命令日志</span>
            <el-button size="small" text onClick={clearLogs}>清空</el-button>
          </div>
          <div class={ns.e("log-list")}>
            {commandLogs.value.length === 0 && (
              <div class={ns.e("log-empty")}>暂无执行记录</div>
            )}
            {commandLogs.value.map((log, idx) => (
              <div key={idx} class={[ns.e("log-item"), !log.success && ns.is("error")]}>
                <div class={ns.e("log-cmd")}>
                  <span class={ns.e("log-time")}>{log.time}</span>
                  <code>$ {log.cmd}</code>
                </div>
                <pre class={ns.e("log-output")}>{log.output}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
});

// ==================== 健康检查与维护子页面 ====================

const MaintenancePanel = defineComponent({
  name: "ClawMaintenancePanel",
  setup() {
    const ns = useCsNamespace("claw-maintenance");
    const loading = ref(false);
    const commandLogs = ref<{ cmd: string; output: string; time: string; success: boolean }[]>([]);

    /** 模拟执行命令 */
    const execCommand = async (cmd: string, successOutput: string, duration = 1000) => {
      loading.value = true;
      const entry = { cmd, output: "执行中...", time: new Date().toLocaleTimeString(), success: false };
      commandLogs.value.unshift(entry);
      try {
        await new Promise(resolve => setTimeout(resolve, duration));
        entry.output = successOutput;
        entry.success = true;
        entry.time = new Date().toLocaleTimeString();
      } catch (err) {
        entry.output = `执行失败: ${err}`;
        entry.success = false;
      } finally {
        loading.value = false;
      }
    };

    /** 环境自检 */
    const runDoctor = () => execCommand(
      "openclaw doctor",
      "✓ 环境自检完成\n  [✓] 依赖检查: 全部就绪\n  [✓] 配置文件: 有效\n  [✓] 模型连通: 正常\n  [✓] 网关端口: 可用",
      2000,
    );

    /** 自动修复 */
    const runFix = () => execCommand(
      "openclaw doctor --fix",
      "✓ 自动修复完成\n  [✓] 配置权限已修复\n  [✓] 缺失依赖已安装\n  [✓] 模型连接已恢复",
      3000,
    );

    /** 升级 */
    const runUpdate = () => execCommand(
      "openclaw update",
      "✓ 升级检查完成\n  当前版本: v1.0.0\n  最新版本: v1.0.0\n  已是最新版本",
      2000,
    );

    /** 重置配置 */
    const runReset = async () => {
      try {
        await ElMessageBox.confirm(
          "此操作将清空所有 agent、技能和配置，确定要继续吗？",
          "⚠️ 危险操作",
          { type: "warning", confirmButtonText: "确定重置", cancelButtonText: "取消" },
        );
        execCommand(
          "openclaw reset",
          "✓ 配置已重置\n  所有 agent、技能、配置已清空\n  请重新运行 openclaw onboard 初始化",
          1500,
        );
      } catch {
        // 用户取消
      }
    };

    /** 创建备份 */
    const runBackup = () => execCommand(
      "openclaw backup create",
      "✓ 备份已创建\n  备份文件: openclaw-backup-20260602.tar.gz\n  包含: agent + 技能 + 配置",
      2000,
    );

    /** 清空日志 */
    const clearLogs = () => {
      commandLogs.value = [];
    };

    return () => (
      <div class={ns.b()}>
        {/* 维护操作列表 */}
        <div class={ns.e("action-list")}>
          {/* 环境自检 */}
          <div class={ns.e("action-card")}>
            <div class={ns.e("action-icon")}>
              <el-icon size={24} color="var(--el-color-success)"><CircleCheck /></el-icon>
            </div>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>环境自检</span>
              <code class={ns.e("action-cmd")}>openclaw doctor</code>
              <span class={ns.e("action-desc")}>检查依赖、配置、模型连通性等环境状态</span>
            </div>
            <el-button type="success" loading={loading.value} onClick={runDoctor}>
              执行检查
            </el-button>
          </div>

          {/* 自动修复 */}
          <div class={ns.e("action-card")}>
            <div class={ns.e("action-icon")}>
              <el-icon size={24} color="var(--el-color-primary)"><Tools /></el-icon>
            </div>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>自动修复</span>
              <code class={ns.e("action-cmd")}>openclaw doctor --fix</code>
              <span class={ns.e("action-desc")}>自动修复配置、权限、依赖等问题</span>
            </div>
            <el-button type="primary" loading={loading.value} onClick={runFix}>
              自动修复
            </el-button>
          </div>

          {/* 升级 */}
          <div class={ns.e("action-card")}>
            <div class={ns.e("action-icon")}>
              <el-icon size={24} color="var(--el-color-warning)"><Refresh /></el-icon>
            </div>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>检查升级</span>
              <code class={ns.e("action-cmd")}>openclaw update</code>
              <span class={ns.e("action-desc")}>检查并升级 OpenClaw 到最新版本</span>
            </div>
            <el-button type="warning" loading={loading.value} onClick={runUpdate}>
              检查升级
            </el-button>
          </div>

          {/* 备份 */}
          <div class={ns.e("action-card")}>
            <div class={ns.e("action-icon")}>
              <el-icon size={24} color="var(--el-color-info)"><FolderAdd /></el-icon>
            </div>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>创建备份</span>
              <code class={ns.e("action-cmd")}>openclaw backup create</code>
              <span class={ns.e("action-desc")}>全配置备份（agent + 技能 + 配置打包）</span>
            </div>
            <el-button loading={loading.value} onClick={runBackup}>
              创建备份
            </el-button>
          </div>

          {/* 重置 - 危险操作 */}
          <div class={[ns.e("action-card"), ns.is("danger")]}>
            <div class={ns.e("action-icon")}>
              <el-icon size={24} color="var(--el-color-danger)"><Warning /></el-icon>
            </div>
            <div class={ns.e("action-info")}>
              <span class={ns.e("action-name")}>重置配置</span>
              <code class={ns.e("action-cmd")}>openclaw reset</code>
              <span class={ns.e("action-desc")}>⚠️ 慎用！清空所有 agent、技能和配置</span>
            </div>
            <el-button type="danger" loading={loading.value} onClick={runReset}>
              重置
            </el-button>
          </div>
        </div>

        {/* 命令日志 */}
        <div class={ns.e("log-section")}>
          <div class={ns.e("log-header")}>
            <span class={ns.e("log-title")}>命令日志</span>
            <el-button size="small" text onClick={clearLogs}>清空</el-button>
          </div>
          <div class={ns.e("log-list")}>
            {commandLogs.value.length === 0 && (
              <div class={ns.e("log-empty")}>暂无执行记录</div>
            )}
            {commandLogs.value.map((log, idx) => (
              <div key={idx} class={[ns.e("log-item"), !log.success && ns.is("error")]}>
                <div class={ns.e("log-cmd")}>
                  <span class={ns.e("log-time")}>{log.time}</span>
                  <code>$ {log.cmd}</code>
                </div>
                <pre class={ns.e("log-output")}>{log.output}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
});

// ==================== 主组件（路由分发） ====================

/**
 * ClawManager 主组件
 *
 * 接收 activeCategory prop，根据分类 key 渲染对应子页面：
 * - claw-gateway → GatewayPanel
 * - claw-config → ConfigPanel
 * - claw-maintenance → MaintenancePanel
 */
const ClawManager = defineComponent({
  name: "ClawManager",
  props: {
    activeCategory: {
      type: String,
      default: "claw-gateway",
    },
  },
  setup(props) {
    const ns = useCsNamespace("claw-manager");

    return () => (
      <div class={ns.b()}>
        {/* 页面头部 */}
        <div class={ns.e("header")}>
          <h2 class={ns.e("title")}>OpenClaw 管理器</h2>
          <span class={ns.e("subtitle")}>管理 OpenClaw 网关、配置与维护</span>
        </div>

        {/* 子页面内容 */}
        <div class={ns.e("content")}>
          {props.activeCategory === "claw-gateway" && <GatewayPanel />}
          {props.activeCategory === "claw-config" && <ConfigPanel />}
          {props.activeCategory === "claw-maintenance" && <MaintenancePanel />}
        </div>
      </div>
    );
  },
});

export default ClawManager;
