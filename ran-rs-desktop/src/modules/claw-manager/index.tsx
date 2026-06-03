/**
 * Claw Manager 主入口
 *
 * OpenClaw 管理模块，按功能分为九个子页面：
 * - 网关管理：gateway start/stop/restart/status、dashboard、tui
 * - 智能体管理：agents create/list/info/edit/remove/enable/disable/call
 * - 技能管理：skills list/info/check/install/enable/disable
 * - 系统配置：version、onboard、configure
 * - 健康检查与维护：doctor、fix、update、reset、backup
 * - 知识库 RAG：wiki init/status/ingest/search
 * - 定时任务：cron list/add/run/enable/disable/rm
 * - 会话与日志：sessions list/show、logs gateway/agent
 * - 渠道接入：channels list/add/status
 *
 * 接收 activeCategory prop，根据分类 key 渲染对应子页面。
 *
 * @block ran-claw-manager
 */

import { defineComponent } from "vue";
import { useCsNamespace } from "../../hooks/use-namespace";
import AgentsPanel from "./components/agents-panel";
import ChannelsPanel from "./components/channels-panel";
import ConfigPanel from "./components/config-panel";
import CronPanel from "./components/cron-panel";
import GatewayPanel from "./components/gateway-panel";
import MaintenancePanel from "./components/maintenance-panel";
import SessionsPanel from "./components/sessions-panel";
import SkillsPanel from "./components/skills-panel";
import WikiPanel from "./components/wiki-panel";
import "./index.less";

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
          <span class={ns.e("subtitle")}>管理 OpenClaw 网关、智能体、技能、配置与维护</span>
        </div>

        {/* 子页面内容 */}
        <div class={ns.e("content")}>
          {props.activeCategory === "claw-gateway" && <GatewayPanel />}
          {props.activeCategory === "claw-agents" && <AgentsPanel />}
          {props.activeCategory === "claw-skills" && <SkillsPanel />}
          {props.activeCategory === "claw-config" && <ConfigPanel />}
          {props.activeCategory === "claw-maintenance" && <MaintenancePanel />}
          {props.activeCategory === "claw-wiki" && <WikiPanel />}
          {props.activeCategory === "claw-cron" && <CronPanel />}
          {props.activeCategory === "claw-sessions" && <SessionsPanel />}
          {props.activeCategory === "claw-channels" && <ChannelsPanel />}
        </div>
      </div>
    );
  },
});

export default ClawManager;
