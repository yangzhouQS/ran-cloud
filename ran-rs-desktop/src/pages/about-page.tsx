import { Monitor } from "@element-plus/icons-vue";
import { defineComponent } from "vue";
import { useCsNamespace } from "../hooks/use-namespace";
import "./standalone-page.less";

const AboutPage = defineComponent({
  name: "AboutPage",
  setup() {
    const nsStandalone = useCsNamespace("standalone");
    const ns = useCsNamespace("about");

    return () => (
      <div class={nsStandalone.b()}>
        <div class={nsStandalone.e("header")}>
          <h1 class={nsStandalone.e("title")}>
            <el-icon style={{ marginRight: "8px", verticalAlign: "middle" }}>
              <Monitor />
            </el-icon>
            关于
          </h1>
        </div>
        <div class={[nsStandalone.e("body"), ns.b()]}>
          <div class={ns.e("logo")}>
            <el-icon size={64} color="#667eea">
              <Monitor />
            </el-icon>
          </div>
          <h2 class={ns.e("name")}>Ran RS Desktop</h2>
          <p class={ns.e("version")}>版本 0.1.0</p>
          <el-divider />
          <div class={ns.e("info-list")}>
            <div class={ns.e("info-row")}>
              <span class={ns.e("info-label")}>技术栈</span>
              <span class={ns.e("info-value")}>Tauri 2 + Vue 3 + Element Plus + Rsbuild</span>
            </div>
            <div class={ns.e("info-row")}>
              <span class={ns.e("info-label")}>功能</span>
              <span class={ns.e("info-value")}>Kubernetes 本地开发连接管理工具</span>
            </div>
            <div class={ns.e("info-row")}>
              <span class={ns.e("info-label")}>核心依赖</span>
              <span class={ns.e("info-value")}>Telepresence CLI</span>
            </div>
          </div>
          <el-divider />
          <p class={ns.e("copyright")}>© 2026 Ran RS Desktop</p>
        </div>
      </div>
    );
  },
});

export default AboutPage;
