# Plan: 在 Sidebar 添加数据库入口

## Context

当前 sidebar 有三个主导航项：首页(home)、开发工具(k8s)、Redis。其中 Redis 点击后弹出独立 OS 窗口。SQL Studio 模块已有完整实现和路由(`/sql-studio`)，但未接入 sidebar 导航。

用户需求：在 sidebar 添加"数据库"入口，**和开发工具(k8s)一样的交互模式**（不弹新窗口，右侧打开页面），即在主窗口的三栏布局内通过 `renderMainContent()` 渲染 SQL Studio。

## 修改文件清单（3 个文件）

所有文件路径基于 `ran-rs-desktop/` 目录。

### 1. `src/components/Sidebar.tsx`

- 在 import 中添加 `Coin`：`import { ..., Coin } from "@element-plus/icons-vue";`
- 在 `navItems` 数组末尾添加：
  ```ts
  { key: "database", label: "数据库", icon: Coin },
  ```
- `Coin` 图标已确认在 `@element-plus/icons-vue` 中可用（`dist/types/components/index.d.ts:60`）

### 2. `src/components/category-panel.tsx`

- 添加 `databaseCategories` 分类列表：
  ```ts
  export const databaseCategories: CategoryItem[] = [
    { key: "sql-studio", label: "SQL Studio", icon: Document, description: "多数据库 SQL 查询工具" },
  ];
  ```
- `getCategoriesByNav()` 添加 `case "database": return databaseCategories;`
- `getCategoryTitle()` 添加 `case "database": return "数据库工具";`

### 3. `src/App.tsx`

- 添加导入：`import SqlStudio from "./modules/sql-studio";`
- `renderMainContent()` 添加 `case "database": return <SqlStudio />;`
- `handleNavSelect` 无需特殊处理——database 不在 Redis 的弹窗逻辑中，走默认 in-page 切换

## 验证

1. `npx vitest run` — 确认所有前端测试通过
2. `cargo test --lib --tests` — 确认 Rust 测试不受影响
3. 手动验证：点击 sidebar "数据库"图标 → 右侧主内容区显示 SQL Studio 三栏布局
