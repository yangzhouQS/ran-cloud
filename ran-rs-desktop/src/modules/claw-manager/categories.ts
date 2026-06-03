/**
 * Claw Manager 分类定义
 *
 * 定义 OpenClaw 管理模块的二级分类项和面板标题。
 * 由模块注册表消费，供 CategoryPanel 渲染。
 *
 * @module claw-manager/categories
 */

import type { CategoryItem } from "../../components/category-panel";
import { Document, Monitor, Setting } from "@element-plus/icons-vue";

/** OpenClaw 管理分类列表 */
export const clawManagerCategories: CategoryItem[] = [
  { key: "claw-gateway", label: "网关管理", icon: Monitor, description: "网关启停、状态监控、Web面板" },
  { key: "claw-config", label: "系统配置", icon: Setting, description: "初始化、模型配置、版本信息" },
  { key: "claw-maintenance", label: "健康检查与维护", icon: Document, description: "环境自检、修复、升级、备份" },
];

/** 分类面板标题 */
export const clawManagerTitle = "OpenClaw 管理";
