import { defineComponent } from "vue";
import MonacoEditorWrapper from "./monaco-editor";

const TsOutput = defineComponent({
  name: "TsOutput",
  props: {
    value: {
      type: String,
      default: "",
    },
    isEmpty: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    return () => (
      <div class="ran-json2ts__output">
        <div class="ran-json2ts__panel-header">TypeScript 输出</div>
        {props.isEmpty
          ? (
              <div class="ran-json2ts__empty">
                <el-empty description="点击转换按钮生成 TypeScript 类型定义" imageSize={60} />
              </div>
            )
          : (
              <MonacoEditorWrapper
                value={props.value}
                language="typescript"
                readOnly={true}
                height="100%"
              />
            )}
      </div>
    );
  },
});

export default TsOutput;
