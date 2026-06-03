/**
 * 模块注册表
 *
 * 提供模块定义接口和注册/查询函数。
 * 每个业务模块通过 registerModule() 注册自己的分类定义和主内容组件，
 * App.tsx 通过 getModule() 查询当前激活模块的信息。
 *
 * @module _shared/module-registry
 */

import type { Component } from "vue";
import type { CategoryItem } from "../../components/category-panel";

/** 模块定义 */
export interface ModuleDefinition {
  /** 主导航 key（对应 sidebar 的 navKey） */
  navKey: string;
  /** 分类面板标题 */
  categoryTitle: string;
  /** 该模块的二级分类列表 */
  categories: CategoryItem[];
  /** 主内容组件（接收 activeCategory prop） */
  component: Component;
}

/** 模块注册表 */
const moduleMap = new Map<string, ModuleDefinition>();

/** 注册一个模块 */
export function registerModule(def: ModuleDefinition): void {
  if (moduleMap.has(def.navKey)) {
    console.warn(`[ModuleRegistry] 模块 "${def.navKey}" 已注册，将被覆盖`);
  }
  moduleMap.set(def.navKey, def);
}

/** 获取模块定义 */
export function getModule(navKey: string): ModuleDefinition | undefined {
  return moduleMap.get(navKey);
}

/** 获取所有已注册模块的 navKey 列表 */
export function getRegisteredNavKeys(): string[] {
  return Array.from(moduleMap.keys());
}
