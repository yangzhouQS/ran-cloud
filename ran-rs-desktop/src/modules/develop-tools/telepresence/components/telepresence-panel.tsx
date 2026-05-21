import {
  CircleCheck,
  CircleClose,
  Connection,
  Document,
  DocumentCopy,
  FolderOpened,
  InfoFilled,
  Refresh,
  RefreshRight,
  Setting,
  SwitchButton,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, defineComponent, reactive, ref } from "vue";
import { useCsNamespace } from "../../../../hooks/use-namespace";
import {
  connectTelepresence,
  getStatus,
  quitTelepresence,
} from "../services/telepresence";
import type { LogEntry } from "../types";
import "./telepresence-panel.less";

const TelepresencePanel = defineComponent({
  name: "TelepresencePanel",
  setup() {
    // ===== BEM 命名空间 =====
    const ns = useCsNamespace("telepresence");
    const nsPage = useCsNamespace("content-page");
    const nsSection = useCsNamespace("content-section");

    // ===== 命名空间选项 =====
    const namespaceOptions = [
      { label: "dev-mc (默认)", value: "dev-mc" },
      { label: "dev", value: "dev" },
    ];

    // ===== 连接配置 =====
    const config = reactive({
      kubeconfig: "C:/Users/10456/.cs/kube-config",
      namespace: "dev-mc",
      skipTlsVerify: true,
    });

    // ===== 状态管理 =====
    const connectLoading = ref(false);
    const quitLoading = ref(false);
    const statusLoading = ref(false);
    const reconnectLoading = ref(false);
    const isConnected = ref(false);
    const logs = ref<LogEntry[]>([]);

    // ===== 计算属性 =====
    const statusText = computed(() =>
      isConnected.value ? "已连接" : "未连接",
    );

    const statusType = computed((): "success" | "danger" => (
      isConnected.value ? "success" : "danger"
    ));

    // ===== 工具方法 =====
    const getTimestamp = (): string =>
      new Date().toLocaleTimeString("zh-CN", { hour12: false });

    const addLog = (type: LogEntry["type"], message: string) => {
      logs.value.push({ timestamp: getTimestamp(), type, message });
      if (logs.value.length > 100) {
        logs.value = logs.value.slice(-100);
      }
    };

    const scrollToBottom = () => {
      setTimeout(() => {
        const el = document.querySelector(`.${ns.e("terminal")}`);
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }, 50);
    };

    // ===== 操作方法 =====
    const handleConnect = async () => {
      if (connectLoading.value) {
        return;
      }
      connectLoading.value = true;
      addLog(
        "command",
        `$ telepresence connect --kubeconfig ${config.kubeconfig}${config.skipTlsVerify ? " --insecure-skip-tls-verify" : ""} --namespace ${config.namespace}`,
      );
      try {
        const result = await connectTelepresence({
          kubeconfig: config.kubeconfig,
          namespace: config.namespace,
          skipTlsVerify: config.skipTlsVerify,
        });
        if (result.success) {
          isConnected.value = true;
          addLog("success", `✓ ${result.message}`);
          ElMessage.success(`已成功连接到命名空间: ${config.namespace}`);
        } else {
          addLog("error", `✗ 连接失败: ${result.message}`);
          ElMessage.error(`连接失败: ${result.message}`);
        }
      } catch (error) {
        addLog("error", `✗ 异常: ${String(error)}`);
        ElMessage.error("连接过程中发生异常");
      } finally {
        connectLoading.value = false;
        scrollToBottom();
      }
    };

    const handleQuit = async () => {
      if (quitLoading.value) {
        return;
      }
      try {
        await ElMessageBox.confirm("确定要断开 Telepresence 连接吗？", "确认断开", {
          confirmButtonText: "确定断开",
          cancelButtonText: "取消",
          type: "warning",
        });
      } catch {
        return;
      }
      quitLoading.value = true;
      addLog("command", "$ telepresence quit");
      try {
        const result = await quitTelepresence();
        if (result.success) {
          isConnected.value = false;
          addLog("success", `✓ ${result.message}`);
          ElMessage.success("已断开 Telepresence 连接");
        } else {
          addLog("error", `✗ 断开失败: ${result.message}`);
          ElMessage.error(`断开失败: ${result.message}`);
        }
      } catch (error) {
        addLog("error", `✗ 异常: ${String(error)}`);
        ElMessage.error("断开连接过程中发生异常");
      } finally {
        quitLoading.value = false;
        scrollToBottom();
      }
    };

    const handleStatus = async () => {
      if (statusLoading.value) {
        return;
      }
      statusLoading.value = true;
      addLog("command", "$ telepresence status");
      try {
        const result = await getStatus();
        if (result.success) {
          addLog("info", result.message);
          const output = result.message.toLowerCase();
          if (output.includes("connected") || output.includes("proxy")) {
            isConnected.value = true;
          } else if (output.includes("not connected") || output.includes("inactive") || output.includes("not logged in")) {
            isConnected.value = false;
          }
        } else {
          addLog("error", `✗ 获取状态失败: ${result.message}`);
        }
      } catch (error) {
        addLog("error", `✗ 异常: ${String(error)}`);
      } finally {
        statusLoading.value = false;
        scrollToBottom();
      }
    };

    const handleReconnect = async () => {
      if (reconnectLoading.value) {
        return;
      }
      reconnectLoading.value = true;
      if (isConnected.value) {
        addLog("command", "$ telepresence quit (重连: 先断开)");
        try {
          const quitResult = await quitTelepresence();
          if (quitResult.success) {
            addLog("success", "✓ 已断开旧连接");
          } else {
            addLog("error", `✗ 断开旧连接失败: ${quitResult.message}`);
          }
        } catch (error) {
          addLog("error", `✗ 断开异常: ${String(error)}`);
        }
      }
      addLog(
        "command",
        `$ telepresence connect --kubeconfig ${config.kubeconfig}${config.skipTlsVerify ? " --insecure-skip-tls-verify" : ""} --namespace ${config.namespace}`,
      );
      try {
        const result = await connectTelepresence({
          kubeconfig: config.kubeconfig,
          namespace: config.namespace,
          skipTlsVerify: config.skipTlsVerify,
        });
        if (result.success) {
          isConnected.value = true;
          addLog("success", `✓ ${result.message}`);
          ElMessage.success(`主动连接成功，命名空间: ${config.namespace}`);
        } else {
          isConnected.value = false;
          addLog("error", `✗ 连接失败: ${result.message}`);
          ElMessage.error(`连接失败: ${result.message}`);
        }
      } catch (error) {
        addLog("error", `✗ 异常: ${String(error)}`);
        ElMessage.error("连接过程中发生异常");
      } finally {
        reconnectLoading.value = false;
        scrollToBottom();
      }
    };

    const handleClearLogs = () => {
      logs.value = [];
      addLog("info", "日志已清空");
    };

    const handleCopyPath = async () => {
      try {
        await navigator.clipboard.writeText(config.kubeconfig);
        ElMessage.success("已复制到剪贴板");
      } catch {
        ElMessage.error("复制失败");
      }
    };

    // 初始化状态
    const initStatus = async () => {
      try {
        const result = await getStatus();
        if (result.success) {
          const output = result.message.toLowerCase();
          isConnected.value = output.includes("connected") || output.includes("proxy");
        }
      } catch { /* 忽略 */ }
      addLog("info", "🚀 Telepresence 管理工具已启动");
    };
    initStatus();

    // ===== 合并渲染：单页面垂直堆叠 =====
    return () => (
      <div class={nsPage.b()}>
        {/* 页面标题 */}
        <div class={nsPage.e("header")}>
          <h2 class={nsPage.e("title")}>
            <el-icon style={{ marginRight: "8px", verticalAlign: "middle" }}>
              <Connection />
            </el-icon>
            K8s 网络连接工具
          </h2>
          <el-tag type={statusType.value} effect="dark" size="small">
            <el-icon style={{ marginRight: "4px" }}>
              {isConnected.value ? <CircleCheck /> : <CircleClose />}
            </el-icon>
            {statusText.value}
          </el-tag>
        </div>

        {/* Section 1: 连接状态 + 操作按钮 */}
        <div class={nsSection.b()}>
          <h3 class={nsSection.e("title")}>连接操作</h3>
          <div class={ns.e("status-row")}>
            <div class={ns.e("status-indicator")}>
              <el-icon size={36} color={isConnected.value ? "#67c23a" : "#f56c6c"}>
                {isConnected.value ? <CircleCheck /> : <CircleClose />}
              </el-icon>
              <span class={[ns.e("status-value"), isConnected.value ? ns.is("connected") : ns.is("disconnected")]}>
                {statusText.value}
              </span>
            </div>
            <el-button
              size="small"
              icon={RefreshRight}
              loading={statusLoading.value}
              onClick={handleStatus}
            >
              刷新状态
            </el-button>
          </div>
          <div class={ns.e("actions")}>
            <el-button
              type="primary"
              icon={Connection}
              loading={connectLoading.value}
              disabled={isConnected.value || quitLoading.value || reconnectLoading.value}
              onClick={handleConnect}
            >
              {connectLoading.value ? "连接中..." : "连接集群"}
            </el-button>
            <el-button
              type="warning"
              icon={Refresh}
              loading={reconnectLoading.value}
              disabled={connectLoading.value || quitLoading.value}
              onClick={handleReconnect}
            >
              {reconnectLoading.value ? "重连中..." : "主动连接"}
            </el-button>
            <el-button
              type="danger"
              icon={SwitchButton}
              loading={quitLoading.value}
              disabled={!isConnected.value || connectLoading.value || reconnectLoading.value}
              onClick={handleQuit}
            >
              {quitLoading.value ? "断开中..." : "断开连接"}
            </el-button>
          </div>
          {/* 命令预览 */}
          <code class={ns.e("command")}>
            telepresence connect --kubeconfig
            {" "}
            {config.kubeconfig}
            {config.skipTlsVerify ? " --insecure-skip-tls-verify" : ""}
            {" "}
            --namespace
            {" "}
            {config.namespace}
          </code>
        </div>

        {/* Section 2: 配置管理 */}
        <div class={nsSection.b()}>
          <h3 class={nsSection.e("title")}>
            <el-icon style={{ marginRight: "6px", verticalAlign: "middle" }}>
              <Setting />
            </el-icon>
            配置管理
          </h3>
          <div class={ns.e("form")}>
            <div class={ns.e("form-row")}>
              <label class={ns.e("form-label")}>Kubeconfig 路径</label>
              <div class={ns.e("form-input-group")}>
                <el-input
                  v-model={config.kubeconfig}
                  placeholder="请输入 kubeconfig 文件路径"
                  clearable
                  prefixIcon={FolderOpened}
                  size="default"
                />
                <el-button icon={DocumentCopy} onClick={handleCopyPath} />
              </div>
            </div>

            <div class={ns.e("form-row")}>
              <label class={ns.e("form-label")}>命名空间</label>
              <el-select
                v-model={config.namespace}
                placeholder="选择命名空间"
                size="default"
                style={{ width: "100%" }}
              >
                {namespaceOptions.map(opt => (
                  <el-option key={opt.value} label={opt.label} value={opt.value} />
                ))}
              </el-select>
            </div>

            <div class={ns.e("form-row")}>
              <label class={ns.e("form-label")}>TLS 验证</label>
              <el-switch
                v-model={config.skipTlsVerify}
                activeText="跳过 TLS 证书验证"
                inactiveText="验证 TLS 证书"
              />
              <el-tooltip content="开发环境通常使用自签名证书，建议开启此选项。" placement="right">
                <el-icon class={ns.e("info-icon")} size={14} color="#909399">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </div>
          </div>
        </div>

        {/* Section 3: 操作日志 */}
        <div class={nsSection.b()} style={{ padding: 0 }}>
          <div class={nsPage.e("header")} style={{ padding: "16px 20px 8px" }}>
            <h3 class={nsSection.e("title")} style={{ margin: 0 }}>
              <el-icon style={{ marginRight: "6px", verticalAlign: "middle" }}>
                <Document />
              </el-icon>
              操作日志
            </h3>
            <el-button text size="small" icon={RefreshRight} onClick={handleClearLogs}>
              清空
            </el-button>
          </div>
          <div class={ns.e("terminal")}>
            {logs.value.length === 0
              ? (
                  <div class={ns.e("terminal-empty")}>暂无日志输出</div>
                )
              : (
                  logs.value.map((log, index) => (
                    <div key={index} class={[ns.e("log-line"), ns.em("log-line", log.type)]}>
                      <span class={ns.e("log-time")}>
                        [
                        {log.timestamp}
                        ]
                      </span>
                      <span class={ns.e("log-message")}>{log.message}</span>
                    </div>
                  ))
                )}
          </div>
        </div>
      </div>
    );
  },
});

export default TelepresencePanel;
