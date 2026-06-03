/**
 * 系统配置面板
 *
 * 功能：
 * - 配置文件夹路径查看与打开（config path）
 * - 配置项读取（config get）
 * - 配置项修改（config set，支持 --restart 自动重启）
 * - 配置项删除（config unset）
 * - 配置校验（config validate）
 * - 常用配置快速设置
 * - 命令执行日志
 *
 * @block ran-claw-config
 */

import type { ConfigEntry, ConfigPreset } from "../types";
import {
  CircleCheck,
  Delete,
  Edit,
  FolderOpened,
  Monitor,
  Refresh,
  Search,
} from "@element-plus/icons-vue";
import { defineComponent, onMounted, reactive, ref } from "vue";
import { useCsNamespace } from "../../../hooks/use-namespace";
import { useCommandExecutor } from "../hooks/use-command-executor";
import CommandLogPanel from "./command-log-panel";
import "./config-panel.less";

/** 常用配置预设列表 */
const CONFIG_PRESETS: ConfigPreset[] = [
  {
    key: "model.baseUrl",
    label: "模型地址",
    placeholder: "http://127.0.0.1:8000/v1",
    inputType: "text",
    description: "本地/远程 LLM API 地址",
    requireRestart: true,
  },
  {
    key: "model.name",
    label: "模型名称",
    placeholder: "qwen2.5:7b",
    inputType: "text",
    description: "使用的模型标识",
    requireRestart: true,
  },
  {
    key: "sandbox.workspaceRoot",
    label: "工作目录",
    placeholder: "D:/openclaw-workspace",
    inputType: "path",
    description: "智能体工作空间根目录",
    requireRestart: false,
  },
  {
    key: "gateway.port",
    label: "网关端口",
    placeholder: "8080",
    inputType: "number",
    description: "网关监听端口",
    requireRestart: true,
  },
  {
    key: "gateway.host",
    label: "网关地址",
    placeholder: "127.0.0.1",
    inputType: "text",
    description: "网关绑定地址",
    requireRestart: true,
  },
];

/** 预设键名集合 */
const PRESET_KEYS = CONFIG_PRESETS.map(p => p.key);

/** 列表图标组件（仅供 TSX 模板使用） */
const CircleListIcon = defineComponent({
  name: "CircleListIcon",
  setup() {
    return () => (
      <svg viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor">
        <path d="M384 128a256 256 0 1 0 0 512 256 256 0 0 0 0-512zm0 64a192 192 0 1 1 0 384 192 192 0 0 1 0-384zM640 128h256v64H640v-64zm0 192h256v64H640v-64zm0 192h256v64H640v-64zm-256 192h512v64H384v-64zm0 192h512v64H384v-64z" />
      </svg>
    );
  },
});

const ConfigPanel = defineComponent({
  name: "ClawConfigPanel",
  setup() {
    const ns = useCsNamespace("claw-config");
    const { loading, commandLogs, execCommand, clearLogs } = useCommandExecutor();

    // ---- 配置路径 ----
    const configPath = ref("~/.openclaw/openclaw.json");

    // ---- 版本信息 ----
    const versionInfo = ref("查询中...");
    const checkingVersion = ref(false);

    // ---- 配置项列表 ----
    const configEntries = ref<ConfigEntry[]>([]);
    const loadingConfigs = ref(false);

    // ---- 自定义查询 ----
    const queryForm = reactive({
      getKey: "",
      setKey: "",
      setValue: "",
      setRestart: false,
    });

    // ---- 常用配置快速设置表单 ----
    const quickForm = reactive<Record<string, string>>({});

    /** 初始化快速设置表单默认值 */
    const initQuickForm = () => {
      for (const preset of CONFIG_PRESETS) {
        quickForm[preset.key] = "";
      }
    };

    // ---- 操作方法 ----

    /** 查看版本 */
    const checkVersion = async () => {
      checkingVersion.value = true;
      try {
        // TODO: 调用 Tauri 后端
        await new Promise(resolve => setTimeout(resolve, 500));
        versionInfo.value = "OpenClaw v1.0.0 (build 20260602)";
      } finally {
        checkingVersion.value = false;
      }
    };

    /** 打开配置文件夹 */
    const openConfigPath = () => execCommand(
      "openclaw config path",
    );

    /** 加载所有配置项 */
    const loadConfigs = async () => {
      loadingConfigs.value = true;
      try {
        // TODO: 调用 Tauri 后端批量获取配置
        await new Promise(resolve => setTimeout(resolve, 800));
        configEntries.value = [
          { key: "model.baseUrl", value: "http://127.0.0.1:8000/v1", description: "LLM API 地址", requireRestart: true },
          { key: "model.name", value: "qwen2.5:7b", description: "模型标识", requireRestart: true },
          { key: "sandbox.workspaceRoot", value: "D:/openclaw-workspace", description: "工作空间根目录", requireRestart: false },
          { key: "gateway.port", value: "8080", description: "网关监听端口", requireRestart: true },
          { key: "gateway.host", value: "127.0.0.1", description: "网关绑定地址", requireRestart: true },
        ];
        // 回填快速设置表单
        for (const entry of configEntries.value) {
          if (PRESET_KEYS.includes(entry.key)) {
            quickForm[entry.key] = entry.value;
          }
        }
      } finally {
        loadingConfigs.value = false;
      }
    };

    /** 读取单个配置 */
    const getConfig = () => {
      if (!queryForm.getKey.trim()) {
        return;
      }
      execCommand(
        `openclaw config get ${queryForm.getKey.trim()}`,
      );
    };

    /** 设置配置（自定义键值） */
    const setConfig = () => {
      const key = queryForm.setKey.trim();
      const value = queryForm.setValue.trim();
      if (!key || !value) {
        return;
      }
      const restartFlag = queryForm.setRestart ? " --restart" : "";
      execCommand(
        `openclaw config set ${key} ${value}${restartFlag}`,
      ).then((result) => {
        if (result.success) {
          // 更新本地缓存
          const existing = configEntries.value.find(e => e.key === key);
          if (existing) {
            existing.value = value;
          } else {
            configEntries.value.push({ key, value, requireRestart: queryForm.setRestart });
          }
          // 同步快速设置表单
          if (PRESET_KEYS.includes(key)) {
            quickForm[key] = value;
          }
        }
      });
    };

    /** 快速设置配置 */
    const quickSetConfig = (preset: ConfigPreset) => {
      const value = quickForm[preset.key]?.trim();
      if (!value) {
        return;
      }
      const restartFlag = preset.requireRestart ? " --restart" : "";
      execCommand(
        `openclaw config set ${preset.key} ${value}${restartFlag}`,
      ).then((result) => {
        if (result.success) {
          const existing = configEntries.value.find(e => e.key === preset.key);
          if (existing) {
            existing.value = value;
          }
        }
      });
    };

    /** 删除配置项 */
    const unsetConfig = (key: string) => {
      execCommand(
        `openclaw config unset ${key}`,
      ).then((result) => {
        if (result.success) {
          configEntries.value = configEntries.value.filter(e => e.key !== key);
          if (PRESET_KEYS.includes(key)) {
            quickForm[key] = "";
          }
        }
      });
    };

    /** 校验配置 */
    const validateConfig = () => execCommand(
      "openclaw config validate",
    );

    onMounted(() => {
      initQuickForm();
      checkVersion();
      loadConfigs();
    });

    return () => (
      <div class={ns.b()}>
        {/* 版本信息卡片 */}
        <div class={ns.e("version-card")}>
          <div class={ns.e("version-header")}>
            <el-icon size={20} color="var(--el-color-primary)"><Monitor /></el-icon>
            <span class={ns.e("version-title")}>版本信息</span>
          </div>
          <div class={ns.e("version-content")}>
            <code>{versionInfo.value}</code>
          </div>
          <el-button
            size="small"
            icon={Refresh}
            loading={checkingVersion.value}
            onClick={checkVersion}
            style={{ marginTop: "8px" }}
          >
            刷新
          </el-button>
        </div>

        {/* 配置文件路径 */}
        <div class={ns.e("path-card")}>
          <div class={ns.e("path-header")}>
            <el-icon size={18} color="var(--el-color-warning)"><FolderOpened /></el-icon>
            <span class={ns.e("path-title")}>配置文件路径</span>
          </div>
          <div class={ns.e("path-content")}>
            <code>{configPath.value}</code>
          </div>
          <el-button
            size="small"
            type="primary"
            icon={FolderOpened}
            loading={loading.value}
            onClick={openConfigPath}
            style={{ marginTop: "8px" }}
          >
            打开配置文件夹
          </el-button>
        </div>

        {/* 常用配置快速设置 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Edit /></el-icon>
          <span>常用配置</span>
        </div>
        <div class={ns.e("quick-config")}>
          {CONFIG_PRESETS.map(preset => (
            <div key={preset.key} class={ns.e("quick-item")}>
              <div class={ns.e("quick-info")}>
                <span class={ns.e("quick-label")}>{preset.label}</span>
                <code class={ns.e("quick-key")}>{preset.key}</code>
                <span class={ns.e("quick-desc")}>{preset.description}</span>
                {preset.requireRestart && (
                  <el-tag size="small" type="warning" class={ns.e("restart-tag")}>需重启</el-tag>
                )}
              </div>
              <div class={ns.e("quick-action")}>
                <el-input
                  size="small"
                  v-model={quickForm[preset.key]}
                  placeholder={preset.placeholder}
                  clearable
                  class={ns.e("quick-input")}
                />
                <el-button
                  size="small"
                  type="primary"
                  loading={loading.value}
                  disabled={!quickForm[preset.key]?.trim()}
                  onClick={() => {
                    quickSetConfig(preset);
                  }}
                >
                  设置
                </el-button>
              </div>
            </div>
          ))}
        </div>

        {/* 自定义配置查询/修改 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><Search /></el-icon>
          <span>自定义配置操作</span>
        </div>
        <div class={ns.e("custom-config")}>
          {/* 读取配置 */}
          <div class={ns.e("custom-row")}>
            <div class={ns.e("custom-label")}>读取配置</div>
            <div class={ns.e("custom-fields")}>
              <el-input
                size="small"
                v-model={queryForm.getKey}
                placeholder="配置键名，如 model.baseUrl"
                clearable
                class={ns.e("custom-input")}
              >
                {{ prefix: () => <span style={{ color: "#909399", fontSize: "12px" }}>openclaw config get</span> }}
              </el-input>
              <el-button
                size="small"
                icon={Search}
                loading={loading.value}
                disabled={!queryForm.getKey.trim()}
                onClick={getConfig}
              >
                查询
              </el-button>
            </div>
          </div>

          {/* 设置配置 */}
          <div class={ns.e("custom-row")}>
            <div class={ns.e("custom-label")}>修改配置</div>
            <div class={ns.e("custom-fields")}>
              <el-input
                size="small"
                v-model={queryForm.setKey}
                placeholder="键名"
                clearable
                style={{ width: "180px" }}
              />
              <el-input
                size="small"
                v-model={queryForm.setValue}
                placeholder="值"
                clearable
                style={{ flex: 1 }}
              />
              <el-checkbox
                v-model={queryForm.setRestart}
                label="自动重启"
                size="small"
              />
              <el-button
                size="small"
                type="primary"
                icon={Edit}
                loading={loading.value}
                disabled={!queryForm.setKey.trim() || !queryForm.setValue.trim()}
                onClick={setConfig}
              >
                设置
              </el-button>
            </div>
          </div>
        </div>

        {/* 当前配置项列表 */}
        <div class={ns.e("section-title")}>
          <el-icon size={16}><CircleListIcon /></el-icon>
          <span>当前配置项</span>
          <el-button
            size="small"
            text
            icon={Refresh}
            loading={loadingConfigs.value}
            onClick={loadConfigs}
            style={{ marginLeft: "auto" }}
          >
            刷新
          </el-button>
        </div>
        <div class={ns.e("config-table")}>
          {configEntries.value.length === 0 && !loadingConfigs.value && (
            <div class={ns.e("config-empty")}>暂无配置项</div>
          )}
          {loadingConfigs.value && (
            <div class={ns.e("config-loading")}>加载中...</div>
          )}
          {configEntries.value.map(entry => (
            <div key={entry.key} class={ns.e("config-row")}>
              <div class={ns.e("config-key")}>
                <code>{entry.key}</code>
                {entry.requireRestart && (
                  <el-tag size="small" type="warning">需重启</el-tag>
                )}
              </div>
              <div class={ns.e("config-value")}>
                <code>{entry.value}</code>
              </div>
              <div class={ns.e("config-desc")}>{entry.description}</div>
              <div class={ns.e("config-actions")}>
                <el-button
                  size="small"
                  text
                  type="danger"
                  icon={Delete}
                  onClick={() => {
                    unsetConfig(entry.key);
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 配置校验 */}
        <div class={ns.e("validate-section")}>
          <el-button
            type="success"
            icon={CircleCheck}
            loading={loading.value}
            onClick={validateConfig}
          >
            校验配置格式
          </el-button>
          <span class={ns.e("validate-hint")}>检查 openclaw.json 格式合法性</span>
        </div>

        {/* 命令日志 */}
        <CommandLogPanel logs={commandLogs.value} onClear={clearLogs} />
      </div>
    );
  },
});

export default ConfigPanel;
