import { DocumentCopy } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { defineComponent, reactive, ref } from "vue";
import { useCsNamespace } from "../../../layout/hooks/use-namespace";
import { convertJsonToTs } from "../services/json-to-ts";
import { defaultConversionOptions } from "../types";
import JsonInput from "./json-input";
import OptionsForm from "./options-form";
import Toolbar from "./toolbar";
import TsOutput from "./ts-output";
import "./json2ts-panel.less";

const Json2TsPanel = defineComponent({
  name: "Json2TsPanel",
  setup() {
    // ===== BEM 命名空间 =====
    const nsPage = useCsNamespace("content-page");
    const nsSection = useCsNamespace("content-section");

    // ===== 状态 =====
    const jsonInput = ref("");
    const tsOutput = ref("");
    const errors = ref<string[]>([]);
    const options = reactive({ ...defaultConversionOptions });

    // ===== 操作方法 =====
    const handleConvert = () => {
      if (!jsonInput.value.trim()) {
        ElMessage.warning("请输入 JSON 内容");
        return;
      }
      const result = convertJsonToTs(jsonInput.value, { ...options });
      tsOutput.value = result.output;
      errors.value = result.errors;

      if (result.errors.length === 0) {
        ElMessage.success(`转换成功，生成 ${result.types.length} 个类型定义`);
      }
    };

    const handleCopy = async () => {
      if (!tsOutput.value) {
        return;
      }
      try {
        await navigator.clipboard.writeText(tsOutput.value);
        ElMessage.success("已复制到剪贴板");
      } catch {
        ElMessage.error("复制失败");
      }
    };

    const handleClear = () => {
      jsonInput.value = "";
      tsOutput.value = "";
      errors.value = [];
    };

    const handleReset = () => {
      handleClear();
      Object.assign(options, { ...defaultConversionOptions });
    };

    // ===== 渲染 =====
    return () => (
      <div class={nsPage.b()}>
        {/* 页面标题 */}
        <div class={nsPage.e("header")}>
          <h2 class={nsPage.e("title")}>
            <el-icon style={{ marginRight: "8px", verticalAlign: "middle" }}>
              <DocumentCopy />
            </el-icon>
            JSON → TypeScript 转换工具
          </h2>
        </div>

        {/* 选项表单 */}
        <div class={nsSection.b()}>
          <OptionsForm options={options} />
        </div>

        {/* 工具栏 */}
        <div class={nsSection.b()}>
          <Toolbar
            canConvert={jsonInput.value.trim().length > 0}
            canCopy={tsOutput.value.length > 0}
            onConvert={handleConvert}
            onCopy={handleCopy}
            onClear={handleClear}
            onReset={handleReset}
          />
        </div>

        {/* 双栏编辑区 */}
        <div class={nsSection.b()} style={{ padding: 0, overflow: "hidden" }}>
          <div class="ran-json2ts__split">
            <JsonInput
              modelValue={jsonInput.value}
              errors={errors.value}
              onUpdate:modelValue={(val: string) => {
                jsonInput.value = val;
              }}
            />
            <TsOutput
              value={tsOutput.value}
              isEmpty={tsOutput.value.length === 0}
            />
          </div>
        </div>
      </div>
    );
  },
});

export default Json2TsPanel;
