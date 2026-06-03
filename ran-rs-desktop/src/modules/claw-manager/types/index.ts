// modules/claw-manager/types/index.ts
// Claw Manager 类型定义统一导出

/** 网关运行状态 */
export type GatewayStatus = "running" | "stopped" | "error";

/** 命令执行结果 — 对应 Rust CommandResult */
export interface CommandResult {
  /** 是否执行成功（exit code == 0） */
  success: boolean;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码（null 表示进程被信号终止） */
  exitCode: number | null;
  /** 合并后的输出（stdout + stderr） */
  output: string;
  /** 执行耗时（毫秒） */
  durationMs: number;
}

/** 命令执行选项 */
export interface ClawExecOptions {
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 超时时间（秒），默认 30 */
  timeoutSecs?: number;
  /** 可选的可点击 URL（如 Dashboard 地址） */
  url?: string;
}

/** CLI 工具信息 — 对应 Rust ClawCliInfo */
export interface ClawCliInfo {
  /** CLI 是否可用 */
  available: boolean;
  /** CLI 版本号 */
  version: string | null;
  /** CLI 可执行文件路径 */
  path: string | null;
  /** 错误信息（不可用时） */
  error: string | null;
}

/** 命令日志条目 */
export interface CommandLogEntry {
  cmd: string;
  output: string;
  time: string;
  success: boolean;
  /** 可选的可点击 URL（如 Dashboard 地址） */
  url?: string;
}

// ==================== 配置管理 ====================

/** 配置项条目 */
export interface ConfigEntry {
  /** 配置键名（点分路径，如 model.baseUrl） */
  key: string;
  /** 当前值 */
  value: string;
  /** 默认值（可选） */
  defaultValue?: string;
  /** 配置描述 */
  description?: string;
  /** 是否需要重启网关生效 */
  requireRestart?: boolean;
}

/** 常用配置预设（快速设置面板使用） */
export interface ConfigPreset {
  /** 配置键名 */
  key: string;
  /** 显示标签 */
  label: string;
  /** 占位提示 */
  placeholder: string;
  /** 输入类型 */
  inputType?: "text" | "number" | "path";
  /** 配置描述 */
  description: string;
  /** 修改后是否需要重启网关 */
  requireRestart: boolean;
}

// ==================== 智能体管理 ====================

/** 智能体状态 */
export type AgentStatus = "enabled" | "disabled" | "error";

/** 智能体信息 */
export interface AgentInfo {
  /** 智能体名称 */
  name: string;
  /** 运行状态 */
  status: AgentStatus;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 工作目录 */
  workspaceRoot?: string;
  /** 绑定的技能列表 */
  skills?: string[];
  /** 描述信息 */
  description?: string;
}

// ==================== 技能管理 ====================

/** 技能启用状态 */
export type SkillStatus = "enabled" | "disabled" | "error";

/** 技能信息 */
export interface SkillInfo {
  /** 技能名称 */
  name: string;
  /** 运行状态 */
  status: SkillStatus;
  /** 技能版本 */
  version?: string;
  /** 技能描述 */
  description?: string;
  /** 触发规则 */
  triggerRules?: string[];
  /** 来源（本地 / 市场安装） */
  source?: "local" | "market";
  /** 安装包地址 */
  packageUrl?: string;
  /** 是否有语法错误（skills check 结果） */
  hasError?: boolean;
  /** 语法错误详情 */
  errorMessage?: string;
}

// ==================== 知识库 RAG ====================

/** 知识库状态 */
export interface WikiStatus {
  /** 是否已初始化 */
  initialized: boolean;
  /** 文档数量 */
  documentCount: number;
  /** 索引状态 */
  indexStatus: "ready" | "indexing" | "empty" | "error";
  /** 向量库路径 */
  dbPath?: string;
  /** 最后更新时间 */
  lastUpdated?: string;
}

/** 知识库搜索结果 */
export interface WikiSearchResult {
  /** 文档名称 */
  docName: string;
  /** 匹配片段 */
  snippet: string;
  /** 相关度分数 */
  score: number;
  /** 来源路径 */
  source?: string;
}

// ==================== 定时任务 Cron ====================

/** 定时任务状态 */
export type CronTaskStatus = "enabled" | "disabled" | "error";

/** 定时任务信息 */
export interface CronTaskInfo {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** cron 表达式 */
  cronExpression: string;
  /** 执行的 openclaw 指令 */
  command: string;
  /** 运行状态 */
  status: CronTaskStatus;
  /** 上次执行时间 */
  lastRunAt?: string;
  /** 下次执行时间 */
  nextRunAt?: string;
  /** 描述 */
  description?: string;
}

// ==================== 会话 & 日志 ====================

/** 会话信息 */
export interface SessionInfo {
  /** 会话 ID */
  id: string;
  /** 关联的智能体名称 */
  agentName: string;
  /** 会话创建时间 */
  createdAt: string;
  /** 最后活跃时间 */
  lastActiveAt: string;
  /** 消息数量 */
  messageCount: number;
  /** 会话摘要 */
  summary?: string;
}

/** 日志条目 */
export interface LogEntry {
  /** 时间戳 */
  timestamp: string;
  /** 日志级别 */
  level: "info" | "warn" | "error" | "debug";
  /** 日志内容 */
  message: string;
  /** 来源模块 */
  source?: string;
}

// ==================== 渠道接入 ====================

/** 渠道类型 */
export type ChannelType = "feishu" | "wecom" | "dingtalk" | "slack";

/** 渠道状态 */
export type ChannelStatus = "connected" | "disconnected" | "error";

/** 渠道信息 */
export interface ChannelInfo {
  /** 渠道 ID */
  id: string;
  /** 渠道类型 */
  type: ChannelType;
  /** 渠道名称 */
  name: string;
  /** 连接状态 */
  status: ChannelStatus;
  /** Webhook 地址 */
  webhookUrl?: string;
  /** 最后连通时间 */
  lastConnectedAt?: string;
  /** 描述 */
  description?: string;
}
