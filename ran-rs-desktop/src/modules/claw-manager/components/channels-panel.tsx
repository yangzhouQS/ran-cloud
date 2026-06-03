/**
 * 渠道接入面板
 *
 * 功能：
 * - 已接入渠道列表（channels list）
 * - 添加渠道（channels add）
 * - 查看连通状态（channels status）
 * - 命令执行日志
 *
 * @block ran-claw-channels
 */

import type { ChannelInfo } from "../types";
import { Connection, Delete, InfoFilled, Link, Plus, Refresh } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineComponent, onMounted, reactive, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./channels-panel.less";

/** 渠道类型标签映射 */
const channelTypeLabelMap: Record<string, string> = {
  feishu: "飞书",
  wecom: "企业微信",
  dingtalk: "钉钉",
  slack: "Slack",
};

/** 渠道类型颜色映射 */
const channelTypeColorMap: Record<string, string> = {
  feishu: "#3370ff",
  wecom: "#07c160",
  dingtalk: "#0089ff",
  slack: "#4a154b",
};

/** 状态颜色映射 */
const statusColorMap: Record<string, string> = {
  connected: "#67c23a",
  disconnected: "#909399",
  error: "#f56c6c",
};

/** 状态标签映射 */
const statusLabelMap: Record<string, string> = {
  connected: "已连接",
  disconnected: "已断开",
  error: "异常",
};

const ChannelsPanel = defineComponent({
  name: "ClawChannelsPanel",
  setup() {
    const ns = useCsNamespace("claw-channels");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 渠道列表 ----
    const channels = ref<ChannelInfo[]>([]);
    const loadingChannels = ref(false);

    // ---- 表单状态（使用 reactive 避免 IDE 自动移除 ref .value） ----
    const formState = reactive({
      channelType: "" as "" | "feishu" | "wecom" | "dingtalk" | "slack",
      channelName: "",
      webhookUrl: "",
      description: "",
    });

    /** 加载渠道列表 */
    const loadChannels = async () => {
      loadingChannels.value = true;
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 600));
        channels.value = [
          {
            id: "ch-001",
            type: "feishu",
            name: "飞书通知群",
            status: "connected",
            webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
            lastConnectedAt: "2026-06-03 13:00:00",
            description: "项目通知推送群",
          },
          {
            id: "ch-002",
            type: "wecom",
            name: "企业微信运维",
            status: "connected",
            webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
            lastConnectedAt: "2026-06-03 12:50:00",
            description: "运维告警通知",
          },
          {
            id: "ch-003",
            type: "dingtalk",
            name: "钉钉开发群",
            status: "disconnected",
            webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=xxx",
            description: "开发团队通知",
          },
          {
            id: "ch-004",
            type: "slack",
            name: "Slack CI Channel",
            status: "error",
            webhookUrl: "https://hooks.slack.com/services/xxx",
            lastConnectedAt: "2026-05-28 10:00:00",
            description: "CI/CD 构建通知",
          },
        ];
      } finally {
        loadingChannels.value = false;
      }
    };

    /** 查看连通状态 */
    const handleCheckStatus = async () => {
      await execCommand(
        "openclaw channels status",
        "✓ 渠道连通状态检查完成",
        1000,
      );
    };

    /** 添加渠道 */
    const handleAdd = async () => {
      if (!formState.channelType) {
        ElMessage.warning("请选择渠道类型");
        return;
      }
      if (!formState.channelName.trim()) {
        ElMessage.warning("请输入渠道名称");
        return;
      }
      if (!formState.webhookUrl.trim()) {
        ElMessage.warning("请输入 Webhook 地址");
        return;
      }
      await execCommand(
        `openclaw channels add ${formState.channelType} --name "${formState.channelName}" --webhook "${formState.webhookUrl}"`,
        `✓ 渠道 "${formState.channelName}" 添加成功`,
        800,
      );
      // 模拟添加新渠道
      const newChannel: ChannelInfo = {
        id: `ch-${String(channels.value.length + 1).padStart(3, "0")}`,
        type: formState.channelType,
        name: formState.channelName,
        status: "connected",
        webhookUrl: formState.webhookUrl,
        description: formState.description || undefined,
        lastConnectedAt: new Date().toLocaleString(),
      };
      channels.value.push(newChannel);
      formState.channelType = "";
      formState.channelName = "";
      formState.webhookUrl = "";
      formState.description = "";
    };

    /** 删除渠道 */
    const handleDelete = async (channel: ChannelInfo) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除渠道 "${channel.name}" 吗？`,
          "删除确认",
          { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
        );
        await execCommand(
          `openclaw channels rm ${channel.id}`,
          `✓ 渠道 "${channel.name}" 已删除`,
          500,
        );
        channels.value = channels.value.filter(c => c.id !== channel.id);
      } catch {
        // 取消
      }
    };

    onMounted(() => {
      loadChannels();
    });

    return () => (
      <div class={ns.b()}>
        {/* 渠道列表 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Connection /></el-icon>
          <span>已接入渠道</span>
          <el-button
            size="small"
            text
            icon={Refresh}
            loading={loadingChannels.value}
            onClick={loadChannels}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </el-button>
        </div>

        <div class={ns.e("channel-list")}>
          {channels.value.length === 0 && !loadingChannels.value && (
            <div class={ns.e("empty")}>暂无已接入渠道</div>
          )}
          {loadingChannels.value && (
            <div class={ns.e("loading")}>加载中...</div>
          )}
          {channels.value.map(channel => (
            <div key={channel.id} class={ns.e("channel-card")}>
              <div class={ns.e("channel-header")}>
                <div class={ns.e("channel-name-row")}>
                  <span
                    class={ns.e("channel-type-dot")}
                    style={{ background: channelTypeColorMap[channel.type] }}
                  />
                  <span class={ns.e("channel-name")}>{channel.name}</span>
                </div>
                <div class={ns.e("channel-badges")}>
                  <el-tag size="small" style={{ color: channelTypeColorMap[channel.type], borderColor: channelTypeColorMap[channel.type] }}>
                    {channelTypeLabelMap[channel.type]}
                  </el-tag>
                  <span
                    class={ns.e("channel-status")}
                    style={{ color: statusColorMap[channel.status] }}
                  >
                    {statusLabelMap[channel.status]}
                  </span>
                </div>
              </div>
              {channel.description && (
                <div class={ns.e("channel-desc")}>{channel.description}</div>
              )}
              <div class={ns.e("channel-meta")}>
                {channel.webhookUrl && (
                  <div class={ns.e("meta-item")}>
                    <el-icon size={12}><Link /></el-icon>
                    <span class={ns.e("meta-webhook")}>{channel.webhookUrl}</span>
                  </div>
                )}
                {channel.lastConnectedAt && (
                  <div class={ns.e("meta-item")}>
                    <span>
                      最后连通：
                      {channel.lastConnectedAt}
                    </span>
                  </div>
                )}
              </div>
              <div class={ns.e("channel-actions")}>
                <el-tooltip content="删除渠道">
                  <el-button
                    size="small"
                    text
                    type="danger"
                    icon={Delete}
                    onClick={() => handleDelete(channel)}
                  />
                </el-tooltip>
              </div>
            </div>
          ))}
        </div>

        {/* 连通状态检查 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><InfoFilled /></el-icon>
          <span>连通状态</span>
        </div>
        <div class={ns.e("status-section")}>
          <el-button
            size="small"
            type="primary"
            icon={Connection}
            loading={loading.value}
            onClick={handleCheckStatus}
          >
            检查所有渠道连通性 (channels status)
          </el-button>
        </div>

        {/* 添加渠道 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Plus /></el-icon>
          <span>添加渠道</span>
        </div>
        <div class={ns.e("add-form")}>
          <div class={ns.e("form-row")}>
            <el-select
              size="small"
              v-model={formState.channelType}
              placeholder="选择渠道类型"
              class={ns.e("form-input")}
            >
              <el-option label="飞书" value="feishu" />
              <el-option label="企业微信" value="wecom" />
              <el-option label="钉钉" value="dingtalk" />
              <el-option label="Slack" value="slack" />
            </el-select>
          </div>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={formState.channelName}
              placeholder="渠道名称"
              class={ns.e("form-input")}
            />
          </div>
          <div class={ns.e("form-row")}>
            <el-input
              size="small"
              v-model={formState.webhookUrl}
              placeholder="Webhook 地址"
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
            disabled={!formState.channelType || !formState.channelName.trim() || !formState.webhookUrl.trim()}
            onClick={handleAdd}
          >
            添加渠道 (channels add)
          </el-button>
        </div>

        {/* 命令日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default ChannelsPanel;
