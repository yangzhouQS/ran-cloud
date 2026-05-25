/**
 * 主入口文件
 *
 * 主窗口使用 createAndMount 工厂 + Vue Router，
 * 其他模块（redis/sql-studio/settings/about）使用各自的独立 main.ts 入口。
 */

import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App";
import routes from "./router/routes";
import { createAndMount } from "./shared/create-app";

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  if (title) {
    document.title = `${title} - Ran RS Desktop`;
  }
});

const app = createAndMount(App);
app.use(router);
