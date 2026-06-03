/**
 * 开发工具分类定义
 *
 * 定义开发工具模块的二级分类项和面板标题。
 * 由模块注册表消费，供 CategoryPanel 渲染。
 *
 * @module develop-tools/categories
 */

import type { CategoryItem } from "../../components/category-panel";
import { Connection, DocumentCopy } from "@element-plus/icons-vue";

/** 开发工具分类列表 */
export const developToolsCategories: CategoryItem[] = [
  { key: "k8s-network-tools", label: "k8s网络连接工具", icon: Connection, description: "Telepresence 网络代理管理" },
  { key: "json2ts", label: "JSON → TypeScript", icon: DocumentCopy, description: "JSON 类型转换工具" },
];

/** 分类面板标题 */
export const developToolsTitle = "k8s网络连接工具";
