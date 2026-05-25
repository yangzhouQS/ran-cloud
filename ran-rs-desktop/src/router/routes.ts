/**
 * 路由表定义
 *
 * 仅导出路由配置数组，供 main.ts 和测试文件使用。
 */

import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("../app"),
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
    component: () => import("../modules/settings/settings-page"),
    meta: { title: "设置" },
  },
  {
    path: "/about",
    name: "about",
    component: () => import("../modules/about/about-page"),
    meta: { title: "关于" },
  },
];

export default routes;
