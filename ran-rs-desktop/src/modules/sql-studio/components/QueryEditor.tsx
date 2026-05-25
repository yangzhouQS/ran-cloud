/**
 * SQL Studio 查询编辑器
 *
 * 基于 Monaco Editor 的 SQL 编辑器组件。
 * 支持语法高亮、自动补全、快捷键执行、查询历史。
 *
 * @block ran-sql-query-editor
 */

import type { PropType } from "vue";
import type { QueryHistory } from "../types/query";
import { defineComponent, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useCsNamespace } from "../../layout/hooks/use-namespace";

const DEFAULT_SQL = "-- 在此输入 SQL 查询\nSELECT 1;";

const QueryEditor = defineComponent({
  name: "SqlQueryEditor",
  props: {
    connectionId: { type: String as PropType<string | null>, default: null },
    database: { type: String as PropType<string | null>, default: null },
    executing: { type: Boolean, default: false },
    queryHistory: { type: Array as PropType<QueryHistory[]>, default: () => [] },
    draftContent: { type: String, default: "" },
    onExecute: { type: Function as PropType<(sql: string) => Promise<void>>, required: true },
    onDraftChange: { type: Function as PropType<(sql: string) => void>, default: undefined },
  },
  setup(props) {
    const ns = useCsNamespace("sql-query-editor");
    const editorContainerRef = ref<HTMLElement | null>(null);
    const editorInstance = shallowRef<any>(null);
    const sqlContent = ref(props.draftContent || DEFAULT_SQL);
    const showHistory = ref(false);

    /** 执行 SQL */
    const handleExecute = async (sql?: string) => {
      const query = sql ?? sqlContent.value;
      if (!query.trim()) {
        return;
      }
      await props.onExecute(query.trim());
    };

    /** 初始化 Monaco Editor */
    onMounted(async () => {
      if (!editorContainerRef.value) {
        return;
      }

      try {
        const monaco = await import("monaco-editor");
        const editor = monaco.editor.create(editorContainerRef.value, {
          value: sqlContent.value,
          language: "sql",
          theme: "vs-dark",
          fontSize: 14,
          lineNumbers: "on",
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 2,
          renderLineHighlight: "line",
          folding: true,
          bracketPairColorization: { enabled: true },
          padding: { top: 8 },
        });

        editorInstance.value = editor;

        // Ctrl+Enter / Cmd+Enter 执行查询
        editor.addAction({
          id: "run-sql",
          label: "Run SQL",
          keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
          ],
          run: () => {
            const selection = editor.getSelection();
            const model = editor.getModel();
            if (selection && model && !selection.isEmpty()) {
              handleExecute(model.getValueInRange(selection));
            } else {
              handleExecute(editor.getValue());
            }
          },
        });

        // 同步编辑器内容
        editor.onDidChangeModelContent(() => {
          const value = editor.getValue();
          sqlContent.value = value;
          props.onDraftChange?.(value);
        });
      } catch (e) {
        console.error("Monaco Editor 初始化失败:", e);
      }
    });

    onBeforeUnmount(() => {
      editorInstance.value?.dispose();
    });

    // 监听 draftContent 变化（连接切换时更新编辑器内容）
    watch(() => props.draftContent, (newDraft) => {
      if (newDraft !== undefined && editorInstance.value) {
        const content = newDraft || DEFAULT_SQL;
        // 只在内容不同时更新，避免光标跳动
        if (editorInstance.value.getValue() !== content) {
          editorInstance.value.setValue(content);
        }
      }
    });

    /** 清空编辑器 */
    const handleClear = () => {
      editorInstance.value?.setValue("");
    };

    /** 使用历史记录填充编辑器 */
    const useHistory = (sql: string) => {
      editorInstance.value?.setValue(sql);
      showHistory.value = false;
    };

    /** 格式化时间 */
    const formatTime = (dateStr: string) => {
      try {
        const d = new Date(dateStr);
        return d.toLocaleString();
      } catch {
        return dateStr;
      }
    };

    return () => (
      <div class={ns.b()}>
        {/* 工具栏 */}
        <div class={ns.e("toolbar")}>
          <div class={ns.e("toolbar-left")}>
            {props.database && (
              <el-tag size="small" type="info" effect="plain">
                {props.database}
              </el-tag>
            )}
          </div>
          <div class={ns.e("toolbar-right")}>
            <el-button
              size="small"
              onClick={() => {
                showHistory.value = !showHistory.value;
              }}
            >
              历史 (
              {props.queryHistory.length}
              )
            </el-button>
            <el-button size="small" onClick={handleClear}>
              清空
            </el-button>
            <el-button
              type="primary"
              size="small"
              loading={props.executing}
              disabled={!props.connectionId}
              onClick={() => handleExecute()}
            >
              执行 (Ctrl+Enter)
            </el-button>
          </div>
        </div>

        {/* 查询历史面板 */}
        {showHistory.value && (
          <div class={ns.e("history")}>
            {props.queryHistory.length === 0
              ? (
                  <div class={ns.e("history-empty")}>暂无查询历史</div>
                )
              : (
                  props.queryHistory.slice(0, 50).map(item => (
                    <div
                      key={item.id}
                      class={ns.e("history-item")}
                      onClick={() => useHistory(item.sql)}
                    >
                      <div class={ns.e("history-sql")}>
                        {item.sql.length > 120 ? `${item.sql.slice(0, 120)}...` : item.sql}
                      </div>
                      <div class={ns.e("history-meta")}>
                        <span>{formatTime(item.executedAt)}</span>
                        {item.executionTimeMs != null && (
                          <span>
                            {item.executionTimeMs}
                            {" "}
                            ms
                          </span>
                        )}
                        {item.rowCount != null && (
                          <span>
                            {item.rowCount}
                            {" "}
                            行
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
          </div>
        )}

        {/* 编辑器容器 */}
        <div ref={editorContainerRef} class={ns.e("container")} />
      </div>
    );
  },
});

export default QueryEditor;
