// modules/claw-manager/types/index.ts
// Claw Manager 类型定义统一导出

/** 网关运行状态 */
export type GatewayStatus = "running" | "stopped" | "error";

/** 命令执行结果 */
export interface CommandResult {
  success: boolean;
  output: string;
  timestamp: string;
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
