/**
 * Claw Manager 主入口
 *
 * OpenClaw 管理模块，按功能分为三个子页面：
 * - 网关管理：gateway start/stop/restart/status、dashboard、tui
 * - 系统配置：version、onboard、configure
 * - 健康检查与维护：doctor、fix、update、reset、backup
 *
 * 接收 activeCategory prop，根据分类 key 渲染对应子页面。
 *
 * @block ran-claw-manager
 */

import { defineComponent } from "vue";
import { useCsNamespace } from "../../hooks/use-namespace";
import ConfigPanel from "./components/config-panel";
import GatewayPanel from "./components/gateway-panel";
import MaintenancePanel from "./components/maintenance-panel";
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
