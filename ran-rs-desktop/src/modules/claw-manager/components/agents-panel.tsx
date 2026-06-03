/**
 * 智能体管理面板
 *
 * 功能：
 * - 智能体列表查看（agents list）
 * - 创建智能体（agents create）
 * - 查看智能体详情（agents info）
 * - 编辑智能体（agents edit）
 * - 删除智能体（agents remove）
 * - 启用/禁用智能体（agents enable/disable）
 * - 手动调用智能体测试（agents call）
 * - 命令执行日志
 *
 * @block ran-claw-agents
 */

import type { AgentInfo } from "../types";
import {
  CircleCheck,
  CircleClose,
  Delete,
  Edit,
  InfoFilled,
  Phone,
  Plus,
  Refresh,
  Search,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, onMounted, reactive, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./agents-panel.less";

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

const AgentsPanel = defineComponent({
  name: "ClawAgentsPanel",
  setup() {
    const ns = useCsNamespace("claw-agents");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 智能体列表 ----
    const agents = ref<AgentInfo[]>([]);
    const loadingAgents = ref(false);

    // ---- 搜索过滤（使用 reactive 避免 IDE 自动移除 ref .value） ----
    const searchState = reactive({
      keyword: "",
    });

    // ---- 创建智能体表单 ----
    const createForm = reactive({
      name: "",
      systemPrompt: "",
      workspaceRoot: "",
      skills: "",
    });

    // ---- 调用测试表单 ----
    const callForm = reactive({
      agentName: "",
      content: "",
    });

    // ---- 详情对话框 ----
    const detailVisible = ref(false);
    const detailAgent = ref<AgentInfo | null>(null);

    // ---- 编辑对话框 ----
    const editVisible = ref(false);
    const editForm = reactive({
      name: "",
      systemPrompt: "",
      skills: "",
    });

    /** 加载智能体列表 */
    const loadAgents = async () => {
      loadingAgents.value = true;
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 600));
        agents.value = [
          {
            name: "dev-coder",
            status: "enabled",
            systemPrompt: "你是一个专业的全栈开发工程师，擅长代码编写、调试和架构设计。",
            workspaceRoot: "D:/openclaw-workspace",
            skills: ["code-gen", "code-review", "debug"],
            description: "全栈开发智能体",
          },
          {
            name: "doc-writer",
            status: "enabled",
            systemPrompt: "你是一个技术文档撰写专家，擅长编写 API 文档、用户手册和技术规范。",
            workspaceRoot: "D:/openclaw-workspace",
            skills: ["doc-gen", "markdown"],
            description: "文档撰写智能体",
          },
          {
            name: "data-analyst",
            status: "disabled",
            systemPrompt: "你是一个数据分析专家，擅长数据清洗、统计分析和可视化。",
            workspaceRoot: "D:/openclaw-workspace",
            skills: ["sql-query", "chart-gen"],
            description: "数据分析智能体",
          },
        ];
      } finally {
        loadingAgents.value = false;
      }
    };

    /** 过滤后的智能体列表 */
    const filteredAgents = () => {
      if (!searchState.keyword) {
        return agents.value;
      }
      const keyword = searchState.keyword.toLowerCase();
      return agents.value.filter(a =>
        a.name.toLowerCase().includes(keyword)
        || (a.description ?? "").toLowerCase().includes(keyword),
      );
    };

    /** 创建智能体 */
    const handleCreate = async () => {
      if (!createForm.name.trim()) {
        ElMessage.warning("请输入智能体名称");
        return;
      }
      const result = await execCommand(
        `openclaw agents create ${createForm.name.trim()}`,
      );
      if (result.success) {
        agents.value.push({
          name: createForm.name.trim(),
          status: "enabled",
          systemPrompt: createForm.systemPrompt || undefined,
          workspaceRoot: createForm.workspaceRoot || undefined,
          skills: createForm.skills ? createForm.skills.split(",").map(s => s.trim()) : [],
          description: "",
        });
        createForm.name = "";
        createForm.systemPrompt = "";
        createForm.workspaceRoot = "";
        createForm.skills = "";
      }
    };

    /** 查看智能体详情 */
    const handleInfo = async (agent: AgentInfo) => {
      await execCommand(
        `openclaw agents info ${agent.name}`,
      );
      detailAgent.value = agent;
      detailVisible.value = true;
    };

    /** 打开编辑对话框 */
    const handleEdit = (agent: AgentInfo) => {
      editForm.name = agent.name;
      editForm.systemPrompt = agent.systemPrompt ?? "";
      editForm.skills = agent.skills?.join(", ") ?? "";
      editVisible.value = true;
    };

    /** 确认编辑 */
    const confirmEdit = async () => {
      if (!editForm.name) {
        return;
      }
      const result = await execCommand(
        `openclaw agents edit ${editForm.name}`,
      );
      if (result.success) {
        const agent = agents.value.find(a => a.name === editForm.name);
        if (agent) {
          agent.systemPrompt = editForm.systemPrompt || undefined;
          agent.skills = editForm.skills ? editForm.skills.split(",").map(s => s.trim()) : [];
        }
        editVisible.value = false;
      }
    };

    /** 删除智能体 */
    const handleRemove = async (agent: AgentInfo) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除智能体 "${agent.name}" 吗？`,
          "删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        const result = await execCommand(
          `openclaw agents remove ${agent.name}`,
        );
        if (result.success) {
          agents.value = agents.value.filter(a => a.name !== agent.name);
        }
      } catch {
        // 取消
      }
    };

    /** 启用/禁用智能体 */
    const handleToggle = async (agent: AgentInfo) => {
      const action = agent.status === "enabled" ? "disable" : "enable";
      const newStatus = agent.status === "enabled" ? "disabled" : "enabled";
      const result = await execCommand(
        `openclaw agents ${action} ${agent.name}`,
      );
      if (result.success) {
        agent.status = newStatus;
      }
    };

    /** 调用智能体测试 */
    const handleCall = async () => {
      if (!callForm.agentName.trim()) {
        ElMessage.warning("请选择要调用的智能体");
        return;
      }
      if (!callForm.content.trim()) {
        ElMessage.warning("请输入测试消息内容");
        return;
      }
      await execCommand(
        `openclaw agents call ${callForm.agentName.trim()} --content "${callForm.content.trim()}"`,
      );
    };

    onMounted(() => {
      loadAgents();
    });

    return () => (
      <div class={ns.b()}>
        {/* 智能体列表 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><InfoFilled /></el-icon>
          <span>智能体列表</span>
          <el-button
            size="small"
            text
            icon={Refresh}
            loading={loadingAgents.value}
            onClick={loadAgents}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </el-button>
        </div>

        {/* 搜索 */}
        <div class={ns.e("search-row")}>
          <el-input
            size="small"
            v-model={searchState.keyword}
            placeholder="搜索智能体..."
            clearable
            prefix-icon={Search}
            class={ns.e("search-input")}
          />
        </div>

        {/* 智能体卡片列表 */}
        <div class={ns.e("agent-list")}>
          {filteredAgents().length === 0 && !loadingAgents.value && (
            <div class={ns.e("empty")}>暂无智能体</div>
          )}
          {loadingAgents.value && (
            <div class={ns.e("loading")}>加载中...</div>
          )}
          {filteredAgents().map(agent => (
            <div key={agent.name} class={ns.e("agent-card")}>
              <div class={ns.e("agent-header")}>
                <span class={ns.e("agent-name")}>{agent.name}</span>
                <span
                  class={ns.e("agent-status")}
                  style={{ color: statusColorMap[agent.status] }}
                >
                  {statusLabelMap[agent.status]}
                </span>
              </div>
              {agent.description && (
                <div class={ns.e("agent-desc")}>{agent.description}</div>
              )}
              <div class={ns.e("agent-meta")}>
                {agent.skills && agent.skills.length > 0 && (
                  <div class={ns.e("agent-skills")}>
                    {agent.skills.map(skill => (
                      <el-tag key={skill} size="small" type="info">{skill}</el-tag>
                    ))}
                  </div>
                )}
              </div>
              <div class={ns.e("agent-actions")}>
                <el-tooltip content="查看详情">
                  <el-button size="small" text icon={InfoFilled} onClick={() => handleInfo(agent)} />
                </el-tooltip>
                <el-tooltip content="编辑">
                  <el-button size="small" text icon={Edit} onClick={() => handleEdit(agent)} />
                </el-tooltip>
                <el-tooltip content={agent.status === "enabled" ? "禁用" : "启用"}>
                  <el-button
                    size="small"
                    text
                    icon={agent.status === "enabled" ? CircleClose : CircleCheck}
                    onClick={() => handleToggle(agent)}
                  />
                </el-tooltip>
                <el-tooltip content="删除">
                  <el-button
                    size="small"
                    text
                    type="danger"
                    icon={Delete}
                    onClick={() => handleRemove(agent)}
                  />
                </el-tooltip>
              </div>
            </div>
          ))}
        </div>

        {/* 创建智能体 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Plus /></el-icon>
          <span>创建智能体</span>
        </div>
        <div class={ns.e("create-form")}>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={createForm.name}
              placeholder="智能体名称（如 dev-coder）"
              clearable
              class={ns.e("form-input")}
            >
              {{ prefix: () => <span style={{ color: "#909399", fontSize: "12px" }}>agents create</span> }}
            </el-input>
            <el-button
              size="small"
              type="primary"
              icon={Plus}
              loading={loading.value}
              disabled={!createForm.name.trim()}
              onClick={handleCreate}
            >
              创建
            </el-button>
          </div>
          <el-input
            size="small"
            v-model={createForm.systemPrompt}
            placeholder="系统提示词（可选，描述智能体角色和行为）"
            type="textarea"
            rows={2}
            class={ns.e("form-textarea")}
          />
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={createForm.workspaceRoot}
              placeholder="工作目录（可选）"
              clearable
              style={{ flex: 1 }}
            />
            <el-input
              size="small"
              v-model={createForm.skills}
              placeholder="绑定技能，逗号分隔（可选）"
              clearable
              style={{ flex: 1 }}
            />
          </div>
        </div>

        {/* 调用测试 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Phone /></el-icon>
          <span>调用测试</span>
        </div>
        <div class={ns.e("call-form")}>
          <div class={ns.e("form-row")}>
            <el-select
              size="small"
              v-model={callForm.agentName}
              placeholder="选择智能体"
              clearable
              filterable
              class={ns.e("call-select")}
            >
              {agents.value.map(a => (
                <el-option key={a.name} label={a.name} value={a.name} />
              ))}
            </el-select>
            <el-input
              size="small"
              v-model={callForm.content}
              placeholder="输入测试消息内容"
              clearable
              style={{ flex: 1 }}
            />
            <el-button
              size="small"
              type="primary"
              icon={Phone}
              loading={loading.value}
              disabled={!callForm.agentName.trim() || !callForm.content.trim()}
              onClick={handleCall}
            >
              调用
            </el-button>
          </div>
        </div>

        {/* 命令日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />

        {/* 详情对话框 */}
        <el-dialog
          v-model={detailVisible.value}
          title={`智能体详情 — ${detailAgent.value?.name ?? ""}`}
          width="560px"
          append-to-body
        >
          {detailAgent.value && (
            <el-descriptions column={1} border>
              <el-descriptions-item label="名称">{detailAgent.value.name}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <span style={{ color: statusColorMap[detailAgent.value.status] }}>
                  {statusLabelMap[detailAgent.value.status]}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="描述">{detailAgent.value.description ?? "—"}</el-descriptions-item>
              <el-descriptions-item label="工作目录">{detailAgent.value.workspaceRoot ?? "—"}</el-descriptions-item>
              <el-descriptions-item label="系统提示词">
                <div class={ns.e("detail-prompt")}>{detailAgent.value.systemPrompt ?? "—"}</div>
              </el-descriptions-item>
              <el-descriptions-item label="绑定技能">
                {detailAgent.value.skills && detailAgent.value.skills.length > 0
                  ? detailAgent.value.skills.map(s => (
                      <el-tag key={s} size="small" type="info" style={{ marginRight: "4px" }}>{s}</el-tag>
                    ))
                  : "—"}
              </el-descriptions-item>
            </el-descriptions>
          )}
        </el-dialog>

        {/* 编辑对话框 */}
        <el-dialog
          v-model={editVisible.value}
          title={`编辑智能体 — ${editForm.name}`}
          width="560px"
          append-to-body
        >
          <el-form label-width="100px">
            <el-form-item label="名称">
              <el-input modelValue={editForm.name} disabled />
            </el-form-item>
            <el-form-item label="系统提示词">
              <el-input
                v-model={editForm.systemPrompt}
                type="textarea"
                rows={4}
                placeholder="描述智能体的角色、行为和能力"
              />
            </el-form-item>
            <el-form-item label="绑定技能">
              <el-input
                v-model={editForm.skills}
                placeholder="技能名称，逗号分隔"
              />
            </el-form-item>
          </el-form>
          {{
            footer: () => (
              <div>
                <el-button onClick={() => editVisible.value = false}>取消</el-button>
                <el-button type="primary" loading={loading.value} onClick={confirmEdit}>保存</el-button>
              </div>
            ),
          }}
        </el-dialog>
      </div>
    );
  },
});

export default AgentsPanel;
