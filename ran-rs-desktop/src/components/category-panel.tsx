/**
 * CategoryPanel 二级分类面板
 *
 * 纯 UI 展示组件，接收分类列表和回调函数进行渲染。
 * 分类定义已迁移至各业务模块的 categories.ts 文件中。
 *
 * @block ran-category
 */

import type { Component, PropType } from "vue";
import { defineComponent } from "vue";
import { useCsNamespace } from "../hooks/use-namespace";
import "./category-panel.less";

/** 分类项定义 */
export interface CategoryItem {
  key: string;
  label: string;
  icon: Component;
  description?: string;
}

/** 纯 UI 展示组件 */
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
