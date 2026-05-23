/**
 * PluginManagerModal — 插件管理对话框
 *
 * 显示已安装的插件列表，支持启用/禁用操作。
 */

import { defineComponent, watch } from "vue";
import { usePluginStore } from "../stores/plugin-store";

const PluginManagerModal = defineComponent({
  name: "PluginManagerModal",

  props: {
    visible: {
      type: Boolean,
      required: true,
    },
  },

  emits: {
    close: () => true,
  },

  setup(props, { emit }) {
    const store = usePluginStore();

    // 打开时刷新插件列表
    watch(() => props.visible, (val) => {
      if (val) {
        store.refreshPlugins();
      }
    });

    const handleClose = () => {
      emit("close");
    };

    const handleToggle = async (id: string, enabled: boolean) => {
      await store.togglePlugin(id, enabled);
    };

    return () => (
      <el-dialog
        modelValue={props.visible}
        title="插件管理"
        width={640}
        onClose={handleClose}
        onUpdate:modelValue={(val: boolean) => {
          if (!val) {
            handleClose();
          }
        }}
      >
        {store.loading && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <el-icon class="is-loading" size={32}><i class="el-icon-loading" /></el-icon>
            <p style={{ marginTop: "12px", color: "#999" }}>加载中...</p>
          </div>
        )}

        {store.error && (
          <el-alert title={store.error} type="error" closable showIcon style={{ marginBottom: "16px" }} />
        )}

        {!store.loading && store.plugins.length === 0 && (
          <el-empty description="未发现已安装的插件">
            <p style={{ fontSize: "12px", color: "#999" }}>
              请将插件放置到应用数据目录的 plugins/ 文件夹中
            </p>
          </el-empty>
        )}

        {!store.loading && store.plugins.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {store.plugins.map(plugin => (
              <div
                key={plugin.manifest.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--el-border-color-lighter)",
                  background: plugin.enabled ? "var(--el-bg-color)" : "var(--el-fill-color-lighter)",
                  opacity: plugin.loadable ? 1 : 0.6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {plugin.manifest.icon && (
                      <el-icon size={18}><i class={plugin.manifest.icon} /></el-icon>
                    )}
                    <span style={{ fontWeight: 500, fontSize: "14px" }}>
                      {plugin.manifest.name}
                    </span>
                    <el-tag size="small" type="info">
                      v
                      {plugin.manifest.version}
                    </el-tag>
                    {!plugin.loadable && (
                      <el-tag size="small" type="danger">不兼容</el-tag>
                    )}
                    {!plugin.enabled && (
                      <el-tag size="small" type="info">已禁用</el-tag>
                    )}
                  </div>
                  <p style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "var(--el-text-color-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  >
                    {plugin.manifest.description || "无描述"}
                  </p>
                  <p style={{
                    margin: "2px 0 0",
                    fontSize: "11px",
                    color: "var(--el-text-color-placeholder)",
                  }}
                  >
                    ID:
                    {" "}
                    {plugin.manifest.id}
                    {plugin.manifest.author && (
                      <>
                        {" "}
                        | 作者:
                        {typeof plugin.manifest.author === "string"
                          ? plugin.manifest.author
                          : plugin.manifest.author.name}
                      </>
                    )}
                  </p>
                </div>
                <el-switch
                  modelValue={plugin.enabled}
                  disabled={!plugin.loadable}
                  onChange={(val: boolean) => handleToggle(plugin.manifest.id, val)}
                  activeText="启用"
                  inactiveText="禁用"
                  style={{ marginLeft: "16px" }}
                />
              </div>
            ))}
          </div>
        )}
      </el-dialog>
    );
  },
});

export default PluginManagerModal;
