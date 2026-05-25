/**
 * SQL Studio 连接列表面板
 *
 * 左侧侧边栏，显示已保存的数据库连接列表。
 * 支持新建、编辑、删除、连接/断开操作。
 *
 * @block ran-sql-connection-list
 */

import type { PropType } from "vue";
import type { ConnectionInfo } from "../types";
import { defineComponent, ref } from "vue";
import { useCsNamespace } from "../../layout/hooks/use-namespace";
import { DATABASE_TYPE_OPTIONS } from "../types";

const ConnectionList = defineComponent({
  name: "SqlConnectionList",
  props: {
    connections: { type: Array as PropType<ConnectionInfo[]>, required: true },
    activeConnectionId: { type: String as PropType<string | null>, default: null },
    loading: { type: Boolean, default: false },
    onConnect: { type: Function as PropType<(id: string) => Promise<void>>, required: true },
    onDisconnect: { type: Function as PropType<(id: string) => Promise<void>>, required: true },
    onNew: { type: Function as PropType<() => void>, required: true },
    onEdit: { type: Function as PropType<(id: string) => void>, required: true },
    onDelete: { type: Function as PropType<(id: string) => Promise<void>>, required: true },
    onSelect: { type: Function as PropType<(id: string) => void>, default: () => {} },
  },
  setup(props) {
    const ns = useCsNamespace("sql-connection-list");
    const contextMenuVisible = ref(false);
    const contextMenuId = ref<string | null>(null);

    /** 获取数据库类型标签 */
    const getDbTypeLabel = (dbType: string) => {
      const opt = DATABASE_TYPE_OPTIONS.find(o => o.value === dbType);
      return opt?.label ?? dbType;
    };

    /** 获取数据库类型颜色 */
    const getDbTypeColor = (dbType: string): string => {
      const colorMap: Record<string, string> = {
        postgresql: "#336791",
        mysql: "#4479A1",
        mariadb: "#003545",
        tidb: "#E2231A",
        sqlite: "#003B57",
      };
      return colorMap[dbType] ?? "#909399";
    };

    return () => (
      <div class={ns.b()}>
        {/* 头部 */}
        <div class={ns.e("header")}>
          <span class={ns.e("title")}>连接</span>
          <el-button type="primary" link onClick={props.onNew}>
            + 新建
          </el-button>
        </div>

        {/* 连接列表 */}
        <div class={ns.e("list")}>
          {props.loading
            ? (
                <div class={ns.e("loading")}>
                  <el-icon class="is-loading"><i class="el-icon-loading" /></el-icon>
                  <span>加载中...</span>
                </div>
              )
            : props.connections.length === 0
              ? (
                  <div class={ns.e("empty")}>
                    <el-empty description="暂无连接" imageSize={60} />
                  </div>
                )
              : (
                  props.connections.map(conn => (
                    <div
                      key={conn.id}
                      class={[
                        ns.e("item"),
                        conn.id === props.activeConnectionId ? "is-active" : "",
                        conn.status === "connected" ? "is-connected" : "",
                      ]}
                      onClick={() => {
                        if (conn.status === "connected") {
                          props.onSelect(conn.id);
                        } else {
                          props.onConnect(conn.id);
                        }
                      }}
                      onContextmenu={(e: Event) => {
                        e.preventDefault();
                        contextMenuId.value = conn.id;
                        contextMenuVisible.value = true;
                      }}
                    >
                      <div class={ns.e("item-indicator")} style={{ backgroundColor: getDbTypeColor(conn.dbType) }} />
                      <div class={ns.e("item-content")}>
                        <div class={ns.e("item-name")}>{conn.name || "未命名连接"}</div>
                        <div class={ns.e("item-meta")}>
                          <span class={ns.e("item-type")}>{getDbTypeLabel(conn.dbType)}</span>
                          {conn.host && (
                            <span class={ns.e("item-host")}>
                              {conn.host}
                              {conn.port ? `:${conn.port}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div class={ns.e("item-status")}>
                        {conn.status === "connected"
                          ? (
                              <el-tag type="success" size="small" effect="dark">已连接</el-tag>
                            )
                          : (
                              <el-tag type="info" size="small" effect="plain">离线</el-tag>
                            )}
                      </div>
                    </div>
                  ))
                )}
        </div>

        {/* 右键菜单 */}
        <el-dialog
          modelValue={contextMenuVisible.value}
          title="操作"
          width={300}
          onClose={() => {
            contextMenuVisible.value = false;
          }}
          appendToBody
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(() => {
              const conn = props.connections.find(c => c.id === contextMenuId.value);
              if (!conn) {
                return null;
              }
              return (
                <>
                  {conn.status === "connected"
                    ? (
                        <el-button onClick={() => {
                          props.onDisconnect(conn.id);
                          contextMenuVisible.value = false;
                        }}
                        >
                          断开连接
                        </el-button>
                      )
                    : (
                        <el-button
                          type="primary"
                          onClick={() => {
                            props.onConnect(conn.id);
                            contextMenuVisible.value = false;
                          }}
                        >
                          连接
                        </el-button>
                      )}
                  <el-button onClick={() => {
                    props.onEdit(conn.id);
                    contextMenuVisible.value = false;
                  }}
                  >
                    编辑
                  </el-button>
                  <el-button
                    type="danger"
                    onClick={() => {
                      props.onDelete(conn.id);
                      contextMenuVisible.value = false;
                    }}
                  >
                    删除
                  </el-button>
                </>
              );
            })()}
          </div>
        </el-dialog>
      </div>
    );
  },
});

export default ConnectionList;
