/**
 * Claw Manager 分类定义
 *
 * 定义 OpenClaw 管理模块的二级分类项和面板标题。
 * 由模块注册表消费，供 CategoryPanel 渲染。
 *
 * @module claw-manager/categories
 */

import type { CategoryItem } from "../../components/category-panel";
import {
  Avatar,
  ChatDotRound,
  Collection,
  Connection,
  Document,
  MagicStick,
  Monitor,
  Setting,
  Timer,
} from "@element-plus/icons-vue";

/** OpenClaw 管理分类列表 */
export const clawManagerCategories: CategoryItem[] = [
  { key: "claw-gateway", label: "网关管理", icon: Monitor, description: "网关启停、状态监控、Web面板" },
  { key: "claw-agents", label: "智能体管理", icon: Avatar, description: "创建、编辑、启用/禁用、调用测试智能体" },
  { key: "claw-skills", label: "技能管理", icon: MagicStick, description: "安装、校验、启停自定义技能" },
  { key: "claw-config", label: "系统配置", icon: Setting, description: "初始化、模型配置、版本信息" },
  { key: "claw-maintenance", label: "健康检查与维护", icon: Document, description: "环境自检、修复、升级、备份" },
  { key: "claw-wiki", label: "知识库 RAG", icon: Collection, description: "初始化、导入文档、检索知识库" },
  { key: "claw-cron", label: "定时任务", icon: Timer, description: "创建、管理、执行定时任务" },
  { key: "claw-sessions", label: "会话与日志", icon: ChatDotRound, description: "查看历史会话、运行日志" },
  { key: "claw-channels", label: "渠道接入", icon: Connection, description: "对接企业微信、飞书等 IM 渠道" },
];

/** 分类面板标题 */
export const clawManagerTitle = "OpenClaw 管理";
