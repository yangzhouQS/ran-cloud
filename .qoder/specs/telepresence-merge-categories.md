# Telepresence 模块二级分类合并方案

## Context

当前 `k8s` 一级菜单下有 4 个二级分类（连接管理、状态监控、配置管理、操作日志），用户需要切换 category 才能看到不同功能区。需求是将这 4 个分类合并为一个页面，统一垂直堆叠展示，二级分类名称改为 **"k8s网络连接工具"**。

合并后，当用户点击 Sidebar 的 "K8s 连接" 时，不再显示二级分类面板（category-panel），而是直接展示一个包含所有功能的完整面板。

## 修改方案

### 1. 重构 TelepresencePanel — 移除 `activeCategory` prop，合并为单页面

**文件**: `src/modules/develop-tools/telepresence/components/telepresence-panel.tsx`

- 移除 `activeCategory` prop
- 移除 `switch (props.activeCategory)` 分发逻辑
- 将 `renderConnect()`、`renderStatus()`、`renderConfig()`、`renderLogs()` 四个渲染方法的内容合并为一个页面，按顺序垂直堆叠：
  - 顶部：连接状态指示 + 操作按钮区域（合并原 renderConnect + renderStatus）
  - 中间：配置表单区域（原 renderConfig）
  - 底部：操作日志终端（原 renderLogs）

### 2. 更新 category-panel.tsx — k8s 只保留单一 category

**文件**: `src/components/category-panel.tsx`

- `k8sCategories` 从 4 项改为 1 项：`{ key: "k8s-network-tools", label: "k8s网络连接工具", icon: Connection, description: "Telepresence 网络代理管理" }`
- `getCategoryTitle("k8s")` 返回 `"k8s网络连接工具"`

### 3. 更新 App.tsx — 简化 k8s 渲染逻辑

**文件**: `src/App.tsx`

- `renderMainContent()` 中 `case "k8s"` 不再传递 `activeCategory` prop
- `TelepresencePanel` 无需 prop，直接渲染
- `activeCategory` 初始值改为 `"k8s-network-tools"`

### 4. 调整样式 — 适配单页面布局

**文件**: `src/modules/develop-tools/telepresence/components/telepresence-panel.less`

- 为合并后的各区域间添加合理间距
- 调整各 section 间的视觉分隔

## 涉及文件清单

| 文件 | 操作 |
|------|------|
| `src/modules/develop-tools/telepresence/components/telepresence-panel.tsx` | 重构：合并四视图为单页面 |
| `src/modules/develop-tools/telepresence/components/telepresence-panel.less` | 调整样式间距 |
| `src/components/category-panel.tsx` | 修改：k8s 改为单一 category |
| `src/App.tsx` | 简化：移除 activeCategory 传递 |

## 验证方式

1. 运行 `npx rsbuild build` 确认构建通过
2. 点击 Sidebar "K8s 连接"，验证：
   - 二级面板只显示一个分类项 "k8s网络连接工具"
   - 主内容区展示完整的合并面板（状态+按钮、配置、日志）
   - 所有原有功能（连接、断开、重连、刷新状态、配置修改、日志清空）均可用
