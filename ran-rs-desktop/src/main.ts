/**
 * 应用入口文件
 *
 * 集成：
 * - Vue 3 应用实例
 * - Vue Router（hash 模式，支持 Tauri 多窗口）
 * - vue-i18n 9.x（中英文国际化）
 * - Element Plus（含暗黑主题）
 * - Pinia（状态管理）
 * - 暗黑主题系统
 */

import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import ElementPlus from "element-plus";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { setupTheme } from "./hooks/use-theme";
import i18n from "./i18n";

import RootApp from "./root-app";
import router from "./router";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "./assets/styles/global.less";
import "./assets/styles/dark-theme.css";

// 初始化暗黑主题系统（尽早执行，避免闪烁）
setupTheme();

// 创建 Vue 应用（RootApp 仅包含 <router-view>）
const app = createApp(RootApp);

// 注册 Pinia 状态管理
const pinia = createPinia();
app.use(pinia);

// 注册 Vue Router
app.use(router);

// 注册 vue-i18n
app.use(i18n);

// 注册 Element Plus（使用 i18n 语言配置）
app.use(ElementPlus);

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// 挂载应用
app.mount("#root");
