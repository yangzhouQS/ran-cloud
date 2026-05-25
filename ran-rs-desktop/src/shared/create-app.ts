import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import ElementPlus from "element-plus";
import { createPinia } from "pinia";
import { createApp, type Component } from "vue";
import { setupTheme } from "../modules/layout/hooks/use-theme";
import i18n from "./i18n";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "./styles/global.less";
import "./styles/dark-theme.css";

export function createAndMount(rootComponent: Component, mountId = "#root") {
  setupTheme();
  const app = createApp(rootComponent);
  app.use(createPinia());
  app.use(i18n);
  app.use(ElementPlus);
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
  }
  app.mount(mountId);
  return app;
}
