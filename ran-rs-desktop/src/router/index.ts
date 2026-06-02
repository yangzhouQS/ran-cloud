/**
 * Vue Router 路由配置
 *
 * 支持 Tauri 多窗口架构：
 * - 主窗口：#/ → App（三栏布局）
 * - Redis 窗口：#/redis → RedisDesktopManager
 * - SQL Studio 窗口：#/sql-studio → SqlStudio
 * - 设置窗口：#/settings → SettingsPage
 * - 关于窗口：#/about → AboutPage
 *
 * 使用 hash 模式路由，兼容 Tauri WebviewWindow。
 */

import type { RouteRecordRaw } from "vue-router";
import { createRouter, createWebHashHistory } from "vue-router";

/** 路由配置 */
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("../App"),
    meta: { title: "Ran RS Desktop" },
  },
  {
    path: "/redis",
    name: "redis",
    component: () => import("../modules/redis-desktop-manager"),
    meta: { title: "Redis Desktop Manager" },
  },
  {
    path: "/sql-studio",
    name: "sql-studio",
    component: () => import("../modules/sql-studio"),
    meta: { title: "SQL Studio" },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("../pages/settings-page"),
    meta: { title: "设置" },
  },
  {
    path: "/about",
    name: "about",
    component: () => import("../pages/about-page"),
    meta: { title: "关于" },
  },
];

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
