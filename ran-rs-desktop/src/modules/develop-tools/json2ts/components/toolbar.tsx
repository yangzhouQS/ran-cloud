import { DocumentCopy, Refresh, RefreshRight } from "@element-plus/icons-vue";
import { defineComponent } from "vue";

const Toolbar = defineComponent({
  name: "Json2TsToolbar",
  props: {
    canConvert: {
      type: Boolean,
      default: false,
    },
    canCopy: {
      type: Boolean,
      default: false,
    },
  },
  emits: {
    convert: () => true,
    copy: () => true,
    clear: () => true,
    reset: () => true,
  },
  setup(props, { emit }) {
    return () => (
      <div class="ran-json2ts__toolbar">
        <el-button
          type="primary"
          icon={Refresh}
          disabled={!props.canConvert}
          onClick={() => emit("convert")}
        >
          转换
        </el-button>
        <el-button
          type="success"
          icon={DocumentCopy}
          disabled={!props.canCopy}
          onClick={() => emit("copy")}
        >
          复制结果
        </el-button>
        <el-button
          icon={RefreshRight}
          onClick={() => emit("clear")}
        >
          清空
        </el-button>
        <el-button
          type="info"
          onClick={() => emit("reset")}
        >
          重置
        </el-button>
      </div>
    );
  },
});

export default Toolbar;
