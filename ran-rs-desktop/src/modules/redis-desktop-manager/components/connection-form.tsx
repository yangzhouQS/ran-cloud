/**
 * 连接表单对话框组件
 *
 * 新建/编辑 Redis 连接配置的表单对话框。
 * 支持基础连接参数 + SSH 隧道 / Sentinel / Cluster / TLS 高级配置。
 *
 * @block ran-connection-form
 */

import type { PropType } from "vue";
import type { ConnectionConfig, SentinelConfig, SshTunnelConfig, TlsConfig } from "../types";
import { computed, defineComponent, reactive, ref, watch } from "vue";
import { useCsNamespace } from "../../layout/hooks/use-namespace";

/** 创建默认连接配置 */
function createDefaultConfig(): ConnectionConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    host: "127.0.0.1",
    port: 6379,
    username: "",
    password: "",
    db: 0,
    connectionTimeout: 5,
    commandTimeout: 5,
    separator: ":",
    color: "",
    cluster: false,
    readonly: false,
    remark: "",
  };
}

/** 创建默认 SSH 隧道配置 */
function createDefaultSshTunnel(): SshTunnelConfig {
  return {
    host: "",
    port: 22,
    username: "root",
    password: "",
    privateKeyPath: "",
    passphrase: "",
    timeout: 5,
  };
}

/** 创建默认 Sentinel 配置 */
function createDefaultSentinel(): SentinelConfig {
  return {
    nodes: [""],
    masterName: "mymaster",
    password: "",
    username: "",
    nodePassword: "",
  };
}

/** 创建默认 TLS 配置 */
function createDefaultTls(): TlsConfig {
  return {
    verifyCert: true,
    caCertPath: "",
    certPath: "",
    keyPath: "",
    sni: "",
  };
}

const ConnectionForm = defineComponent({
  name: "ConnectionForm",
  props: {
    visible: { type: Boolean, required: true },
    connectionId: { type: String as PropType<string | null>, default: null },
    connections: { type: Array as PropType<ConnectionConfig[]>, default: () => [] },
    onSave: { type: Function as PropType<(config: ConnectionConfig) => Promise<void>>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const ns = useCsNamespace("connection-form");
    const formRef = ref();
    const loading = ref(false);
    const activeTab = ref("basic");

    // SSH 开关
    const sshEnabled = ref(false);
    // Sentinel 开关
    const sentinelEnabled = ref(false);
    // TLS 开关
    const tlsEnabled = ref(false);

    // 表单数据
    const form = reactive<ConnectionConfig>(createDefaultConfig());

    // SSH 隧道表单
    const sshForm = reactive<SshTunnelConfig>(createDefaultSshTunnel());

    // Sentinel 表单
    const sentinelForm = reactive<SentinelConfig>(createDefaultSentinel());

    // TLS 表单
    const tlsForm = reactive<TlsConfig>(createDefaultTls());

    // 表单验证规则
    const rules = {
      name: [{ required: true, message: "请输入连接名称", trigger: "blur" }],
      host: [{ required: true, message: "请输入主机地址", trigger: "blur" }],
      port: [{ required: true, message: "请输入端口号", trigger: "blur" }],
    };

    // 监听 connectionId 变化，填充表单
    watch(
      () => [props.visible, props.connectionId] as const,
      ([visible, connectionId]) => {
        if (visible) {
          if (connectionId) {
            const existing = props.connections.find(c => c.id === connectionId);
            if (existing) {
              Object.assign(form, { ...existing });
              // 恢复高级配置
              if (existing.sshTunnel) {
                sshEnabled.value = true;
                Object.assign(sshForm, { ...existing.sshTunnel });
              } else {
                sshEnabled.value = false;
                Object.assign(sshForm, createDefaultSshTunnel());
              }
              if (existing.sentinel) {
                sentinelEnabled.value = true;
                Object.assign(sentinelForm, { ...existing.sentinel });
              } else {
                sentinelEnabled.value = false;
                Object.assign(sentinelForm, createDefaultSentinel());
              }
              if (existing.tls) {
                tlsEnabled.value = true;
                Object.assign(tlsForm, { ...existing.tls });
              } else {
                tlsEnabled.value = false;
                Object.assign(tlsForm, createDefaultTls());
              }
            }
          } else {
            // 新建模式：重置表单
            Object.assign(form, createDefaultConfig());
            Object.assign(sshForm, createDefaultSshTunnel());
            Object.assign(sentinelForm, createDefaultSentinel());
            Object.assign(tlsForm, createDefaultTls());
            sshEnabled.value = false;
            sentinelEnabled.value = false;
            tlsEnabled.value = false;
          }
          activeTab.value = "basic";
        }
      },
      { immediate: true },
    );

    /** 选择文件路径（SSH 私钥 / TLS 证书） */
    const selectFilePath = async (field: "privateKeyPath" | "caCertPath" | "certPath" | "keyPath", target: "ssh" | "tls") => {
      try {
        // @ts-expect-error Tauri dialog API
        const selected = await window.__TAURI_INTERNALS__.dialog.open({
          multiple: false,
          directory: false,
          title: "选择文件",
        });
        if (selected) {
          const path = typeof selected === "string" ? selected : selected.path;
          if (target === "ssh") {
            (sshForm as Record<string, unknown>)[field] = path;
          } else {
            (tlsForm as Record<string, unknown>)[field] = path;
          }
        }
      } catch {
        // 用户取消选择，忽略
      }
    };

    /** 添加 Sentinel 节点 */
    const addSentinelNode = () => {
      sentinelForm.nodes.push("");
    };

    /** 移除 Sentinel 节点 */
    const removeSentinelNode = (index: number) => {
      if (sentinelForm.nodes.length > 1) {
        sentinelForm.nodes.splice(index, 1);
      }
    };

    /** 提交表单 */
    const handleSubmit = async () => {
      try {
        await formRef.value?.validate();
      } catch {
        return;
      }

      loading.value = true;
      try {
        // 组装最终配置
        const config: ConnectionConfig = {
          ...form,
          sshTunnel: sshEnabled.value ? { ...sshForm } : undefined,
          sentinel: sentinelEnabled.value ? { ...sentinelForm } : undefined,
          tls: tlsEnabled.value ? { ...tlsForm } : undefined,
        };
        await props.onSave(config);
      } finally {
        loading.value = false;
      }
    };

    /** 取消 */
    const handleCancel = () => {
      props.onClose();
    };

    /** 对话框宽度 */
    const dialogWidth = computed(() => 600);

    return () => (
      <el-dialog
        modelValue={props.visible}
        title={props.connectionId ? "编辑连接" : "新建连接"}
        width={dialogWidth.value}
        onClose={handleCancel}
        destroyOnClose
        class={ns.b()}
        v-slots={{
          footer: () => (
            <div class={ns.e("footer")}>
              <el-button onClick={handleCancel}>取消</el-button>
              <el-button type="primary" loading={loading.value} onClick={handleSubmit}>
                {props.connectionId ? "保存" : "创建"}
              </el-button>
            </div>
          ),
        }}
      >
        <el-form
          ref={formRef}
          model={form}
          rules={rules}
          labelWidth="100px"
          labelPosition="right"
          size="default"
        >
          {/* 标签页切换 */}
          <el-tabs v-model={activeTab.value} class={ns.e("tabs")}>
            {/* ===== 基础配置 ===== */}
            <el-tab-pane label="基础" name="basic">
              <el-form-item label="连接名称" prop="name">
                <el-input v-model={form.name} placeholder="例如：本地开发" />
              </el-form-item>

              <el-form-item label="主机地址" prop="host">
                <el-input v-model={form.host} placeholder="127.0.0.1" />
              </el-form-item>

              <el-form-item label="端口" prop="port">
                <el-input-number
                  v-model={form.port}
                  min={1}
                  max={65535}
                  controls={false}
                  style={{ width: "100%" }}
                />
              </el-form-item>

              <el-form-item label="用户名">
                <el-input v-model={form.username} placeholder="可选 (Redis 6+ ACL)" />
              </el-form-item>

              <el-form-item label="密码">
                <el-input
                  v-model={form.password}
                  type="password"
                  showPassword
                  placeholder="可选"
                />
              </el-form-item>

              <el-form-item label="默认 DB">
                <el-input-number
                  v-model={form.db}
                  min={0}
                  max={15}
                  controls={false}
                  style={{ width: "100%" }}
                />
              </el-form-item>

              <el-form-item label="分隔符">
                <el-input v-model={form.separator} placeholder=":" />
              </el-form-item>

              <el-form-item label="标记颜色">
                <el-color-picker v-model={form.color} showAlpha={false} />
              </el-form-item>

              <el-form-item label="备注">
                <el-input
                  v-model={form.remark}
                  type="textarea"
                  rows={2}
                  placeholder="可选备注信息"
                />
              </el-form-item>

              <el-form-item label="连接超时">
                <el-input-number
                  v-model={form.connectionTimeout}
                  min={1}
                  max={60}
                  controls={false}
                  style={{ width: "100%" }}
                  placeholder="秒"
                />
              </el-form-item>

              <el-form-item label="命令超时">
                <el-input-number
                  v-model={form.commandTimeout}
                  min={1}
                  max={60}
                  controls={false}
                  style={{ width: "100%" }}
                  placeholder="秒"
                />
              </el-form-item>

              <el-form-item label="只读模式">
                <el-switch v-model={form.readonly} />
              </el-form-item>
            </el-tab-pane>

            {/* ===== SSH 隧道 ===== */}
            <el-tab-pane label="SSH 隧道" name="ssh">
              <el-form-item label="启用 SSH">
                <el-switch v-model={sshEnabled.value} />
              </el-form-item>

              {sshEnabled.value && (
                <>
                  <el-form-item label="SSH 主机">
                    <el-input v-model={sshForm.host} placeholder="SSH 服务器地址" />
                  </el-form-item>

                  <el-form-item label="SSH 端口">
                    <el-input-number
                      v-model={sshForm.port}
                      min={1}
                      max={65535}
                      controls={false}
                      style={{ width: "100%" }}
                    />
                  </el-form-item>

                  <el-form-item label="SSH 用户名">
                    <el-input v-model={sshForm.username} placeholder="root" />
                  </el-form-item>

                  <el-form-item label="SSH 密码">
                    <el-input
                      v-model={sshForm.password}
                      type="password"
                      showPassword
                      placeholder="密码认证（二选一）"
                    />
                  </el-form-item>

                  <el-form-item label="私钥路径">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input
                        v-model={sshForm.privateKeyPath}
                        placeholder="密钥认证（二选一）"
                        style={{ flex: 1 }}
                      />
                      <el-button onClick={() => selectFilePath("privateKeyPath", "ssh")}>
                        浏览
                      </el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="私钥密码">
                    <el-input
                      v-model={sshForm.passphrase}
                      type="password"
                      showPassword
                      placeholder="可选"
                    />
                  </el-form-item>

                  <el-form-item label="SSH 超时">
                    <el-input-number
                      v-model={sshForm.timeout}
                      min={1}
                      max={60}
                      controls={false}
                      style={{ width: "100%" }}
                      placeholder="秒"
                    />
                  </el-form-item>
                </>
              )}
            </el-tab-pane>

            {/* ===== Sentinel ===== */}
            <el-tab-pane label="Sentinel" name="sentinel">
              <el-form-item label="启用 Sentinel">
                <el-switch v-model={sentinelEnabled.value} />
              </el-form-item>

              {sentinelEnabled.value && (
                <>
                  <el-form-item label="Sentinel 节点">
                    <div style={{ width: "100%" }}>
                      {sentinelForm.nodes.map((node, index) => (
                        <div key={index} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                          <el-input
                            v-model={sentinelForm.nodes[index]}
                            placeholder="host:port"
                            style={{ flex: 1 }}
                          />
                          <el-button
                            onClick={() => removeSentinelNode(index)}
                            disabled={sentinelForm.nodes.length <= 1}
                            type="danger"
                            link
                          >
                            删除
                          </el-button>
                        </div>
                      ))}
                      <el-button onClick={addSentinelNode} type="primary" link>
                        + 添加节点
                      </el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="主节点名称">
                    <el-input v-model={sentinelForm.masterName} placeholder="mymaster" />
                  </el-form-item>

                  <el-form-item label="Sentinel 密码">
                    <el-input
                      v-model={sentinelForm.password}
                      type="password"
                      showPassword
                      placeholder="可选"
                    />
                  </el-form-item>

                  <el-form-item label="Sentinel 用户">
                    <el-input v-model={sentinelForm.username} placeholder="可选 (Redis 6+ ACL)" />
                  </el-form-item>

                  <el-form-item label="节点密码">
                    <el-input
                      v-model={sentinelForm.nodePassword}
                      type="password"
                      showPassword
                      placeholder="连接主节点的密码（可选）"
                    />
                  </el-form-item>
                </>
              )}
            </el-tab-pane>

            {/* ===== Cluster ===== */}
            <el-tab-pane label="Cluster" name="cluster">
              <el-form-item label="集群模式">
                <el-switch v-model={form.cluster} />
              </el-form-item>

              {form.cluster && (
                <el-alert
                  title="集群模式说明"
                  description="启用后，将使用集群连接方式。请确保主机地址和端口指向集群中的任意一个节点。"
                  type="info"
                  showIcon
                  closable={false}
                  style={{ marginBottom: "16px" }}
                />
              )}
            </el-tab-pane>

            {/* ===== TLS ===== */}
            <el-tab-pane label="TLS/SSL" name="tls">
              <el-form-item label="启用 TLS">
                <el-switch v-model={tlsEnabled.value} />
              </el-form-item>

              {tlsEnabled.value && (
                <>
                  <el-form-item label="验证证书">
                    <el-switch v-model={tlsForm.verifyCert} />
                  </el-form-item>

                  <el-form-item label="CA 证书">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input
                        v-model={tlsForm.caCertPath}
                        placeholder="CA 证书路径（可选）"
                        style={{ flex: 1 }}
                      />
                      <el-button onClick={() => selectFilePath("caCertPath", "tls")}>
                        浏览
                      </el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="客户端证书">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input
                        v-model={tlsForm.certPath}
                        placeholder="客户端证书路径（可选）"
                        style={{ flex: 1 }}
                      />
                      <el-button onClick={() => selectFilePath("certPath", "tls")}>
                        浏览
                      </el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="客户端私钥">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input
                        v-model={tlsForm.keyPath}
                        placeholder="客户端私钥路径（可选）"
                        style={{ flex: 1 }}
                      />
                      <el-button onClick={() => selectFilePath("keyPath", "tls")}>
                        浏览
                      </el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="SNI 主机名">
                    <el-input v-model={tlsForm.sni} placeholder="可选" />
                  </el-form-item>
                </>
              )}
            </el-tab-pane>
          </el-tabs>
        </el-form>
      </el-dialog>
    );
  },
});

export default ConnectionForm;
