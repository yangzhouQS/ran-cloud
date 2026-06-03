/**
 * 健康检查与维护面板
 *
 * 功能：
 * - 环境自检（doctor）
 * - 自动修复（doctor --fix）
 * - 检查升级（update）
 * - 创建备份（backup create）
 * - 重置配置（reset，危险操作需二次确认）
 * - 命令执行日志
 *
 * @block ran-claw-maintenance
 */

import {
  CircleCheck,
  FolderAdd,
  Refresh,
  Tools,
  Warning,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { defineComponent } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import CommandLogPanel from "./command-log-panel";
import { useCommandExecutor } from "../hooks/use-command-executor";
import "./maintenance-panel.less";

const MaintenancePanel = defineComponent({
  name: "ClawMaintenancePanel",
  setup() {
    const ns = useCsNamespace("claw-maintenance");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

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
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default MaintenancePanel;
