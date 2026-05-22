import * as monaco from "monaco-editor";
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";

// 配置 Worker 环境（必须在创建编辑器之前）
let workersConfigured = false;

function configureWorkers(): void {
  if (workersConfigured) {
    return;
  }
  workersConfigured = true;

  (self as Record<string, unknown>).MonacoEnvironment = {
    getWorker(_: unknown, label: string): Worker {
      if (label === "json") {
        return new Worker(
          new URL(
            "monaco-editor/esm/vs/language/json/json.worker?worker",
            import.meta.url,
          ),
          { type: "module" },
        );
      }
      if (label === "typescript" || label === "javascript") {
        return new Worker(
          new URL(
            "monaco-editor/esm/vs/language/typescript/ts.worker?worker",
            import.meta.url,
          ),
          { type: "module" },
        );
      }
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/editor/editor.worker?worker",
          import.meta.url,
        ),
        { type: "module" },
      );
    },
  };
}

const MonacoEditorWrapper = defineComponent({
  name: "MonacoEditorWrapper",
  props: {
    value: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "json",
    },
    readOnly: {
      type: Boolean,
      default: false,
    },
    theme: {
      type: String,
      default: "vs-dark",
    },
    height: {
      type: String,
      default: "400px",
    },
  },
  emits: {
    "update:modelValue": (_value: string) => true,
  },
  setup(props, { emit }) {
    const containerRef = ref<HTMLDivElement>();
    let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    let ignoreNextChange = false;

    onMounted(() => {
      configureWorkers();

      if (!containerRef.value) {
        return;
      }

      editor = monaco.editor.create(containerRef.value, {
        value: props.value,
        language: props.language,
        theme: props.theme,
        readOnly: props.readOnly,
        minimap: { enabled: false },
        lineNumbers: "on",
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 13,
        tabSize: 2,
        renderLineHighlight: "gutter",
        folding: true,
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
      });

      editor.onDidChangeModelContent(() => {
        if (ignoreNextChange) {
          ignoreNextChange = false;
          return;
        }
        const value = editor?.getValue() ?? "";
        emit("update:modelValue", value);
      });
    });

    // 外部 value 变化时同步到编辑器
    watch(
      () => props.value,
      (newVal) => {
        if (editor && editor.getValue() !== newVal) {
          ignoreNextChange = true;
          editor.setValue(newVal ?? "");
        }
      },
    );

    // 语言变化时更新
    watch(
      () => props.language,
      (newLang) => {
        const model = editor?.getModel();
        if (model) {
          monaco.editor.setModelLanguage(model, newLang);
        }
      },
    );

    onBeforeUnmount(() => {
      editor?.dispose();
      editor = null;
    });

    return () => (
      <div
        ref={containerRef}
        style={{ width: "100%", height: props.height, minHeight: "200px" }}
      />
    );
  },
});

export default MonacoEditorWrapper;
