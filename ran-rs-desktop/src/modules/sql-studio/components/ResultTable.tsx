/**
 * SQL Studio 查询结果表格
 *
 * 基于 @visactor/vtable 的查询结果展示组件。
 * 支持大数据量虚拟滚动、列排序、单元格选中复制、CSV/JSON 导出。
 *
 * @block ran-sql-result-table
 */

import type { PropType } from "vue";
import type { QueryResult } from "../types";
import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useCsNamespace } from "../../layout/hooks/use-namespace";

/** 导出查询结果为 CSV 字符串 */
function exportAsCsv(result: QueryResult): string {
  const header = result.columns.map(c => csvEscape(c.name)).join(",");
  const rows = result.rows.map(row =>
    result.columns.map((col) => {
      const val = row[col.name];
      if (val === null || val === undefined) {
        return "NULL";
      }
      return csvEscape(String(val));
    }).join(","),
  );
  return [header, ...rows].join("\n");
}

/** CSV 字段转义 */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

/** 下载文件 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ResultTable = defineComponent({
  name: "SqlResultTable",
  props: {
    result: { type: Object as PropType<QueryResult | null>, default: null },
    error: { type: String as PropType<string | null>, default: null },
    loading: { type: Boolean, default: false },
  },
  setup(props) {
    const ns = useCsNamespace("sql-result-table");
    const containerRef = ref<HTMLElement | null>(null);
    const tableInstance = shallowRef<any>(null);

    /** 构建 VTable 配置 */
    const buildTableOptions = (result: QueryResult) => {
      const columns = result.columns.map(col => ({
        field: col.name,
        title: col.name,
        width: "auto",
        style: {
          textAlign: "left" as const,
        },
        headerStyle: {
          textAlign: "left" as const,
          fontWeight: "bold",
        },
      }));

      const records = result.rows.map((row, index) => {
        const record: Record<string, unknown> = { __rowIndex: index + 1 };
        for (const col of result.columns) {
          const val = row[col.name];
          record[col.name] = val === null ? "NULL" : val;
        }
        return record;
      });

      return { columns, records };
    };

    /** 初始化/更新表格 */
    const initOrUpdateTable = async () => {
      if (!containerRef.value) {
        return;
      }

      // 销毁旧实例
      if (tableInstance.value) {
        tableInstance.value.dispose();
        tableInstance.value = null;
      }

      if (!props.result || props.result.rows.length === 0) {
        return;
      }

      try {
        const VTable = await import("@visactor/vtable");
        const { columns, records } = buildTableOptions(props.result);

        const options: Record<string, unknown> = {
          container: containerRef.value,
          records,
          columns: [
            {
              field: "__rowIndex",
              title: "#",
              width: 60,
              style: { textAlign: "right" },
              headerStyle: { textAlign: "center" },
            },
            ...columns,
          ],
          autoWrapText: true,
          autoFillWidth: true,
          heightMode: "autoHeight",
          defaultHeaderRowHeight: 32,
          defaultRowHeight: 28,
          theme: VTable.themes.DEFAULT.extends({
            headerStyle: {
              bgColor: "#f5f7fa",
              color: "#303133",
              fontSize: 13,
              borderColor: "#ebeef5",
            },
            bodyStyle: {
              bgColor: "#fff",
              color: "#606266",
              fontSize: 13,
              borderColor: "#ebeef5",
              hover: {
                cellBgColor: "#ecf5ff",
              },
            },
          }),
          select: {
            headerSelectMode: "cell",
          },
          keyboardOptions: {
            moveSelectCellOnTab: true,
            moveEditCellOnEnter: true,
          },
        };

        tableInstance.value = new VTable.ListTable(options);
      } catch (e) {
        console.error("VTable 初始化失败:", e);
      }
    };

    /** 导出为 CSV */
    const handleExportCsv = () => {
      if (!props.result) {
        return;
      }
      const csv = exportAsCsv(props.result);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadFile(csv, `query-result-${timestamp}.csv`, "text/csv;charset=utf-8");
    };

    /** 导出为 JSON */
    const handleExportJson = () => {
      if (!props.result) {
        return;
      }
      const json = JSON.stringify(props.result.rows, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadFile(json, `query-result-${timestamp}.json`, "application/json;charset=utf-8");
    };

    watch(
      () => props.result,
      () => {
        nextTick(initOrUpdateTable);
      },
    );

    onMounted(() => {
      if (props.result) {
        nextTick(initOrUpdateTable);
      }
    });

    onBeforeUnmount(() => {
      tableInstance.value?.dispose();
    });

    return () => (
      <div class={ns.b()}>
        {/* 结果信息栏 */}
        {props.result && (
          <div class={ns.e("info")}>
            <span>
              {props.result.rows.length}
              {" "}
              行
              {props.result.affectedRows != null && ` · 影响 ${props.result.affectedRows} 行`}
            </span>
            <div class={ns.e("info-right")}>
              <span>
                {props.result.executionTimeMs}
                {" "}
                ms
              </span>
              {props.result.rows.length > 0 && (
                <>
                  <el-button size="small" link onClick={handleExportCsv}>导出 CSV</el-button>
                  <el-button size="small" link onClick={handleExportJson}>导出 JSON</el-button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 查询错误提示 */}
        {props.error && !props.loading && (
          <el-alert
            title="查询执行失败"
            description={props.error}
            type="error"
            closable
            showIcon
            style={{ margin: "8px" }}
          />
        )}

        {/* 表格容器 */}
        <div class={ns.e("container-wrapper")}>
          {props.loading
            ? (
                <div class={ns.e("loading")}>
                  <el-icon class="is-loading"><i class="el-icon-loading" /></el-icon>
                  <span>查询中...</span>
                </div>
              )
            : props.error && !props.result
              ? (
                  <div class={ns.e("empty")}>
                    <el-empty description="查询执行出错" imageSize={60} />
                  </div>
                )
              : !props.result
                  ? (
                      <div class={ns.e("empty")}>
                        <el-empty description="执行查询以查看结果" imageSize={80} />
                      </div>
                    )
                  : props.result.rows.length === 0
                    ? (
                        <div class={ns.e("empty")}>
                          <el-empty description="查询结果为空" imageSize={60} />
                        </div>
                      )
                    : (
                        <div ref={containerRef} class={ns.e("container")} />
                      )}
        </div>
      </div>
    );
  },
});

export default ResultTable;
