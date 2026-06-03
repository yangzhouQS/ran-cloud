/**
 * 系统配置面板
 *
 * 功能：
 * - 版本信息查看与刷新
 * - 首次初始化（onboard）
 * - 重新配置（configure）
 * - 查看帮助
 * - 命令执行日志
 *
 * @block ran-claw-config
 */

import { CirclePlus, Edit, Monitor, Refresh, Tools } from "@element-plus/icons-vue";
import { defineComponent, onMounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import CommandLogPanel from "./command-log-panel";
import { useCommandExecutor } from "../hooks/use-command-executor";
import "./config-panel.less";

const ConfigPanel = defineComponent({
  name: "ClawConfigPanel",
  setup() {
    const ns = useCsNamespace("claw-config");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 版本信息 ----
    const versionInfo = ref("查询中...");
    const checkingVersion = ref(false);

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
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default ConfigPanel;
