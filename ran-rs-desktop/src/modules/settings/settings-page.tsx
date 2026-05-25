import { InfoFilled, Setting } from "@element-plus/icons-vue";
import { defineComponent, ref } from "vue";
import { useCsNamespace } from "../layout/hooks/use-namespace";
import "./standalone-page.less";

const SettingsPage = defineComponent({
  name: "SettingsPage",
  setup() {
    const nsStandalone = useCsNamespace("standalone");
    const ns = useCsNamespace("settings");

    const theme = ref("light");
    const language = ref("zh-CN");

    return () => (
      <div class={nsStandalone.b()}>
        <div class={nsStandalone.e("header")}>
          <h1 class={nsStandalone.e("title")}>
            <el-icon style={{ marginRight: "8px", verticalAlign: "middle" }}>
              <Setting />
            </el-icon>
            设置
          </h1>
        </div>
        <div class={nsStandalone.e("body")}>
          <div class={ns.e("section")}>
            <h3 class={ns.e("section-title")}>通用设置</h3>
            <div class={ns.e("item")}>
              <div class={ns.e("item-content")}>
                <span class={ns.e("item-label")}>主题</span>
                <span class={ns.e("item-desc")}>应用界面主题</span>
              </div>
              <el-select v-model={theme.value} size="small" style={{ width: "120px" }} disabled>
                <el-option label="浅色" value="light" />
                <el-option label="深色" value="dark" />
              </el-select>
            </div>
            <el-divider />
            <div class={ns.e("item")}>
              <div class={ns.e("item-content")}>
                <span class={ns.e("item-label")}>语言</span>
                <span class={ns.e("item-desc")}>界面显示语言</span>
              </div>
              <el-select v-model={language.value} size="small" style={{ width: "120px" }} disabled>
                <el-option label="简体中文" value="zh-CN" />
                <el-option label="English" value="en" />
              </el-select>
            </div>
          </div>

          <div class={ns.e("section")}>
            <h3 class={ns.e("section-title")}>Kubernetes</h3>
            <div class={ns.e("item")}>
              <div class={ns.e("item-content")}>
                <span class={ns.e("item-label")}>默认命名空间</span>
                <span class={ns.e("item-desc")}>连接时默认使用的命名空间</span>
              </div>
              <el-tag>dev-mc</el-tag>
            </div>
            <el-divider />
            <div class={ns.e("item")}>
              <div class={ns.e("item-content")}>
                <span class={ns.e("item-label")}>Telepresence 版本</span>
                <span class={ns.e("item-desc")}>当前安装的版本</span>
              </div>
              <el-tag type="info">检测中...</el-tag>
            </div>
          </div>

          <div class={ns.e("section")}>
            <div class={ns.e("placeholder")}>
              <el-icon size={32} color="#c0c4cc">
                <InfoFilled />
              </el-icon>
              <p>更多设置功能开发中...</p>
            </div>
          </div>
        </div>
      </div>
    );
  },
});

export default SettingsPage;
