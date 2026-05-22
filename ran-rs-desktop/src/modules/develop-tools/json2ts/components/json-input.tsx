import type { PropType } from "vue";
import { defineComponent } from "vue";
import MonacoEditorWrapper from "./monaco-editor";

const JsonInput = defineComponent({
  name: "JsonInput",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    errors: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  },
  emits: {
    "update:modelValue": (_value: string) => true,
  },
  setup(props, { emit }) {
    return () => (
      <div class="ran-json2ts__input">
        <div class="ran-json2ts__panel-header">JSON 输入</div>
        <MonacoEditorWrapper
          value={props.modelValue}
          language="json"
          readOnly={false}
          height="100%"
          onUpdate:modelValue={(val: string) => emit("update:modelValue", val)}
        />
        {props.errors.length > 0 && (
          <div class="ran-json2ts__errors">
            {props.errors.map((err, i) => (
              <el-alert key={i} type="error" closable={false} showIcon>
                {err}
              </el-alert>
            ))}
          </div>
        )}
      </div>
    );
  },
});

export default JsonInput;
