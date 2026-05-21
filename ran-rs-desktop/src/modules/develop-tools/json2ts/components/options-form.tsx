import type { PropType } from "vue";
import { defineComponent } from "vue";
import type { ConversionOptions } from "../types";

const OptionsForm = defineComponent({
  name: "OptionsForm",
  props: {
    options: {
      type: Object as PropType<ConversionOptions>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <div class="ran-json2ts__options">
        <div class="ran-json2ts__option-item">
          <label class="ran-json2ts__option-label">根类型名称</label>
          <el-input
            modelValue={props.options.rootTypeName}
            onUpdate:modelValue={(val: string) => {
              props.options.rootTypeName = val;
            }}
            placeholder="RootObject"
            size="default"
            style={{ width: "180px" }}
          />
        </div>
        <div class="ran-json2ts__option-item">
          <label class="ran-json2ts__option-label">导出风格</label>
          <el-select
            modelValue={props.options.exportStyle}
            onUpdate:modelValue={(val: "interface" | "type") => {
              props.options.exportStyle = val;
            }}
            size="default"
            style={{ width: "140px" }}
          >
            <el-option label="interface" value="interface" />
            <el-option label="type" value="type" />
          </el-select>
        </div>
        <div class="ran-json2ts__option-item">
          <label class="ran-json2ts__option-label">null 作为可选</label>
          <el-switch
            modelValue={props.options.treatNullAsOptional}
            onUpdate:modelValue={(val: boolean) => {
              props.options.treatNullAsOptional = val;
            }}
            activeText="是"
            inactiveText="否"
          />
        </div>
        <div class="ran-json2ts__option-item">
          <label class="ran-json2ts__option-label">缩进</label>
          <el-input-number
            modelValue={props.options.indentSize}
            onUpdate:modelValue={(val: number | undefined) => {
              props.options.indentSize = val ?? 2;
            }}
            min={2}
            max={8}
            step={2}
            size="default"
            style={{ width: "120px" }}
          />
        </div>
      </div>
    );
  },
});

export default OptionsForm;
