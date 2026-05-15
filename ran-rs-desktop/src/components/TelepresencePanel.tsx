import { defineComponent, ref, reactive, computed } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import {
  Connection,
  SwitchButton,
  Monitor,
  Setting,
  Link as LinkIcon,
  DocumentCopy,
  FolderOpened,
  CircleCheck,
  CircleClose,
  InfoFilled,
  RefreshRight,
  Refresh,
} from '@element-plus/icons-vue';
import {
  connectTelepresence,
  quitTelepresence,
  getStatus,
  type ConnectParams,
} from '../services/telepresence';

/** 命名空间选项 */
interface NamespaceOption {
  label: string;
  value: string;
}

/** 操作日志条目 */
interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'command';
  message: string;
}

const TelepresencePanel = defineComponent({
  name: 'TelepresencePanel',

  setup() {
    // ===== 命名空间选项 =====
    const namespaceOptions: NamespaceOption[] = [
      { label: 'dev-mc (默认)', value: 'dev-mc' },
      { label: 'dev', value: 'dev' },
    ];

    // ===== 连接配置 =====
    const config = reactive({
      kubeconfig: 'C:/Users/10456/.cs/kube-config',
      namespace: 'dev-mc',
      skipTlsVerify: true,
    });

    // ===== 状态管理 =====
    const loading = ref(false);
    const connectLoading = ref(false);
    const quitLoading = ref(false);
    const statusLoading = ref(false);
    const reconnectLoading = ref(false);
    const isConnected = ref(false);
    const logs = ref<LogEntry[]>([]);

    // ===== 计算属性 =====
    const statusText = computed(() => {
      if (isConnected.value) return '已连接';
      return '未连接';
    });

    const statusType = computed((): 'success' | 'danger' | 'info' => {
      if (isConnected.value) return 'success';
      return 'danger';
    });

    // ===== 工具方法 =====
    const getTimestamp = (): string => {
      const now = new Date();
      return now.toLocaleTimeString('zh-CN', { hour12: false });
    };

    const addLog = (type: LogEntry['type'], message: string) => {
      logs.value.push({
        timestamp: getTimestamp(),
        type,
        message,
      });
      // 保留最近 100 条日志
      if (logs.value.length > 100) {
        logs.value = logs.value.slice(-100);
      }
    };

    const scrollToBottom = () => {
      setTimeout(() => {
        const terminal = document.querySelector('.terminal-output');
        if (terminal) {
          terminal.scrollTop = terminal.scrollHeight;
        }
      }, 50);
    };

    // ===== 操作方法 =====

    /** 连接 Telepresence */
    const handleConnect = async () => {
      if (connectLoading.value) return;

      connectLoading.value = true;
      addLog(
        'command',
        `$ telepresence connect --kubeconfig ${config.kubeconfig}${config.skipTlsVerify ? ' --insecure-skip-tls-verify' : ''} --namespace ${config.namespace}`,
      );

      try {
        const result = await connectTelepresence({
          kubeconfig: config.kubeconfig,
          namespace: config.namespace,
          skipTlsVerify: config.skipTlsVerify,
        });

        if (result.success) {
          isConnected.value = true;
          addLog('success', `✓ ${result.message}`);
          ElMessage.success(`已成功连接到命名空间: ${config.namespace}`);
        } else {
          addLog('error', `✗ 连接失败: ${result.message}`);
          ElMessage.error(`连接失败: ${result.message}`);
        }
      } catch (error) {
        addLog('error', `✗ 异常: ${String(error)}`);
        ElMessage.error('连接过程中发生异常');
      } finally {
        connectLoading.value = false;
        scrollToBottom();
      }
    };

    /** 断开连接 */
    const handleQuit = async () => {
      if (quitLoading.value) return;

      try {
        await ElMessageBox.confirm('确定要断开 Telepresence 连接吗？', '确认断开', {
          confirmButtonText: '确定断开',
          cancelButtonText: '取消',
          type: 'warning',
        });
      } catch {
        return;
      }

      quitLoading.value = true;
      addLog('command', '$ telepresence quit');

      try {
        const result = await quitTelepresence();

        if (result.success) {
          isConnected.value = false;
          addLog('success', `✓ ${result.message}`);
          ElMessage.success('已断开 Telepresence 连接');
        } else {
          addLog('error', `✗ 断开失败: ${result.message}`);
          ElMessage.error(`断开失败: ${result.message}`);
        }
      } catch (error) {
        addLog('error', `✗ 异常: ${String(error)}`);
        ElMessage.error('断开连接过程中发生异常');
      } finally {
        quitLoading.value = false;
        scrollToBottom();
      }
    };

    /** 查看状态 */
    const handleStatus = async () => {
      if (statusLoading.value) return;

      statusLoading.value = true;
      addLog('command', '$ telepresence status');

      try {
        const result = await getStatus();

        if (result.success) {
          addLog('info', result.message);
          // 根据输出判断连接状态
          const output = result.message.toLowerCase();
          if (output.includes('connected') || output.includes('proxy')) {
            isConnected.value = true;
          } else if (output.includes('not connected') || output.includes('inactive') || output.includes('not logged in')) {
            isConnected.value = false;
          }
        } else {
          addLog('error', `✗ 获取状态失败: ${result.message}`);
        }
      } catch (error) {
        addLog('error', `✗ 异常: ${String(error)}`);
      } finally {
        statusLoading.value = false;
        scrollToBottom();
      }
    };

    /** 主动连接（强制重连） */
    const handleReconnect = async () => {
      if (reconnectLoading.value) return;

      reconnectLoading.value = true;

      // 如果当前已连接，先断开
      if (isConnected.value) {
        addLog('command', '$ telepresence quit (重连: 先断开)');
        try {
          const quitResult = await quitTelepresence();
          if (quitResult.success) {
            addLog('success', '✓ 已断开旧连接');
          } else {
            addLog('error', `✗ 断开旧连接失败: ${quitResult.message}`);
          }
        } catch (error) {
          addLog('error', `✗ 断开异常: ${String(error)}`);
        }
      }

      // 执行连接
      addLog(
        'command',
        `$ telepresence connect --kubeconfig ${config.kubeconfig}${config.skipTlsVerify ? ' --insecure-skip-tls-verify' : ''} --namespace ${config.namespace}`,
      );

      try {
        const result = await connectTelepresence({
          kubeconfig: config.kubeconfig,
          namespace: config.namespace,
          skipTlsVerify: config.skipTlsVerify,
        });

        if (result.success) {
          isConnected.value = true;
          addLog('success', `✓ ${result.message}`);
          ElMessage.success(`主动连接成功，命名空间: ${config.namespace}`);
        } else {
          isConnected.value = false;
          addLog('error', `✗ 连接失败: ${result.message}`);
          ElMessage.error(`连接失败: ${result.message}`);
        }
      } catch (error) {
        addLog('error', `✗ 异常: ${String(error)}`);
        ElMessage.error('连接过程中发生异常');
      } finally {
        reconnectLoading.value = false;
        scrollToBottom();
      }
    };

    /** 清空日志 */
    const handleClearLogs = () => {
      logs.value = [];
      addLog('info', '日志已清空');
    };

    /** 复制 kubeconfig 路径 */
    const handleCopyPath = async () => {
      try {
        await navigator.clipboard.writeText(config.kubeconfig);
        ElMessage.success('已复制到剪贴板');
      } catch {
        ElMessage.error('复制失败');
      }
    };

    /** 初始化：自动获取状态 */
    const initStatus = async () => {
      loading.value = true;
      try {
        const result = await getStatus();
        if (result.success) {
          const output = result.message.toLowerCase();
          isConnected.value = output.includes('connected') || output.includes('proxy');
        }
      } catch {
        // 忽略初始化错误
      } finally {
        loading.value = false;
      }
      addLog('info', '🚀 Telepresence 管理工具已启动');
    };

    // 启动时初始化
    initStatus();

    return () => (
      <div class="telepresence-panel">
        {/* ===== 头部区域 ===== */}
        <div class="panel-header">
          <div class="header-left">
            <h1 class="header-title">
              <el-icon size={28} style={{ marginRight: '8px' }}>
                <LinkIcon />
              </el-icon>
              Telepresence 快速连接工具
            </h1>
            <p class="header-subtitle">Kubernetes 集群本地开发连接管理</p>
          </div>
          <div class="header-right">
            <el-tag
              type={statusType.value}
              size="large"
              effect="dark"
              class="status-tag"
            >
              <el-icon class="tag-icon">
                {isConnected.value ? <CircleCheck /> : <CircleClose />}
              </el-icon>
              {statusText.value}
            </el-tag>
          </div>
        </div>

        <el-divider style={{ margin: '16px 0' }} />

        {/* ===== 连接配置区域 ===== */}
        <el-card shadow="hover" class="config-card">
          {{
            header: () => (
              <div class="card-header">
                <span>
                  <el-icon style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                    <Setting />
                  </el-icon>
                  连接配置
                </span>
              </div>
            ),
            default: () => (
              <div class="config-form">
                <el-row gutter={20}>
                  <el-col span={16}>
                    <div class="form-item">
                      <label class="form-label">Kubeconfig 路径</label>
                      <div class="input-with-action">
                        <el-input
                          v-model={config.kubeconfig}
                          placeholder="请输入 kubeconfig 文件路径"
                          clearable
                          prefixIcon={FolderOpened}
                          size="large"
                        />
                        <el-tooltip content="复制路径" placement="top">
                          <el-button
                            onClick={handleCopyPath}
                            icon={DocumentCopy}
                            size="large"
                          />
                        </el-tooltip>
                      </div>
                    </div>
                  </el-col>
                  <el-col span={8}>
                    <div class="form-item">
                      <label class="form-label">命名空间 (Namespace)</label>
                      <el-select
                        v-model={config.namespace}
                        placeholder="选择命名空间"
                        size="large"
                        style={{ width: '100%' }}
                      >
                        {namespaceOptions.map((opt) => (
                          <el-option
                            key={opt.value}
                            label={opt.label}
                            value={opt.value}
                          />
                        ))}
                      </el-select>
                    </div>
                  </el-col>
                </el-row>

                <div class="form-item" style={{ marginTop: '16px' }}>
                  <div class="tls-switch">
                    <el-switch
                      v-model={config.skipTlsVerify}
                      activeText="跳过 TLS 证书验证"
                      inactiveText="验证 TLS 证书"
                      size="large"
                    />
                    <el-tooltip content="开发环境通常使用自签名证书，建议开启此选项。生产环境请关闭。" placement="right">
                      <el-icon class="info-icon" size={16} color="#909399">
                        <InfoFilled />
                      </el-icon>
                    </el-tooltip>
                  </div>
                </div>
              </div>
            ),
          }}
        </el-card>

        {/* ===== 操作按钮区域 ===== */}
        <div class="action-buttons">
          <el-space size="large">
            <el-button
              type="primary"
              size="large"
              icon={Connection}
              loading={connectLoading.value}
              disabled={isConnected.value || quitLoading.value || reconnectLoading.value}
              onClick={handleConnect}
              class="action-btn connect-btn"
            >
              {connectLoading.value ? '正在连接...' : isConnected.value ? '已连接' : '连接集群'}
            </el-button>

            <el-button
              type="warning"
              size="large"
              icon={Refresh}
              loading={reconnectLoading.value}
              disabled={connectLoading.value || quitLoading.value}
              onClick={handleReconnect}
              class="action-btn reconnect-btn"
            >
              {reconnectLoading.value ? '正在重连...' : '主动连接'}
            </el-button>

            <el-button
              type="danger"
              size="large"
              icon={SwitchButton}
              loading={quitLoading.value}
              disabled={!isConnected.value || connectLoading.value || reconnectLoading.value}
              onClick={handleQuit}
              class="action-btn"
            >
              {quitLoading.value ? '正在断开...' : '断开连接'}
            </el-button>

            <el-button
              type="info"
              size="large"
              icon={Monitor}
              loading={statusLoading.value}
              disabled={reconnectLoading.value}
              onClick={handleStatus}
              class="action-btn"
            >
              查看状态
            </el-button>
          </el-space>
        </div>

        {/* ===== 命令预览 ===== */}
        <el-card shadow="never" class="command-preview-card">
          {{
            header: () => (
              <div class="card-header">
                <span>
                  <el-icon style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                    <Monitor />
                  </el-icon>
                  即将执行的命令
                </span>
              </div>
            ),
            default: () => (
              <code class="command-preview">
                telepresence connect --kubeconfig {config.kubeconfig}
                {config.skipTlsVerify ? ' --insecure-skip-tls-verify' : ''}
                {' '}--namespace {config.namespace}
              </code>
            ),
          }}
        </el-card>

        {/* ===== 输出终端区域 ===== */}
        <el-card shadow="hover" class="terminal-card">
          {{
            header: () => (
              <div class="card-header">
                <span>
                  <el-icon style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                    <Monitor />
                  </el-icon>
                  输出日志
                </span>
                <el-button
                  text
                  size="small"
                  icon={RefreshRight}
                  onClick={handleClearLogs}
                >
                  清空
                </el-button>
              </div>
            ),
            default: () => (
              <div class="terminal-output">
                {logs.value.length === 0 ? (
                  <div class="terminal-empty">暂无日志输出</div>
                ) : (
                  logs.value.map((log, index) => (
                    <div key={index} class={`log-line log-${log.type}`}>
                      <span class="log-time">[{log.timestamp}]</span>
                      <span class="log-message">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            ),
          }}
        </el-card>
      </div>
    );
  },
});

export default TelepresencePanel;
