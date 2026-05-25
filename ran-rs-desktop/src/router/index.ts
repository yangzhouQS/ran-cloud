/**
 * Vue Router 路由实例
 *
 * 仅导出 router 实例，路由表定义在 routes.ts 中。
 */

import { createRouter, createWebHashHistory } from "vue-router";
import routes from "./routes";

/** Vue Router 实例 */
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

/** 更新页面标题 */
router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  if (title) {
    document.title = `${title} - Ran RS Desktop`;
  }
});

export default router;
