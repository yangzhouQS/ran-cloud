/**
 * 开发工具模块主入口
 *
 * 包装组件，根据 activeCategory prop 渲染对应的子面板：
 * - k8s-network-tools → TelepresencePanel
 * - json2ts → Json2TsPanel
 *
 * @module develop-tools
 */

import { defineComponent } from "vue";
import { Json2TsPanel } from "./json2ts";
import { TelepresencePanel } from "./telepresence";

const DevelopTools = defineComponent({
  name: "DevelopTools",
  props: {
    activeCategory: {
      type: String,
      default: "k8s-network-tools",
    },
  },
  setup(props) {
    return () => {
      switch (props.activeCategory) {
        case "json2ts":
          return <Json2TsPanel />;
        default:
          return <TelepresencePanel />;
      }
    };
  },
});

export default DevelopTools;
