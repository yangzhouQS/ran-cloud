import type { PropType } from "vue";
import {
  Connection,
  Document,
  DocumentCopy,
  Grid,
  Monitor,
  Setting,
} from "@element-plus/icons-vue";
import { defineComponent } from "vue";
import { useCsNamespace } from "../hooks/use-namespace";
import "./category-panel.less";

/** 分类项定义 */
export interface CategoryItem {
  key: string;
  label: string;
  icon: typeof Connection;
  description?: string;
}

/** K8s 网络连接工具分类 */
export const k8sCategories: CategoryItem[] = [
  { key: "k8s-network-tools", label: "k8s网络连接工具", icon: Connection, description: "Telepresence 网络代理管理" },
  { key: "json2ts", label: "JSON → TypeScript", icon: DocumentCopy, description: "JSON 类型转换工具" },
];

/** 首页分类 */
export const homeCategories: CategoryItem[] = [
  { key: "overview", label: "总览", icon: Grid, description: "系统概览" },
  { key: "quick", label: "快速操作", icon: Connection, description: "常用快捷操作" },
];

/** 设置分类 */
export const settingsCategories: CategoryItem[] = [
  { key: "general", label: "通用设置", icon: Setting, description: "基本参数" },
  { key: "k8s-config", label: "K8s 配置", icon: Document, description: "Kubernetes 配置" },
];

/** 数据库工具分类 */
export const databaseCategories: CategoryItem[] = [
  { key: "sql-studio", label: "SQL Studio", icon: Document, description: "多数据库 SQL 查询工具" },
];

/** 关于分类 */
export const aboutCategories: CategoryItem[] = [
  { key: "info", label: "关于应用", icon: Document, description: "版本信息" },
];

/** OpenClaw 管理分类 */
export const clawManagerCategories: CategoryItem[] = [
  { key: "claw-gateway", label: "网关管理", icon: Monitor, description: "网关启停、状态监控、Web面板" },
  { key: "claw-config", label: "系统配置", icon: Setting, description: "初始化、模型配置、版本信息" },
  { key: "claw-maintenance", label: "健康检查与维护", icon: Document, description: "环境自检、修复、升级、备份" },
];

/** 根据主导航 key 获取分类列表 */
export function getCategoriesByNav(navKey: string): CategoryItem[] {
  switch (navKey) {
    case "home":
      return homeCategories;
    case "k8s":
      return k8sCategories;
    case "database":
      return databaseCategories;
    case "claw-manager":
      return clawManagerCategories;
    case "settings":
      return settingsCategories;
    case "about":
      return aboutCategories;
    default:
      return [];
  }
}

/** 根据主导航 key 获取面板标题 */
export function getCategoryTitle(navKey: string): string {
  switch (navKey) {
    case "home":
      return "首页";
    case "k8s":
      return "k8s网络连接工具";
    case "database":
      return "数据库工具";
    case "claw-manager":
      return "OpenClaw 管理";
    case "settings":
      return "设置";
    case "about":
      return "关于";
    default:
      return "";
  }
}

const CategoryPanel = defineComponent({
  name: "CategoryPanel",
  props: {
    categories: {
      type: Array as PropType<CategoryItem[]>,
      required: true,
    },
    title: {
      type: String,
      default: "",
    },
    activeKey: {
      type: String,
      required: true,
    },
    onSelect: {
      type: Function as PropType<(key: string) => void>,
      required: true,
    },
  },
  setup(props) {
    const ns = useCsNamespace("category");

    return () => (
      <div class={ns.b()}>
        {props.title && (
          <div class={ns.e("title")}>{props.title}</div>
        )}
        <div class={ns.e("list")}>
          {props.categories.map(item => (
            <div
              key={item.key}
              class={[
                ns.e("item"),
                props.activeKey === item.key && ns.is("active"),
              ]}
              onClick={() => props.onSelect(item.key)}
            >
              <el-icon size={16} class={ns.e("item-icon")}>
                <item.icon />
              </el-icon>
              <div class={ns.e("item-content")}>
                <span class={ns.e("item-label")}>{item.label}</span>
                {item.description && (
                  <span class={ns.e("item-desc")}>{item.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
});

export default CategoryPanel;
