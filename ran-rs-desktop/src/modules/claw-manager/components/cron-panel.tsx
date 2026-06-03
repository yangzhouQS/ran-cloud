/**
 * 定时任务管理面板
 *
 * 功能：
 * - 任务列表查看（cron list）
 * - 新建任务（cron add）
 * - 立即执行（cron run）
 * - 启停切换（cron enable/disable）
 * - 删除任务（cron rm）
 * - 命令执行日志
 *
 * @block ran-claw-cron
 */

import type { CronTaskInfo } from "../types";
import {
  CircleCheck,
  CircleClose,
  Delete,
  InfoFilled,
  Plus,
  Refresh,
  VideoPlay,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, onMounted, reactive, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./cron-panel.less";

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

const CronPanel = defineComponent({
  name: "ClawCronPanel",
  setup() {
    const ns = useCsNamespace("claw-cron");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 任务列表 ----
    const tasks = ref<CronTaskInfo[]>([]);
    const loadingTasks = ref(false);

    // ---- 表单状态（使用 reactive 避免 IDE 自动移除 ref .value） ----
    const formState = reactive({
      name: "",
      cronExpression: "",
      command: "",
      description: "",
    });

    /** 加载任务列表 */
    const loadTasks = async () => {
      loadingTasks.value = true;
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 600));
        tasks.value = [
          {
            id: "cron-001",
            name: "每日构建报告",
            cronExpression: "0 8 * * *",
            command: "openclaw agents call builder --task daily-report",
            status: "enabled",
            lastRunAt: "2026-06-02 08:00:00",
            nextRunAt: "2026-06-03 08:00:00",
            description: "每天早上 8 点自动生成构建报告",
          },
          {
            id: "cron-002",
            name: "知识库增量索引",
            cronExpression: "0 */4 * * *",
            command: "openclaw wiki ingest ./docs",
            status: "enabled",
            lastRunAt: "2026-06-03 04:00:00",
            nextRunAt: "2026-06-03 08:00:00",
            description: "每 4 小时增量导入文档",
          },
          {
            id: "cron-003",
            name: "健康检查",
            cronExpression: "*/30 * * * *",
            command: "openclaw doctor --auto-fix",
            status: "disabled",
            lastRunAt: "2026-06-01 12:00:00",
            nextRunAt: "—",
            description: "每 30 分钟执行一次健康检查",
          },
          {
            id: "cron-004",
            name: "数据备份",
            cronExpression: "0 2 * * 0",
            command: "openclaw backup create --full",
            status: "error",
            lastRunAt: "2026-05-26 02:00:00",
            nextRunAt: "2026-06-02 02:00:00",
            description: "每周日凌晨 2 点全量备份",
          },
        ];
      } finally {
        loadingTasks.value = false;
      }
    };

    /** 新建任务 */
    const handleAdd = async () => {
      if (!formState.name.trim()) {
        ElMessage.warning("请输入任务名称");
        return;
      }
      if (!formState.cronExpression.trim()) {
        ElMessage.warning("请输入 cron 表达式");
        return;
      }
      if (!formState.command.trim()) {
        ElMessage.warning("请输入执行指令");
        return;
      }
      await execCommand(
        `openclaw cron add --name "${formState.name}" --cron "${formState.cronExpression}" --command "${formState.command}"`,
        `✓ 定时任务 "${formState.name}" 创建成功`,
        800,
      );
      // 模拟添加新任务
      const newTask: CronTaskInfo = {
        id: `cron-${String(tasks.value.length + 1).padStart(3, "0")}`,
        name: formState.name,
        cronExpression: formState.cronExpression,
        command: formState.command,
        status: "enabled",
        description: formState.description || undefined,
      };
      tasks.value.push(newTask);
      formState.name = "";
      formState.cronExpression = "";
      formState.command = "";
      formState.description = "";
    };

    /** 立即执行 */
    const handleRun = async (task: CronTaskInfo) => {
      await execCommand(
        `openclaw cron run ${task.id}`,
        `✓ 任务 "${task.name}" 已触发执行`,
        600,
      );
      task.lastRunAt = new Date().toLocaleString();
    };

    /** 启停切换 */
    const handleToggle = async (task: CronTaskInfo) => {
      const action = task.status === "enabled" ? "disable" : "enable";
      const newStatus = task.status === "enabled" ? "disabled" : "enabled";
      await execCommand(
        `openclaw cron ${action} ${task.id}`,
        `✓ 任务 "${task.name}" 已${newStatus === "enabled" ? "启用" : "禁用"}`,
        500,
      );
      task.status = newStatus;
    };

    /** 删除任务 */
    const handleDelete = async (task: CronTaskInfo) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除定时任务 "${task.name}" 吗？`,
          "删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await execCommand(
          `openclaw cron rm ${task.id}`,
          `✓ 任务 "${task.name}" 已删除`,
          500,
        );
        tasks.value = tasks.value.filter(t => t.id !== task.id);
      } catch {
        // 取消
      }
    };

    onMounted(() => {
      loadTasks();
    });

    return () => (
      <div class={ns.b()}>
        {/* 任务列表 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><InfoFilled /></el-icon>
          <span>定时任务列表</span>
          <el-button
            size="small"
            text
            icon={Refresh}
            loading={loadingTasks.value}
            onClick={loadTasks}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </el-button>
        </div>

        <div class={ns.e("task-list")}>
          {tasks.value.length === 0 && !loadingTasks.value && (
            <div class={ns.e("empty")}>暂无定时任务</div>
          )}
          {loadingTasks.value && (
            <div class={ns.e("loading")}>加载中...</div>
          )}
          {tasks.value.map(task => (
            <div key={task.id} class={ns.e("task-card")}>
              <div class={ns.e("task-header")}>
                <span class={ns.e("task-name")}>{task.name}</span>
                <div class={ns.e("task-badges")}>
                  <el-tag size="small" type="info">{task.id}</el-tag>
                  <span
                    class={ns.e("task-status")}
                    style={{ color: statusColorMap[task.status] }}
                  >
                    {statusLabelMap[task.status]}
                  </span>
                </div>
              </div>
              {task.description && (
                <div class={ns.e("task-desc")}>{task.description}</div>
              )}
              <div class={ns.e("task-meta")}>
                <div class={ns.e("meta-item")}>
                  <span class={ns.e("meta-label")}>Cron：</span>
                  <code class={ns.e("meta-code")}>{task.cronExpression}</code>
                </div>
                <div class={ns.e("meta-item")}>
                  <span class={ns.e("meta-label")}>指令：</span>
                  <code class={ns.e("meta-code")}>{task.command}</code>
                </div>
                <div class={ns.e("meta-item")}>
                  <span class={ns.e("meta-label")}>上次执行：</span>
                  <span>{task.lastRunAt ?? "—"}</span>
                </div>
                <div class={ns.e("meta-item")}>
                  <span class={ns.e("meta-label")}>下次执行：</span>
                  <span>{task.nextRunAt ?? "—"}</span>
                </div>
              </div>
              <div class={ns.e("task-actions")}>
                <el-tooltip content="立即执行">
                  <el-button size="small" text icon={VideoPlay} onClick={() => handleRun(task)} />
                </el-tooltip>
                <el-tooltip content={task.status === "enabled" ? "禁用" : "启用"}>
                  <el-button
                    size="small"
                    text
                    icon={task.status === "enabled" ? CircleClose : CircleCheck}
                    onClick={() => handleToggle(task)}
                  />
                </el-tooltip>
                <el-tooltip content="删除">
                  <el-button
                    size="small"
                    text
                    type="danger"
                    icon={Delete}
                    onClick={() => handleDelete(task)}
                  />
                </el-tooltip>
              </div>
            </div>
          ))}
        </div>

        {/* 新建任务 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Plus /></el-icon>
          <span>新建定时任务</span>
        </div>
        <div class={ns.e("add-form")}>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={formState.name}
              placeholder="任务名称"
              class={ns.e("form-input")}
            />
          </div>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={formState.cronExpression}
              placeholder="Cron 表达式（如 0 8 * * *）"
              class={ns.e("form-input")}
            />
          </div>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={formState.command}
              placeholder="执行的 openclaw 指令"
              class={ns.e("form-input")}
            />
          </div>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={formState.description}
              placeholder="描述（可选）"
              class={ns.e("form-input")}
            />
          </div>
          <el-button
            type="primary"
            icon={Plus}
            loading={loading.value}
            disabled={!formState.name.trim() || !formState.cronExpression.trim() || !formState.command.trim()}
            onClick={handleAdd}
          >
            创建任务 (cron add)
          </el-button>
        </div>

        {/* 命令日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default CronPanel;
