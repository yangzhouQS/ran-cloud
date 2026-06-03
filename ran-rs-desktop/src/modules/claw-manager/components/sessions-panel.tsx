/**
 * 会话 & 日志面板
 *
 * 功能：
 * - 历史会话列表（sessions list）
 * - 查看完整对话（sessions show）
 * - 查看网关日志（logs gateway）
 * - 查看智能体日志（logs agent）
 * - 命令执行日志
 *
 * @block ran-claw-sessions
 */

import type { LogEntry, SessionInfo } from "../types";
import { ChatDotRound, InfoFilled, Refresh, View } from "@element-plus/icons-vue";
import { defineComponent, onMounted, reactive, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./sessions-panel.less";

/** 日志级别颜色映射 */
const logLevelColorMap: Record<string, string> = {
  info: "#67c23a",
  warn: "#e6a23c",
  error: "#f56c6c",
  debug: "#909399",
};

/** 模拟对话消息 */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

const SessionsPanel = defineComponent({
  name: "ClawSessionsPanel",
  setup() {
    const ns = useCsNamespace("claw-sessions");
    const { loading: _loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 会话列表 ----
    const sessions = ref<SessionInfo[]>([]);
    const loadingSessions = ref(false);

    // ---- 对话详情 ----
    const chatVisible = ref(false);
    const chatMessages = ref<ChatMessage[]>([]);
    const chatSessionId = ref("");

    // ---- 日志 ----
    const logEntries = ref<LogEntry[]>([]);
    const loadingLogs = ref(false);

    // ---- 表单状态（使用 reactive 避免 IDE 自动移除 ref .value） ----
    const formState = reactive({
      selectedAgent: "",
    });

    /** 加载会话列表 */
    const loadSessions = async () => {
      loadingSessions.value = true;
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 600));
        sessions.value = [
          {
            id: "sess-a1b2c3",
            agentName: "code-reviewer",
            createdAt: "2026-06-02 14:30:00",
            lastActiveAt: "2026-06-02 15:12:00",
            messageCount: 18,
            summary: "审查了 PR #42 的代码变更，发现 3 个潜在问题",
          },
          {
            id: "sess-d4e5f6",
            agentName: "doc-writer",
            createdAt: "2026-06-01 09:00:00",
            lastActiveAt: "2026-06-01 10:45:00",
            messageCount: 24,
            summary: "生成了 API 接口文档和用户使用指南",
          },
          {
            id: "sess-g7h8i9",
            agentName: "test-runner",
            createdAt: "2026-06-03 08:00:00",
            lastActiveAt: "2026-06-03 08:15:00",
            messageCount: 6,
            summary: "执行了单元测试套件，全部通过",
          },
          {
            id: "sess-j0k1l2",
            agentName: "code-reviewer",
            createdAt: "2026-05-30 16:00:00",
            lastActiveAt: "2026-05-30 16:30:00",
            messageCount: 12,
            summary: "审查了认证模块重构代码",
          },
        ];
      } finally {
        loadingSessions.value = false;
      }
    };

    /** 查看会话详情 */
    const handleShowSession = async (session: SessionInfo) => {
      chatSessionId.value = session.id;
      await execCommand(
        `openclaw sessions show ${session.id}`,
        `✓ 已加载会话 ${session.id} 的对话记录`,
        600,
      );
      // 模拟对话数据
      chatMessages.value = [
        { role: "system", content: `会话已创建，关联智能体: ${session.agentName}`, timestamp: session.createdAt },
        { role: "user", content: "请帮我审查最近提交的代码变更", timestamp: session.createdAt },
        { role: "assistant", content: "好的，我来检查最近的代码变更。发现了以下几处需要关注的地方：\n1. 变量命名不够语义化\n2. 缺少错误处理\n3. 存在潜在的内存泄漏", timestamp: session.lastActiveAt },
        { role: "user", content: "请给出修复建议", timestamp: session.lastActiveAt },
        { role: "assistant", content: "以下是修复建议：\n- 将 `tmp` 重命名为更具描述性的名称\n- 在 async 函数中添加 try-catch\n- 在组件卸载时清理定时器", timestamp: session.lastActiveAt },
      ];
      chatVisible.value = true;
    };

    /** 加载网关日志 */
    const handleLoadGatewayLogs = async () => {
      loadingLogs.value = true;
      try {
        await execCommand(
          "openclaw logs gateway",
          "✓ 已加载网关日志",
          800,
        );
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 400));
        logEntries.value = [
          { timestamp: "2026-06-03 13:24:01", level: "info", message: "Gateway started on port 8080", source: "gateway" },
          { timestamp: "2026-06-03 13:24:02", level: "info", message: "Agent 'code-reviewer' registered", source: "registry" },
          { timestamp: "2026-06-03 13:24:02", level: "info", message: "Agent 'doc-writer' registered", source: "registry" },
          { timestamp: "2026-06-03 13:25:10", level: "warn", message: "Request timeout for agent 'test-runner' (30s)", source: "scheduler" },
          { timestamp: "2026-06-03 13:25:11", level: "info", message: "Retry scheduled for 'test-runner'", source: "scheduler" },
          { timestamp: "2026-06-03 13:26:00", level: "error", message: "Failed to connect to LLM provider: connection refused", source: "llm-client" },
          { timestamp: "2026-06-03 13:26:05", level: "info", message: "LLM provider reconnected successfully", source: "llm-client" },
          { timestamp: "2026-06-03 13:30:00", level: "debug", message: "Health check passed", source: "monitor" },
        ];
      } finally {
        loadingLogs.value = false;
      }
    };

    /** 加载智能体日志 */
    const handleLoadAgentLogs = async () => {
      if (!formState.selectedAgent) {
        return;
      }
      loadingLogs.value = true;
      try {
        await execCommand(
          `openclaw logs agent ${formState.selectedAgent}`,
          `✓ 已加载智能体 "${formState.selectedAgent}" 的日志`,
          800,
        );
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 400));
        logEntries.value = [
          { timestamp: "2026-06-03 12:00:01", level: "info", message: `Agent '${formState.selectedAgent}' initialized`, source: formState.selectedAgent },
          { timestamp: "2026-06-03 12:05:30", level: "info", message: "Processing task: code review", source: formState.selectedAgent },
          { timestamp: "2026-06-03 12:06:00", level: "debug", message: "Loading context from workspace", source: formState.selectedAgent },
          { timestamp: "2026-06-03 12:10:00", level: "info", message: "Task completed successfully", source: formState.selectedAgent },
          { timestamp: "2026-06-03 12:10:01", level: "warn", message: "Response truncated: exceeded max tokens", source: formState.selectedAgent },
        ];
      } finally {
        loadingLogs.value = false;
      }
    };

    onMounted(() => {
      loadSessions();
    });

    return () => (
      <div class={ns.b()}>
        {/* 会话列表 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><ChatDotRound /></el-icon>
          <span>历史会话</span>
          <el-button
            size="small"
            text
            icon={Refresh}
            loading={loadingSessions.value}
            onClick={loadSessions}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </el-button>
        </div>

        <div class={ns.e("session-list")}>
          {sessions.value.length === 0 && !loadingSessions.value && (
            <div class={ns.e("empty")}>暂无历史会话</div>
          )}
          {loadingSessions.value && (
            <div class={ns.e("loading")}>加载中...</div>
          )}
          {sessions.value.map(session => (
            <div key={session.id} class={ns.e("session-card")}>
              <div class={ns.e("session-header")}>
                <span class={ns.e("session-agent")}>{session.agentName}</span>
                <el-tag size="small" type="info">{`${session.messageCount} 条消息`}</el-tag>
              </div>
              {session.summary && (
                <div class={ns.e("session-summary")}>{session.summary}</div>
              )}
              <div class={ns.e("session-meta")}>
                <span>
                  创建：
                  {session.createdAt}
                </span>
                <span>
                  最后活跃：
                  {session.lastActiveAt}
                </span>
              </div>
              <div class={ns.e("session-actions")}>
                <el-button
                  size="small"
                  text
                  icon={View}
                  onClick={() => handleShowSession(session)}
                >
                  查看对话
                </el-button>
              </div>
            </div>
          ))}
        </div>

        {/* 日志查看 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><InfoFilled /></el-icon>
          <span>运行日志</span>
        </div>

        <div class={ns.e("log-controls")}>
          <el-button
            size="small"
            type="primary"
            loading={loadingLogs.value}
            onClick={handleLoadGatewayLogs}
          >
            网关日志 (logs gateway)
          </el-button>
          <div class={ns.e("agent-log-row")}>
            <el-select
              size="small"
              v-model={formState.selectedAgent}
              placeholder="选择智能体"
              clearable
              class={ns.e("agent-select")}
            >
              <el-option label="code-reviewer" value="code-reviewer" />
              <el-option label="doc-writer" value="doc-writer" />
              <el-option label="test-runner" value="test-runner" />
              <el-option label="builder" value="builder" />
            </el-select>
            <el-button
              size="small"
              type="primary"
              loading={loadingLogs.value}
              disabled={!formState.selectedAgent}
              onClick={handleLoadAgentLogs}
            >
              智能体日志 (logs agent)
            </el-button>
          </div>
        </div>

        {/* 日志面板 */}
        {logEntries.value.length > 0 && (
          <div class={ns.e("log-panel")}>
            {logEntries.value.map((entry, index) => (
              <div key={index} class={ns.e("log-entry")}>
                <span class={ns.e("log-time")}>{entry.timestamp}</span>
                <span
                  class={ns.e("log-level")}
                  style={{ color: logLevelColorMap[entry.level] }}
                >
                  [
                  {entry.level.toUpperCase()}
                  ]
                </span>
                <span class={ns.e("log-message")}>{entry.message}</span>
                {entry.source && (
                  <span class={ns.e("log-source")}>{entry.source}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 命令日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />

        {/* 对话详情对话框 */}
        <el-dialog
          v-model={chatVisible.value}
          title={`会话详情 — ${chatSessionId.value}`}
          width="600px"
          append-to-body
        >
          <div class={ns.e("chat-box")}>
            {chatMessages.value.map((msg, index) => (
              <div
                key={index}
                class={[ns.e("chat-msg"), ns.em("chat-msg", msg.role)]}
              >
                <div class={ns.e("msg-role")}>
                  {msg.role === "user" ? "👤 用户" : msg.role === "assistant" ? "🤖 助手" : "⚙️ 系统"}
                </div>
                <div class={ns.e("msg-content")}>{msg.content}</div>
                <div class={ns.e("msg-time")}>{msg.timestamp}</div>
              </div>
            ))}
          </div>
        </el-dialog>
      </div>
    );
  },
});

export default SessionsPanel;
