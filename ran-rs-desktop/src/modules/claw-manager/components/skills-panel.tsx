/**
 * 技能管理面板
 *
 * 功能：
 * - 技能列表查看（skills list）
 * - 查看技能详情（skills info）
 * - 校验技能语法（skills check）
 * - 安装市场技能（skills install）
 * - 启用/禁用技能（skills enable/disable）
 * - 命令执行日志
 *
 * @block ran-claw-skills
 */

import type { SkillInfo } from "../types";
import {
  CircleCheck,
  CircleClose,
  Delete,
  Download,
  InfoFilled,
  Refresh,
  Search,
  Warning,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, onMounted, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./skills-panel.less";

/** 状态颜色映射 */
const statusColorMap: Record<string, string> = {
  enabled: "#67c23a",
  disabled: "#909399",
  error: "#f56c6c",
};

/** 状态标签映射 */
const statusLabelMap: Record<string, string> = {
  enabled: "已启用",
  disabled: "已禁用",
  error: "异常",
};

const SkillsPanel = defineComponent({
  name: "ClawSkillsPanel",
  setup() {
    const ns = useCsNamespace("claw-skills");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 技能列表 ----
    const skills = ref<SkillInfo[]>([]);
    const loadingSkills = ref(false);

    // ---- 搜索过滤 ----
    const searchKeyword = ref("");

    // ---- 安装表单 ----
    const installUrl = ref("");

    // ---- 详情对话框 ----
    const detailVisible = ref(false);
    const detailSkill = ref<SkillInfo | null>(null);

    // ---- 校验结果 ----
    const checkResults = ref<Array<{ name: string; hasError: boolean; message: string }>>([]);

    /** 加载技能列表 */
    const loadSkills = async () => {
      loadingSkills.value = true;
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 600));
        skills.value = [
          {
            name: "rollup-build",
            status: "enabled",
            version: "1.2.0",
            description: "Rollup 构建技能，自动化打包与产物优化",
            triggerRules: ["build:rollup", "bundle:*"],
            source: "market",
          },
          {
            name: "git-helper",
            status: "enabled",
            version: "2.0.1",
            description: "Git 工作流技能，支持分支管理、冲突解决、PR 创建",
            triggerRules: ["git:*", "pr:create", "merge:*"],
            source: "market",
          },
          {
            name: "jest-runner",
            status: "disabled",
            version: "1.0.3",
            description: "Jest 测试运行器，自动发现并执行测试用例",
            triggerRules: ["test:*", "jest:*"],
            source: "local",
          },
          {
            name: "docker-deploy",
            status: "enabled",
            version: "3.1.0",
            description: "Docker 容器部署技能，构建镜像、编排服务",
            triggerRules: ["docker:*", "deploy:*"],
            source: "market",
          },
          {
            name: "prd-generator",
            status: "error",
            version: "0.9.0",
            description: "PRD 文档生成技能，从需求描述生成产品需求文档",
            triggerRules: ["prd:*", "doc:generate"],
            source: "local",
            hasError: true,
            errorMessage: "TS2307: Cannot find module './template-engine'",
          },
        ];
      } finally {
        loadingSkills.value = false;
      }
    };

    /** 过滤后的技能列表 */
    const filteredSkills = () => {
      if (!searchKeyword.value) {
        return skills.value;
      }
      const keyword = searchKeyword.value.toLowerCase();
      return skills.value.filter(s =>
        s.name.toLowerCase().includes(keyword)
        || (s.description ?? "").toLowerCase().includes(keyword),
      );
    };

    /** 查看技能详情 */
    const handleInfo = async (skill: SkillInfo) => {
      await execCommand(
        `openclaw skills info ${skill.name}`,
        `✓ 已获取 ${skill.name} 详情`,
        500,
      );
      detailSkill.value = skill;
      detailVisible.value = true;
    };

    /** 启用/禁用技能 */
    const handleToggle = async (skill: SkillInfo) => {
      const action = skill.status === "enabled" ? "disable" : "enable";
      const newStatus = skill.status === "enabled" ? "disabled" : "enabled";
      await execCommand(
        `openclaw skills ${action} ${skill.name}`,
        `✓ 技能 "${skill.name}" 已${newStatus === "enabled" ? "启用" : "禁用"}`,
        500,
      );
      skill.status = newStatus;
    };

    /** 校验所有技能 */
    const handleCheck = async () => {
      await execCommand(
        "openclaw skills check",
        "✓ 技能语法校验完成",
        1200,
      );
      // 模拟校验结果
      checkResults.value = skills.value.map(s => ({
        name: s.name,
        hasError: s.hasError ?? false,
        message: s.errorMessage ?? "OK",
      }));
    };

    /** 安装技能 */
    const handleInstall = async () => {
      if (!installUrl.value.trim()) {
        ElMessage.warning("请输入技能包地址");
        return;
      }
      const url = installUrl.value.trim();
      await execCommand(
        `openclaw skills install ${url}`,
        `✓ 技能已从 ${url} 安装成功`,
        1500,
      );
      // 模拟添加新技能
      const name = url.split("/").pop()?.replace(".tar.gz", "") ?? "new-skill";
      skills.value.push({
        name,
        status: "enabled",
        version: "0.1.0",
        description: "新安装的技能",
        source: "market",
        packageUrl: url,
      });
      installUrl.value = "";
    };

    /** 卸载技能 */
    const handleUninstall = async (skill: SkillInfo) => {
      try {
        await ElMessageBox.confirm(
          `确定要卸载技能 "${skill.name}" 吗？`,
          "卸载确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await execCommand(
          `openclaw skills remove ${skill.name}`,
          `✓ 技能 "${skill.name}" 已卸载`,
          600,
        );
        skills.value = skills.value.filter(s => s.name !== skill.name);
      } catch {
        // 取消
      }
    };

    onMounted(() => {
      loadSkills();
    });

    return () => (
      <div class={ns.b()}>
        {/* 技能列表 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><InfoFilled /></el-icon>
          <span>已安装技能</span>
          <el-button
            size="small"
            text
            icon={Refresh}
            loading={loadingSkills.value}
            onClick={loadSkills}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </el-button>
        </div>

        {/* 搜索 */}
        <div class={ns.e("search-row")}>
          <el-input
            size="small"
            v-model={searchKeyword}
            placeholder="搜索技能..."
            clearable
            prefix-icon={Search}
            class={ns.e("search-input")}
          />
        </div>

        {/* 技能卡片列表 */}
        <div class={ns.e("skill-list")}>
          {filteredSkills().length === 0 && !loadingSkills.value && (
            <div class={ns.e("empty")}>暂无已安装技能</div>
          )}
          {loadingSkills.value && (
            <div class={ns.e("loading")}>加载中...</div>
          )}
          {filteredSkills().map(skill => (
            <div key={skill.name} class={ns.e("skill-card")}>
              <div class={ns.e("skill-header")}>
                <span class={ns.e("skill-name")}>{skill.name}</span>
                <div class={ns.e("skill-badges")}>
                  {skill.version && (
                    <el-tag size="small" type="info">{`v${skill.version}`}</el-tag>
                  )}
                  {skill.source && (
                    <el-tag size="small" type={skill.source === "market" ? "success" : "warning"}>
                      {skill.source === "market" ? "市场" : "本地"}
                    </el-tag>
                  )}
                  <span
                    class={ns.e("skill-status")}
                    style={{ color: statusColorMap[skill.status] }}
                  >
                    {statusLabelMap[skill.status]}
                  </span>
                </div>
              </div>
              {skill.description && (
                <div class={ns.e("skill-desc")}>{skill.description}</div>
              )}
              {skill.hasError && (
                <div class={ns.e("skill-error")}>
                  <el-icon size={12} color="#f56c6c"><Warning /></el-icon>
                  <span>{skill.errorMessage}</span>
                </div>
              )}
              <div class={ns.e("skill-meta")}>
                {skill.triggerRules && skill.triggerRules.length > 0 && (
                  <div class={ns.e("skill-triggers")}>
                    {skill.triggerRules.map(rule => (
                      <el-tag key={rule} size="small" type="info" effect="plain">{rule}</el-tag>
                    ))}
                  </div>
                )}
              </div>
              <div class={ns.e("skill-actions")}>
                <el-tooltip content="查看详情">
                  <el-button size="small" text icon={InfoFilled} onClick={() => handleInfo(skill)} />
                </el-tooltip>
                <el-tooltip content={skill.status === "enabled" ? "禁用" : "启用"}>
                  <el-button
                    size="small"
                    text
                    icon={skill.status === "enabled" ? CircleClose : CircleCheck}
                    onClick={() => handleToggle(skill)}
                  />
                </el-tooltip>
                <el-tooltip content="卸载">
                  <el-button
                    size="small"
                    text
                    type="danger"
                    icon={Delete}
                    onClick={() => handleUninstall(skill)}
                  />
                </el-tooltip>
              </div>
            </div>
          ))}
        </div>

        {/* 语法校验 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Warning /></el-icon>
          <span>语法校验</span>
        </div>
        <div class={ns.e("check-section")}>
          <el-button
            size="small"
            type="warning"
            icon={Warning}
            loading={loading.value}
            onClick={handleCheck}
          >
            校验所有技能 (skills check)
          </el-button>
          {checkResults.value.length > 0 && (
            <div class={ns.e("check-results")}>
              {checkResults.value.map(result => (
                <div
                  key={result.name}
                  class={ns.e("check-item")}
                  style={{ color: result.hasError ? "#f56c6c" : "#67c23a" }}
                >
                  <el-icon size={14}>
                    {result.hasError ? <CircleClose /> : <CircleCheck />}
                  </el-icon>
                  <span class={ns.e("check-name")}>{result.name}</span>
                  <span class={ns.e("check-msg")}>{result.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 安装技能 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Download /></el-icon>
          <span>安装技能</span>
        </div>
        <div class={ns.e("install-form")}>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={installUrl}
              placeholder="输入技能包地址（如 npm:@openclaw/skill-rollup 或 https://...）"
              clearable
              class={ns.e("form-input")}
            >
              {{ prefix: () => <span style={{ color: "#909399", fontSize: "12px" }}>skills install</span> }}
            </el-input>
            <el-button
              size="small"
              type="primary"
              icon={Download}
              loading={loading.value}
              disabled={!installUrl.value.trim()}
              onClick={handleInstall}
            >
              安装
            </el-button>
          </div>
        </div>

        {/* 命令日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />

        {/* 详情对话框 */}
        <el-dialog
          v-model={detailVisible.value}
          title={`技能详情 — ${detailSkill.value?.name ?? ""}`}
          width="560px"
          append-to-body
        >
          {detailSkill.value && (
            <el-descriptions column={1} border>
              <el-descriptions-item label="名称">{detailSkill.value.name}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <span style={{ color: statusColorMap[detailSkill.value.status] }}>
                  {statusLabelMap[detailSkill.value.status]}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="版本">{detailSkill.value.version ?? "—"}</el-descriptions-item>
              <el-descriptions-item label="来源">
                {detailSkill.value.source === "market" ? "市场安装" : "本地"}
              </el-descriptions-item>
              <el-descriptions-item label="描述">{detailSkill.value.description ?? "—"}</el-descriptions-item>
              <el-descriptions-item label="触发规则">
                {detailSkill.value.triggerRules && detailSkill.value.triggerRules.length > 0
                  ? detailSkill.value.triggerRules.map(r => (
                      <el-tag key={r} size="small" type="info" style={{ marginRight: "4px" }}>{r}</el-tag>
                    ))
                  : "—"}
              </el-descriptions-item>
              {detailSkill.value.packageUrl && (
                <el-descriptions-item label="包地址">{detailSkill.value.packageUrl}</el-descriptions-item>
              )}
              {detailSkill.value.hasError && (
                <el-descriptions-item label="错误信息">
                  <span style={{ color: "#f56c6c" }}>{detailSkill.value.errorMessage}</span>
                </el-descriptions-item>
              )}
            </el-descriptions>
          )}
        </el-dialog>
      </div>
    );
  },
});

export default SkillsPanel;
