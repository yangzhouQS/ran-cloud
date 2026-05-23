/**
 * SQL Studio 连接表单对话框
 *
 * 新建/编辑 SQL 数据库连接配置。
 * 支持 PostgreSQL / MySQL / MariaDB / TiDB / SQLite 五种数据库。
 * 包含 SSL 和 SSH 隧道高级配置。
 *
 * @block ran-sql-connection-form
 */

import type { PropType } from "vue";
import type { ConnectionConfig, DatabaseType, SshTunnelConfig, SslConfig } from "../types";
import { defineComponent, reactive, ref, watch } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { createDefaultConfig, DATABASE_TYPE_OPTIONS } from "../types";

/** 创建默认 SSH 隧道配置 */
function createDefaultSsh(): SshTunnelConfig {
  return {
    enabled: false,
    host: "",
    port: 22,
    user: "root",
    password: undefined,
    privateKey: undefined,
    passphrase: undefined,
  };
}

/** 创建默认 SSL 配置 */
function createDefaultSsl(): SslConfig {
  return {
    enabled: false,
    caFile: "",
    certFile: "",
    keyFile: "",
    rejectUnauthorized: false,
  };
}

const ConnectionForm = defineComponent({
  name: "SqlConnectionForm",
  props: {
    visible: { type: Boolean, required: true },
    connectionId: { type: String as PropType<string | null>, default: null },
    savedConfigs: { type: Array as PropType<ConnectionConfig[]>, default: () => [] },
    onSave: { type: Function as PropType<(config: ConnectionConfig) => Promise<void>>, required: true },
    onTest: { type: Function as PropType<(config: ConnectionConfig) => Promise<boolean>>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const ns = useCsNamespace("sql-connection-form");
    const formRef = ref();
    const loading = ref(false);
    const testing = ref(false);
    const testResult = ref<boolean | null>(null);
    const activeTab = ref("basic");

    const form = reactive<ConnectionConfig>(createDefaultConfig("postgresql"));
    const sshForm = reactive<SshTunnelConfig>(createDefaultSsh());
    const sslForm = reactive<SslConfig>(createDefaultSsl());

    const rules = {
      name: [{ required: true, message: "请输入连接名称", trigger: "blur" }],
      host: [{ required: true, message: "请输入主机地址", trigger: "blur" }],
      port: [{ required: true, message: "请输入端口号", trigger: "blur" }],
    };

    /** 是否 SQLite 类型（SQLite 不需要 host/port/user/password） */
    const isSqlite = ref(false);

    /** 切换数据库类型时更新默认端口和 SQLite 状态 */
    watch(
      () => form.dbType,
      (dbType: DatabaseType) => {
        isSqlite.value = dbType === "sqlite";
        const opt = DATABASE_TYPE_OPTIONS.find(o => o.value === dbType);
        if (opt?.defaultPort) {
          form.port = opt.defaultPort;
        }
      },
    );

    /** 监听 visible / connectionId 变化，填充或重置表单 */
    watch(
      () => [props.visible, props.connectionId] as const,
      ([visible, connectionId]) => {
        if (!visible) return;
        testResult.value = null;
        activeTab.value = "basic";

        if (connectionId) {
          const existing = props.savedConfigs.find(c => c.id === connectionId);
          if (existing) {
            Object.assign(form, { ...existing });
            isSqlite.value = existing.dbType === "sqlite";
            if (existing.ssh) Object.assign(sshForm, { ...existing.ssh });
            else Object.assign(sshForm, createDefaultSsh());
            if (existing.ssl) Object.assign(sslForm, { ...existing.ssl });
            else Object.assign(sslForm, createDefaultSsl());
          }
        } else {
          Object.assign(form, createDefaultConfig("postgresql"));
          Object.assign(sshForm, createDefaultSsh());
          Object.assign(sslForm, createDefaultSsl());
          isSqlite.value = false;
        }
      },
      { immediate: true },
    );

    /** 选择文件路径 */
    const selectFilePath = async (field: string, target: "form" | "ssh" | "ssl") => {
      try {
        // @ts-expect-error Tauri dialog API
        const selected = await window.__TAURI_INTERNALS__.dialog.open({
          multiple: false,
          directory: false,
          title: "选择文件",
        });
        if (selected) {
          const path = typeof selected === "string" ? selected : selected.path;
          if (target === "form") {
            (form as Record<string, unknown>)[field] = path;
          } else if (target === "ssh") {
            (sshForm as Record<string, unknown>)[field] = path;
          } else {
            (sslForm as Record<string, unknown>)[field] = path;
          }
        }
      } catch {
        // 用户取消
      }
    };

    /** 测试连接 */
    const handleTest = async () => {
      testing.value = true;
      testResult.value = null;
      try {
        const config: ConnectionConfig = {
          ...form,
          ssh: sshForm.enabled ? { ...sshForm } : { ...createDefaultSsh(), enabled: false },
          ssl: sslForm.enabled ? { ...sslForm } : { ...createDefaultSsl(), enabled: false },
        };
        testResult.value = await props.onTest(config);
      } catch {
        testResult.value = false;
      } finally {
        testing.value = false;
      }
    };

    /** 提交 */
    const handleSubmit = async () => {
      try {
        await formRef.value?.validate();
      } catch {
        return;
      }
      loading.value = true;
      try {
        const config: ConnectionConfig = {
          ...form,
          ssh: sshForm.enabled ? { ...sshForm } : { ...createDefaultSsh(), enabled: false },
          ssl: sslForm.enabled ? { ...sslForm } : { ...createDefaultSsl(), enabled: false },
        };
        await props.onSave(config);
      } finally {
        loading.value = false;
      }
    };

    const handleCancel = () => {
      props.onClose();
    };

    return () => (
      <el-dialog
        modelValue={props.visible}
        title={props.connectionId ? "编辑连接" : "新建连接"}
        width={620}
        onClose={handleCancel}
        destroyOnClose
        class={ns.b()}
        v-slots={{
          footer: () => (
            <div class={ns.e("footer")}>
              <el-button onClick={handleCancel}>取消</el-button>
              <el-button
                loading={testing.value}
                onClick={handleTest}
                type={testResult.value === true ? "success" : testResult.value === false ? "danger" : "default"}
              >
                {testResult.value === true ? "连接成功" : testResult.value === false ? "连接失败" : "测试连接"}
              </el-button>
              <el-button type="primary" loading={loading.value} onClick={handleSubmit}>
                {props.connectionId ? "保存" : "创建"}
              </el-button>
            </div>
          ),
        }}
      >
        <el-form ref={formRef} model={form} rules={rules} labelWidth="100px" labelPosition="right" size="default">
          <el-tabs v-model={activeTab.value} class={ns.e("tabs")}>
            {/* ===== 基础配置 ===== */}
            <el-tab-pane label="基础" name="basic">
              <el-form-item label="连接名称" prop="name">
                <el-input v-model={form.name} placeholder="例如：开发环境 PostgreSQL" />
              </el-form-item>

              <el-form-item label="数据库类型" prop="dbType">
                <el-select v-model={form.dbType} placeholder="选择数据库类型" style={{ width: "100%" }}>
                  {DATABASE_TYPE_OPTIONS.map(opt => (
                    <el-option key={opt.value} label={opt.label} value={opt.value} />
                  ))}
                </el-select>
              </el-form-item>

              {isSqlite.value ? (
                <el-form-item label="数据库文件" prop="database">
                  <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                    <el-input v-model={form.database} placeholder="数据库文件路径" style={{ flex: 1 }} />
                    <el-button onClick={() => selectFilePath("database", "form")}>浏览</el-button>
                  </div>
                </el-form-item>
              ) : (
                <>
                  <el-form-item label="主机地址" prop="host">
                    <el-input v-model={form.host} placeholder="localhost" />
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
                    <el-input v-model={form.user} placeholder="root" />
                  </el-form-item>

                  <el-form-item label="密码">
                    <el-input v-model={form.password} type="password" showPassword placeholder="可选" />
                  </el-form-item>

                  <el-form-item label="默认数据库">
                    <el-input v-model={form.database} placeholder="可选，留空使用默认" />
                  </el-form-item>

                  <el-form-item label="连接 URL">
                    <el-input v-model={form.url} placeholder="可选，手动指定完整 JDBC/连接 URL" />
                  </el-form-item>
                </>
              )}
            </el-tab-pane>

            {/* ===== SSL ===== */}
            <el-tab-pane label="SSL" name="ssl" disabled={isSqlite.value}>
              <el-form-item label="启用 SSL">
                <el-switch v-model={sslForm.enabled} />
              </el-form-item>

              {sslForm.enabled && (
                <>
                  <el-form-item label="CA 证书">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input v-model={sslForm.caFile} placeholder="CA 证书路径" style={{ flex: 1 }} />
                      <el-button onClick={() => selectFilePath("caFile", "ssl")}>浏览</el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="客户端证书">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input v-model={sslForm.certFile} placeholder="客户端证书路径" style={{ flex: 1 }} />
                      <el-button onClick={() => selectFilePath("certFile", "ssl")}>浏览</el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="客户端私钥">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input v-model={sslForm.keyFile} placeholder="客户端私钥路径" style={{ flex: 1 }} />
                      <el-button onClick={() => selectFilePath("keyFile", "ssl")}>浏览</el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="验证证书">
                    <el-switch v-model={sslForm.rejectUnauthorized} />
                  </el-form-item>
                </>
              )}
            </el-tab-pane>

            {/* ===== SSH 隧道 ===== */}
            <el-tab-pane label="SSH 隧道" name="ssh" disabled={isSqlite.value}>
              <el-form-item label="启用 SSH">
                <el-switch v-model={sshForm.enabled} />
              </el-form-item>

              {sshForm.enabled && (
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
                    <el-input v-model={sshForm.user} placeholder="root" />
                  </el-form-item>

                  <el-form-item label="SSH 密码">
                    <el-input v-model={sshForm.password} type="password" showPassword placeholder="密码认证" />
                  </el-form-item>

                  <el-form-item label="私钥路径">
                    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                      <el-input v-model={sshForm.privateKey} placeholder="密钥认证" style={{ flex: 1 }} />
                      <el-button onClick={() => selectFilePath("privateKey", "ssh")}>浏览</el-button>
                    </div>
                  </el-form-item>

                  <el-form-item label="密钥密码">
                    <el-input v-model={sshForm.passphrase} type="password" showPassword placeholder="私钥密码（可选）" />
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
