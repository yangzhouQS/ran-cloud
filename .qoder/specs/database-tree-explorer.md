# 前端模块拆分与多入口打包方案

## Context

当前 ran-rs-desktop 采用单入口架构（`entry: { index: "./src/main.ts" }`），所有模块共享一个 HTML 页面，通过 Vue Router hash 模式分发。这导致：
- `App.tsx` 静态 import 了 SqlStudio、Json2TsPanel、TelepresencePanel，主窗口启动即加载所有业务代码
- 所有 Tauri 窗口共享同一份 JS bundle，无法按窗口按需加载
- Layout 组件和 hooks 散落在 `src/` 顶层，架构不清晰

目标：每个模块有独立 HTML 入口，Layout 独立为模块，App.tsx 通过路由/动态加载解耦。

## 重组后目录结构

```
src/
  main.ts                           → 主窗口入口（简化为调用 createApp + 注册 Router）
  app.tsx                           → 主窗口组件（去掉直接 import 业务模块，改用路由）
  env.d.ts                          → 保留
  router/index.ts                   → 保留，路由表改为懒加载 develop-tools 子模块

  shared/                           → 新建：跨入口共享资源
    create-app.ts                   → Vue 应用工厂函数（提取自 main.ts）
    styles/
      global.less                   ← 从 src/assets/styles/ 迁入
      dark-theme.css                ← 从 src/assets/styles/ 迁入
    i18n/
      index.ts                      ← 从 src/i18n/ 迁入
      locales/                      ← 从 src/i18n/ 迁入
    assets/
      images/                       ← 从 src/assets/images/ 迁入
    __mocks/
      tauri.ts                      ← 从 src/__mocks__/ 迁入

  modules/
    _shared/
      use-module-bus.ts             → 保留不变

    layout/                         → 新建：Layout 模块
      components/
        Layout.tsx                  ← 从 src/components/ 迁入
        Layout.less                 ← 从 src/components/ 迁入
        Sidebar.tsx                 ← 从 src/components/ 迁入
        sidebar.less                ← 从 src/components/ 迁入
        category-panel.tsx          ← 从 src/components/ 迁入
        category-panel.less         ← 从 src/components/ 迁入
      hooks/
        use-namespace/index.ts      ← 从 src/hooks/ 迁入
        use-namespace/__tests__/    ← 从 src/hooks/ 迁入
        use-theme/index.ts          ← 从 src/hooks/ 迁入
        use-theme/__tests__/        ← 从 src/hooks/ 迁入
      index.ts                      → 导出 Layout, Sidebar, CategoryPanel, hooks

    redis-desktop-manager/
      main.ts                       → 新建：Redis 独立入口
      index.tsx                     → 保留
      ...（其他不变）

    sql-studio/
      main.ts                       → 新建：SQL Studio 独立入口
      index.tsx                     → 保留
      ...（其他不变）

    develop-tools/
      json2ts/                      → 保留（仍由主窗口路由加载）
      telepresence/                 → 保留（仍由主窗口路由加载）

    settings/                       → 新建：从 src/pages/ 拆出
      main.ts                       → 新建：独立入口
      settings-page.tsx             ← 从 src/pages/ 迁入

    about/                          → 新建：从 src/pages/ 拆出
      main.ts                       → 新建：独立入口
      about-page.tsx                ← 从 src/pages/ 迁入

删除：
  src/components/                   → 已迁入 modules/layout/components/
  src/hooks/                        → 已迁入 modules/layout/hooks/
  src/pages/                        → 已迁入 modules/settings/ + modules/about/
  src/assets/styles/                → 已迁入 shared/styles/
  src/assets/images/                → 已迁入 shared/assets/images/
  src/i18n/                         → 已迁入 shared/i18n/
  src/__mocks__/                    → 已迁入 shared/__mocks/
  src/services/                     → 未被使用，直接删除
  src/root-app.tsx                  → 不再需要
```

## 需要修改/新增的文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `rsbuild.config.ts` | 修改 | 单入口 → 多入口 |
| `src/shared/create-app.ts` | 新建 | Vue 应用工厂函数 |
| `src/main.ts` | 修改 | 使用 createApp 工厂 + 注册 Router |
| `src/app.tsx` | 修改 | 去掉直接 import，改用路由懒加载 |
| `src/router/index.ts` | 修改 | 路由表简化，develop-tools 懒加载 |
| `src/modules/layout/**` | 新建/迁入 | Layout 模块 |
| `src/modules/redis-desktop-manager/main.ts` | 新建 | Redis 独立入口 |
| `src/modules/sql-studio/main.ts` | 新建 | SQL Studio 独立入口 |
| `src/modules/settings/main.ts` | 新建 | Settings 独立入口 |
| `src/modules/about/main.ts` | 新建 | About 独立入口 |
| `src-tauri/capabilities/default.json` | 修改 | windows 数组添加 sql-studio |
| `src-tauri/tauri.conf.json` | 修改 | beforeDevCommand 改为 pnpm |
| **24+ 个组件文件** | 修改 | hooks/styles import 路径批量替换 |
| **12+ 个 .less 文件** | 修改 | global.less import 路径替换 |
| `vitest.config.ts` | 修改 | 测试 include 路径不变，无需修改 |

## 实现步骤

### Phase 1：共享资源迁移

#### 1.1 创建 `src/shared/` 目录并迁入资源

**迁入清单**：
- `src/assets/styles/global.less` → `src/shared/styles/global.less`
- `src/assets/styles/dark-theme.css` → `src/shared/styles/dark-theme.css`
- `src/i18n/` → `src/shared/i18n/`
- `src/assets/images/` → `src/shared/assets/images/`
- `src/__mocks__/tauri.ts` → `src/shared/__mocks__/tauri.ts`

**路径替换**：
- 所有 `.less` 文件中的 `@import (reference) "../../assets/styles/global.less"` 及其变体 → 指向 `src/shared/styles/global.less` 的相对路径
- `src/main.ts` 中的 `import "./assets/styles/global.less"` → `import "./shared/styles/global.less"`
- `src/main.ts` 中的 `import "./assets/styles/dark-theme.css"` → `import "./shared/styles/dark-theme.css"`
- `import i18n from "./i18n"` → `import i18n from "./shared/i18n"`
- Sidebar.tsx 中的图片 import 路径更新

#### 1.2 创建 `src/shared/create-app.ts`

提取 `src/main.ts` 中的重复引导逻辑：

```typescript
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
```

#### 1.3 创建 `modules/layout/` 模块

**迁入文件**（从 `src/components/` 和 `src/hooks/`）：
- `src/components/Layout.tsx` → `src/modules/layout/components/Layout.tsx`
- `src/components/layout.less` → `src/modules/layout/components/Layout.less`
- `src/components/Sidebar.tsx` → `src/modules/layout/components/Sidebar.tsx`
- `src/components/sidebar.less` → `src/modules/layout/components/sidebar.less`
- `src/components/category-panel.tsx` → `src/modules/layout/components/category-panel.tsx`
- `src/components/category-panel.less` → `src/modules/layout/components/category-panel.less`
- `src/hooks/use-namespace/` → `src/modules/layout/hooks/use-namespace/`
- `src/hooks/use-theme/` → `src/modules/layout/hooks/use-theme/`

**路径替换（24+ 处 hooks import）**：

所有模块中对 `use-namespace` 的 import 需要更新：

| 当前路径 | 新路径（示例） |
|---------|--------------|
| `../../../hooks/use-namespace` (从 sql-studio/components/) | `../../../modules/layout/hooks/use-namespace` |
| `../../hooks/use-namespace` (从模块根 index.tsx) | `../../modules/layout/hooks/use-namespace` |
| `../../../../hooks/use-namespace` (从 develop-tools/) | `../../../../modules/layout/hooks/use-namespace` |

**创建 `src/modules/layout/index.ts`**：
```typescript
export { default as Layout } from "./components/Layout";
export { default as Sidebar } from "./components/Sidebar";
export { default as CategoryPanel, getCategoriesByNav, getCategoryTitle } from "./components/category-panel";
export { useCsNamespace } from "./hooks/use-namespace";
export { setupTheme } from "./hooks/use-theme";
```

**Layout 组件内部 import 路径更新**：
- `Layout.tsx` 中的 `import CategoryPanel from "./category-panel"` 不变（同级目录）
- `Layout.tsx` 中的 `import Sidebar from "./sidebar"` 不变
- `Layout.tsx` 中的 `import { useCsNamespace } from "../hooks/use-namespace"` 不变

**use-theme 对 use-module-bus 的引用更新**：
- `use-theme/index.ts` 中 `import { ... } from "../../modules/_shared/use-module-bus"` → `import { ... } from "../../_shared/use-module-bus"`（从 `modules/layout/hooks/` 到 `modules/_shared/` 是同级）

### Phase 2：多入口配置

#### 2.1 修改 `rsbuild.config.ts`

```typescript
export default defineConfig({
  plugins: [pluginBabel({ include: /\.(jsx|tsx)$/ }), pluginVue(), pluginVueJsx(), pluginLess()],
  source: {
    entry: {
      index: "./src/main.ts",
      redis: "./src/modules/redis-desktop-manager/main.ts",
      "sql-studio": "./src/modules/sql-studio/main.ts",
      settings: "./src/modules/settings/main.ts",
      about: "./src/modules/about/main.ts",
    },
  },
  server: { port: 4421, strictPort: false },
  html: { title: "Ran RS Desktop", template: "./index.html" },
  output: { distPath: { root: "dist" }, assetPrefix: "/" },
  tools: {
    rspack: {
      output: { globalObject: "self" },
      // splitChunks: Rsbuild 2.x 默认已合理配置，先验证默认行为
    },
  },
  dev: { client: { overlay: false } },
});
```

Rsbuild 多入口会自动为每个 entry 生成同名 HTML（`index.html`、`redis.html`、`sql-studio.html`、`settings.html`、`about.html`），并注入对应 script。当前 `index.html` 中的 ResizeObserver 内联脚本会被所有入口共享，符合预期。

#### 2.2 创建各模块入口文件

**`src/modules/redis-desktop-manager/main.ts`**：
```typescript
import { createAndMount } from "../../shared/create-app";
import RedisDesktopManager from "./index";
createAndMount(RedisDesktopManager);
```

**`src/modules/sql-studio/main.ts`**：
```typescript
import { createAndMount } from "../../shared/create-app";
import SqlStudio from "./index";
createAndMount(SqlStudio);
```

**`src/modules/settings/main.ts`**：
```typescript
import { createAndMount } from "../../shared/create-app";
import SettingsPage from "./settings-page";
createAndMount(SettingsPage);
```

**`src/modules/about/main.ts`**：
```typescript
import { createAndMount } from "../../shared/create-app";
import AboutPage from "./about-page";
createAndMount(AboutPage);
```

**注意**：各模块的 `main.ts` 不注册 Router，不需要。只有主窗口入口需要 Router。

### Phase 3：App.tsx 解耦与路由改造

#### 3.1 简化 `src/main.ts`

```typescript
import router from "./router";
import { createAndMount } from "./shared/create-app";
import App from "./app";

const app = createAndMount(App);
app.use(router);
```

#### 3.2 改造 `src/app.tsx`

**删除直接 import**：
```typescript
// 删除这些：
// import SqlStudio from "./modules/sql-studio";
// import { Json2TsPanel } from "./modules/develop-tools/json2ts";
// import { TelepresencePanel } from "./modules/develop-tools/telepresence";
// import { getCategoriesByNav, getCategoryTitle } from "./components/category-panel";
// import Layout from "./components/layout";
// import { useCsNamespace } from "./hooks/use-namespace";
// import "./components/layout.less";
```

**新增路由化 import**：
```typescript
import Layout from "./modules/layout/components/Layout";
import { getCategoriesByNav, getCategoryTitle } from "./modules/layout/components/category-panel";
import { useCsNamespace } from "./modules/layout/hooks/use-namespace";
import "./modules/layout/components/layout.less";
```

**`renderMainContent` 改为 `<router-view>`**：
```tsx
// 在 Layout 的 main slot 中使用 router-view
return () => (
  <Layout ...>
    <router-view />
  </Layout>
);
```

**`buildWindowUrl` 改为 `buildModuleUrl`**：
```typescript
function buildModuleUrl(entryName: string): string {
  // 开发模式：http://localhost:4421/redis.html
  // 生产模式：Tauri 使用相对路径，自动解析为 tauri://localhost/redis.html
  const isDev = !("__TAURI_INTERNALS__" in window) || window.location.protocol.startsWith("http");
  if (isDev) {
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
    return `${base}${entryName}.html`;
  }
  return `${entryName}.html`;
}
```

**handleNavSelect 更新**：
- Redis 点击 → `buildModuleUrl("redis")` 打开新窗口
- Database 点击 → `router.push("/database/sql-studio")` 或 `buildModuleUrl("sql-studio")` 打开新窗口
- K8s/Home → 通过路由切换

**handleToolClick 更新**：
- Settings → `buildModuleUrl("settings")` 打开新窗口
- About → `buildModuleUrl("about")` 打开新窗口

#### 3.3 更新路由表

```typescript
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: () => import("../app"),  // 主布局
    children: [
      { path: "", name: "home", component: () => import("../modules/develop-tools/telepresence") },
      { path: "k8s/telepresence", name: "telepresence", component: () => import("../modules/develop-tools/telepresence") },
      { path: "k8s/json2ts", name: "json2ts", component: () => import("../modules/develop-tools/json2ts") },
      { path: "database/sql-studio", name: "sql-studio-embed", component: () => import("../modules/sql-studio") },
    ],
  },
];
```

### Phase 4：Tauri 配置更新

#### 4.1 `src-tauri/tauri.conf.json`

```json
{
  "build": {
    "beforeDevCommand": "pnpm run dev",
    "devUrl": "http://localhost:4421",
    "beforeBuildCommand": "pnpm run build",
    "frontendDist": "../dist"
  }
}
```

注意 `beforeDevCommand` 从 `npm run dev` 改为 `pnpm run dev`。主窗口默认加载 `/`（即 `index.html`），无需额外配置。

#### 4.2 `src-tauri/capabilities/default.json`

```json
{
  "windows": ["main", "settings", "about", "redis", "sql-studio"]
}
```

添加 `"sql-studio"` 窗口标签。

### Phase 5：清理废弃文件

删除以下已迁移的原始文件/目录：
- `src/components/` 目录
- `src/hooks/` 目录
- `src/pages/` 目录
- `src/assets/styles/` 目录
- `src/assets/images/` 目录
- `src/i18n/` 目录
- `src/__mocks__/` 目录
- `src/services/` 目录（未被使用）
- `src/root-app.tsx`

## 路径替换汇总

影响面最大的改动是 hooks 和 styles 的路径变更：

| 类型 | 受影响文件数 | 变更说明 |
|------|------------|---------|
| `use-namespace` import | 24 处 | `../hooks/use-namespace` → `../modules/layout/hooks/use-namespace`（各层级不同） |
| `use-theme` import | 1 处 | 仅 `main.ts`（现已在 create-app.ts 中） |
| `global.less` @import | 12 处 | `../../assets/styles/global.less` → `../../shared/styles/global.less`（各层级不同） |
| Layout/Sidebar import | 2 处 | `app.tsx` 和 `Layout.tsx` 内部 |
| `dark-theme.css` import | 1 处 | `main.ts`（现已在 create-app.ts 中） |
| Element Plus CSS import | 1 处 | `main.ts`（现已在 create-app.ts 中） |
| 测试 mock import | 2 处 | `src/__mocks__/tauri.ts` → `src/shared/__mocks__/tauri.ts` |

## 验证方式

### 编译验证
1. `pnpm run typecheck` — TypeScript 无错误
2. `pnpm run build` — Rsbuild 构建成功，产出 5 个 HTML 文件
3. `pnpm run test` — 所有 vitest 测试通过

### 开发模式验证
4. `pnpm run dev` 启动后：
   - `http://localhost:4421/` → 主窗口 Layout 正常渲染
   - `http://localhost:4421/redis.html` → Redis Desktop Manager 正常渲染
   - `http://localhost:4421/sql-studio.html` → SQL Studio 正常渲染
   - `http://localhost:4421/settings.html` → 设置页正常渲染
   - `http://localhost:4421/about.html` → 关于页正常渲染

### Tauri 集成验证
5. `pnpm run tauri:dev` — 主窗口正常，导航打开各独立窗口正常
6. `pnpm run tauri:build` — 生产打包成功
