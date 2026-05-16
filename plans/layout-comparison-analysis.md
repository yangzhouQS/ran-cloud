# 新旧版本布局差异对比分析报告

> 对比旧版 AnotherRedisDesktopManager（Vue 2 + Element UI）与新版 ran-rs-desktop（Vue 3 + Element Plus + TSX）的布局差异

---

## 一、整体布局架构对比

### 旧版架构

旧版采用 **两栏布局**：

```
┌──────────────┬────────────────────────────────────────┐
│  Aside.vue   │            主内容区                      │
│  ┌──────────┐│  ┌─────────────┬──────────────────────┐ │
│  │顶部按钮区 ││  │ OperateItem │                      │ │
│  │新建/设置  ││  │ 搜索/DB切换  │     KeyDetail        │ │
│  ├──────────┤│  ├─────────────┤     /Tabs            │ │
│  │Connections││  │  KeyList    │     /CliTab          │ │
│  │连接列表   ││  │  虚拟树列表  │     /Status          │ │
│  │          ││  │            │                      │ │
│  │          ││  │            │                      │ │
│  └──────────┘│  └─────────────┴──────────────────────┘ │
└──────────────┴────────────────────────────────────────┘
```

- **左栏**：Aside.vue（固定宽度，包含顶部按钮 + Connections 列表）
- **右栏**：主内容区（OperateItem 搜索栏 + KeyList + KeyDetail/Tabs）
- Key 列表和详情在**同一区域**内通过 Tabs 切换显示

### 新版架构

新版采用 **三栏布局**：

```
┌──────────────┬──────────────┬────────────────────────────┐
│ Connection   │  KeyPanel    │        Main                 │
│ Sidebar      │              │  ┌────────────────────────┐ │
│ ┌──────────┐ │ ┌──────────┐ │  │ TabBar                 │ │
│ │ 标题栏   │ │ │ 搜索栏   │ │  ├────────────────────────┤ │
│ │ 连接+新建│ │ │ SCAN进度 │ │  │                        │ │
│ ├──────────┤ │ ├──────────┤ │  │  Content Area          │ │
│ │ 连接列表 │ │ │ Key列表  │ │  │  KeyDetail/Status/     │ │
│ │          │ │ │ 虚拟滚动 │ │  │  CliTerminal/...       │ │
│ │          │ │ │          │ │  │                        │ │
│ │          │ │ ├──────────┤ │  │                        │ │
│ │          │ │ │ 底部状态 │ │  │                        │ │
│ └──────────┘ │ └──────────┘ │  └────────────────────────┘ │
└──────────────┴──────────────┴────────────────────────────┘
```

- **左栏**：ConnectionSidebar（260px 固定宽度）
- **中栏**：KeyPanel（280px 固定宽度，仅在有活跃连接时显示）
- **右栏**：TabBar + ContentArea（flex: 1 自适应）

---

## 二、连接侧边栏布局差异分析

### 2.1 旧版布局结构

**文件**：[`Aside.vue`](AnotherRedisDesktopManager/src/Aside.vue) + [`Connections.vue`](AnotherRedisDesktopManager/src/components/Connections.vue) + [`ConnectionMenu.vue`](AnotherRedisDesktopManager/src/components/ConnectionMenu.vue)

#### 顶部按钮区（Aside.vue）

| 元素 | 说明 |
|------|------|
| 命令日志按钮 | `el-button` + `el-icon-time`，浮动右侧，44px 宽 |
| 设置按钮 | `el-button` + `el-icon-setting`，浮动右侧，44px 宽 |
| 新建连接按钮 | `el-button` + `el-icon-circle-plus`，宽度 100%，info 类型 |

**布局特点**：
- 使用 `float: right` 布局设置和日志按钮
- 新建连接按钮独占一行，宽度撑满（减去右侧按钮区域 109px）
- 顶部容器 `margin-right: 8px`

#### 连接列表区（Connections.vue）

| 元素 | 说明 |
|------|------|
| 搜索框 | 当连接数 >= 4 时显示，`el-input` size=mini，带搜索图标 |
| 连接列表 | `ConnectionWrapper` 组件循环渲染 |
| 回到顶部 | `ScrollToTop` 组件 |

**布局特点**：
- 高度 `calc(100vh - 59px)`，`overflow-y: auto`
- 列表区最小高度 `calc(100vh - 110px)`（支持拖拽排序）
- 使用 `sortablejs` 实现拖拽排序
- 搜索框 `padding-right: 13px`，`margin-bottom: 4px`

#### 连接菜单（ConnectionMenu.vue）

每个连接项的菜单结构：

| 元素 | 说明 |
|------|------|
| 状态/首页图标 | `fa fa-home`，连接后变绿色 |
| 终端图标 | `fa fa-terminal`，打开 CLI |
| 刷新图标 | `el-icon-refresh` |
| 更多操作菜单 | `el-dropdown`，包含：关闭/编辑/删除/复制/颜色标记/内存分析/慢日志/导入Key/导入CMD/FlushDB |
| 连接名称 | 加粗显示，`font-size: 1.04em`，带 title tooltip 显示完整连接信息 |

**交互特点**：
- 操作图标 `position: absolute; right: 25px`
- 图标 hover 背景变色 `background: #dcdee0; border-radius: 3px`
- 连接名称 `word-break: keep-all; white-space: nowrap; text-overflow: ellipsis`
- 更多操作通过 dropdown 菜单实现
- 支持**颜色标记**（`el-color-picker`）
- 支持**拖拽排序**（sortablejs）

### 2.2 新版布局结构

**文件**：[`connection-sidebar.tsx`](ran-rs-desktop/src/modules/redis-desktop-manager/components/connection-sidebar.tsx) + [`connection-sidebar.less`](ran-rs-desktop/src/modules/redis-desktop-manager/components/connection-sidebar.less)

#### 整体结构

| 区域 | BEM 类名 | 说明 |
|------|----------|------|
| 根容器 | `ran-connection-sidebar` | 240px 宽，flex column |
| 标题栏 | `__header` | flex 布局，标题 + 圆形新建按钮 |
| 连接列表 | `__list` | flex:1，overflow-y: auto |
| 连接项 | `__item` | 带状态指示器 + 名称 + 地址 |
| 连接项头部 | `__item-header` | flex 布局，gap: 8px |
| 操作按钮 | `__item-actions` | flex 布局，右对齐 |
| DB 列表 | `__db-list` | flex-wrap 布局 |
| 空状态 | `__empty` | el-empty 组件 |

**布局特点**：
- 严格的 BEM 命名规范（`ran-connection-sidebar`）
- 使用 `useCsNamespace` hook 生成类名
- 固定 240px 宽度
- 连接项分为两行：头部（状态点 + 名称 + 地址）+ 操作按钮行
- DB 列表在连接展开时显示，固定 16 个 DB
- 暗黑主题通过 `html.dark` 选择器实现

### 2.3 具体差异点列表

| # | 差异点 | 旧版 | 新版 | 影响 |
|---|--------|------|------|------|
| 1 | **顶部工具栏** | 独立的按钮区：命令日志、设置、新建连接 | 仅标题 + 新建按钮（圆形小按钮） | 新版缺少命令日志和设置入口 |
| 2 | **连接搜索** | 连接数 >= 4 时显示搜索框 | 无搜索功能 | 新版缺少连接搜索 |
| 3 | **连接名称显示** | 仅名称，加粗，带 tooltip 显示 host/port/ssh 等详情 | 名称 + host:port 同行显示 | 新版信息展示更直观但占用更多空间 |
| 4 | **操作按钮位置** | 绝对定位在右侧（`position: absolute; right: 25px`） | 独立一行在底部（`__item-actions`） | 新版操作按钮更明显但占用垂直空间 |
| 5 | **操作菜单丰富度** | dropdown 菜单：关闭/编辑/删除/复制/颜色标记/内存分析/慢日志/导入/FlushDB | 直接按钮：连接/断开 + 编辑 + 删除 + 刷新 | 新版缺少复制、颜色标记、内存分析、慢日志、导入、FlushDB |
| 6 | **状态指示器** | 首页图标颜色变化（连接后绿色） | 圆形状态点（绿/黄/灰/红） | 新版更直观 |
| 7 | **DB 选择器** | 在 ConnectionWrapper 内通过 el-submenu 展开 | 在连接项下方 flex-wrap 展示 | 新版 DB 选择更直观 |
| 8 | **拖拽排序** | sortablejs 支持拖拽排序 | 无拖拽排序 | 新版缺少排序功能 |
| 9 | **颜色标记** | el-color-picker 支持 5 种预设颜色 | 无颜色标记 | 新版缺少视觉区分功能 |
| 10 | **快捷键** | Ctrl+N/Ctrl+,/Ctrl+G | 无快捷键 | 新版缺少快捷键支持 |
| 11 | **侧边栏宽度** | 未固定（由 el-aside 决定） | 固定 240px（组件内） + 外层 260px | 宽度不一致 |
| 12 | **回到顶部** | ScrollToTop 组件 | 无 | 新版缺少长列表优化 |

### 2.4 连接侧边栏修改方案

#### P0 - 必须修改

1. **添加连接搜索功能**
   - 在 `__header` 下方添加搜索输入框
   - 当连接数 >= 4 时自动显示
   - 参考：[`Connections.vue`](AnotherRedisDesktopManager/src/components/Connections.vue:4) 的 `filterMode` 逻辑

   ```tsx
   // connection-sidebar.tsx - 在 header 后添加
   {store.connectionList.length >= 4 && (
     <div class={ns.e("search")}>
       <el-input
         v-model={connectionFilter.value}
         placeholder="搜索连接..."
         clearable
         size="small"
       >
         {{ prefix: () => <el-icon><Search /></el-icon> }}
       </el-input>
     </div>
   )}
   ```

2. **统一侧边栏宽度**
   - `connection-sidebar.less` 中 `width: 240px` 与 `index.less` 中 `__sidebar: width: 260px` 不一致
   - 建议：组件内部不设固定宽度，由外层容器控制

   ```less
   // connection-sidebar.less - 移除固定宽度
   .ran-connection-sidebar {
     // width: 240px;  // 移除，由外层控制
     width: 100%;
     height: 100%;
     // ...
   }
   ```

3. **丰富操作菜单**
   - 将当前直接按钮改为 dropdown 菜单，包含旧版的完整操作项
   - 参考 [`ConnectionMenu.vue`](AnotherRedisDesktopManager/src/components/ConnectionMenu.vue:20) 的 `el-dropdown` 实现

   ```tsx
   // 使用 el-dropdown 替换当前直接按钮
   <el-dropdown trigger="click">
     <el-button link size="small">
       <el-icon><MoreFilled /></el-icon>
     </el-button>
     {{
       dropdown: () => (
         <el-dropdown-menu>
           <el-dropdown-item>断开连接</el-dropdown-item>
           <el-dropdown-item>编辑连接</el-dropdown-item>
           <el-dropdown-item>复制连接</el-dropdown-item>
           <el-dropdown-item divided>删除连接</el-dropdown-item>
           <el-dropdown-item>颜色标记</el-dropdown-item>
           <el-dropdown-item divided>内存分析</el-dropdown-item>
           <el-dropdown-item>慢日志</el-dropdown-item>
           <el-dropdown-item>导入 Key</el-dropdown-item>
           <el-dropdown-item>导入 CMD</el-dropdown-item>
           <el-dropdown-item divided>FlushDB</el-dropdown-item>
         </el-dropdown-menu>
       )
     }}
   </el-dropdown>
   ```

#### P1 - 建议修改

4. **添加颜色标记功能**
   - 在连接项中添加颜色指示条
   - 使用 `el-color-picker` 或预设颜色选择

5. **添加拖拽排序**
   - 引入 `vuedraggable` 或 `sortablejs`
   - 支持连接列表拖拽重新排序

6. **优化连接项布局**
   - 将操作按钮改为 hover 时显示在右侧（参考旧版的 `position: absolute` 方案）
   - 减少垂直空间占用

   ```less
   // 优化：操作按钮悬浮显示
   &__item-actions {
     position: absolute;
     right: 8px;
     top: 50%;
     transform: translateY(-50%);
     opacity: 0;
     transition: opacity 0.2s;
   }
   &__item:hover &__item-actions {
     opacity: 1;
   }
   ```

7. **添加连接详情 Tooltip**
   - 参考 [`ConnectionMenu.vue`](AnotherRedisDesktopManager/src/components/ConnectionMenu.vue:114) 的 `connectionTitle()` 方法
   - 显示 host/port/username/separator/SSH/Cluster/Sentinel 等信息

---

## 三、Key 面板布局差异分析

### 3.1 旧版布局结构

**文件**：[`KeyList.vue`](AnotherRedisDesktopManager/src/components/KeyList.vue) + [`KeyListVirtualTree.vue`](AnotherRedisDesktopManager/src/components/KeyListVirtualTree.vue)

#### 搜索栏（OperateItem.vue 中，非 KeyList 自身）

旧版的搜索栏在 `OperateItem.vue` 中，位于 Key 列表上方的主内容区顶部：
- Pattern 搜索输入框
- 精确搜索切换
- DB 切换下拉
- 树形/列表视图切换

#### Key 列表（KeyListVirtualTree.vue）

| 元素 | 说明 |
|------|------|
| 批量操作栏 | 全选 checkbox + 删除/导出/取消按钮，仅多选模式显示 |
| 虚拟树 | `VueEasyTree` 组件，虚拟滚动，itemSize=22 |
| 右键菜单 | 自定义 div，fixed 定位 |
| 加载更多按钮 | "加载更多" + "加载全部" 按钮 |

**布局特点**：
- 树高度 `calc(100vh - 250px)`（普通模式）/ `calc(100vh - 284px)`（多选模式）
- 使用 `@qii404/vue-easy-tree` 实现虚拟滚动
- 节点高度 22px，缩进 10px
- 展开图标使用 `fa fa-chevron-right`
- 文件夹图标 `fa fa-folder` / `fa fa-folder-open`
- 文件夹后显示 key 数量 `(count)`
- 支持 separator 分隔符的树形结构
- 节点上限 200,000（超出截断并警告）

**交互特点**：
- **右键菜单**：文件夹（多选/内存分析/加载当前文件夹/删除文件夹）、Key（复制/删除/多选/新标签打开/导出）
- **多选模式**：checkbox 全选/反选，Shift 多选
- **加载更多**：分页加载，支持加载全部
- **键盘导航**：上下箭头选择节点
- **Ctrl/Cmd+Click**：在新标签页打开 Key

#### 样式细节

```css
/* 节点 hover */
.el-tree-node > .el-tree-node__content:hover { background-color: #e7e7e7; }
/* 当前选中 */
.el-tree-node.is-current > .el-tree-node__content { background-color: #d4d4d4; }
/* 自定义节点 */
.key-list-custom-node { height: 22px; line-height: 22px; text-overflow: ellipsis; }
/* 文件夹数量 */
.key-list-count { color: #848a90; float: right; }
```

### 3.2 新版布局结构

**文件**：[`key-panel.tsx`](ran-rs-desktop/src/modules/redis-desktop-manager/components/key-panel.tsx) + [`key-panel.less`](ran-rs-desktop/src/modules/redis-desktop-manager/components/key-panel.less)

#### 整体结构

| 区域 | BEM 类名 | 说明 |
|------|----------|------|
| 根容器 | `ran-key-panel` | 320px 宽，flex column |
| 搜索栏 | `__search` | el-input + pattern 搜索 |
| SCAN 进度 | `__progress` | el-progress + 进度信息 + 停止按钮 |
| 工具栏 | `__toolbar` | 多选时显示，已选中数 + 批量删除 |
| Key 列表 | `__list` > `__list-inner` | 普通列表渲染 |
| Key 项 | `__key-item` | checkbox + key-info + 删除按钮 |
| Key 信息 | `__key-info` | key-name + key-meta |
| Key 元信息 | `__key-meta` | key-type tag + key-ttl |
| 底部状态栏 | `__status` | DB 号 + Key 总数 |
| 空状态 | `__empty` | el-empty |

**布局特点**：
- 固定 320px 宽度
- 每个 Key 项显示：checkbox + key名称 + 类型tag + TTL + 删除按钮
- 删除按钮 hover 时显示（`opacity: 0 -> 1`）
- SCAN 进度条带条纹动画
- 底部固定状态栏

### 3.3 具体差异点列表

| # | 差异点 | 旧版 | 新版 | 影响 |
|---|--------|------|------|------|
| 1 | **Key 展示形式** | **虚拟树**（基于 separator 的树形结构） | **扁平列表**（无树形结构） | **核心差异** — 新版丢失了树形浏览能力 |
| 2 | **虚拟滚动** | `VueEasyTree` 虚拟滚动，支持 20 万节点 | 普通列表渲染，无虚拟滚动 | **性能问题** — 大量 Key 时新版会卡顿 |
| 3 | **搜索栏位置** | 在 OperateItem 中（主内容区顶部） | 在 KeyPanel 内部顶部 | 新版更合理，搜索与列表在同一面板 |
| 4 | **DB 切换** | 在 OperateItem 中通过下拉选择 | 在 ConnectionSidebar 的 DB 列表中选择 | 交互位置变化 |
| 5 | **右键菜单** | 完整的右键菜单（文件夹/Key 分别不同菜单项） | 无右键菜单 | 新版缺少右键交互 |
| 6 | **多选模式** | 通过右键"多选"进入，checkbox 模式，支持 Shift 多选 | 始终显示 checkbox | 新版始终显示 checkbox 更直观 |
| 7 | **加载更多** | 分页加载 + "加载更多"/"加载全部" 按钮 | 一次性 SCAN + 进度条 | 新版用进度条替代了分页加载 |
| 8 | **文件夹概念** | 基于 separator 的树形文件夹，显示子 Key 数量 | 无文件夹概念 | 新版丢失了层级浏览 |
| 9 | **Key 元信息** | 不显示 type/ttl（需点击查看） | 直接显示 type tag + TTL | 新版信息更丰富 |
| 10 | **导出功能** | 支持批量导出 Key（DUMP/PTTL） | 无导出功能 | 新版缺少导出 |
| 11 | **新标签打开** | Ctrl/Cmd+Click 在新标签页打开 | 无此交互 | 新版缺少快捷操作 |
| 12 | **键盘导航** | 上下箭头选择节点 | 无键盘导航 | 新版缺少键盘操作 |
| 13 | **节点上限** | 200,000 节点上限，超出警告 | 无限制 | 新版缺少保护机制 |
| 14 | **底部状态栏** | 无 | 显示 DB 号 + Key 总数 | 新版增加了状态信息 |
| 15 | **SCAN 进度** | 搜索图标变为 loading，有取消按钮 | 进度条 + 已扫描/已找到数字 + 停止按钮 | 新版进度展示更直观 |
| 16 | **面板宽度** | 自适应 | 固定 320px（组件内） + 外层 280px | 宽度不一致 |

### 3.4 Key 面板修改方案

#### P0 - 必须修改

1. **实现虚拟树形结构**
   - 这是**最核心的缺失功能**
   - 需要引入虚拟滚动树组件替代当前的扁平列表
   - 参考 [`KeyListVirtualTree.vue`](AnotherRedisDesktopManager/src/components/KeyListVirtualTree.vue) 的实现思路

   **方案**：使用 `el-tree-v2`（Element Plus 内置虚拟树）或第三方虚拟树组件

   ```tsx
   // key-panel.tsx - 替换列表渲染
   <el-tree-v2
     ref={treeRef}
     data={treeNodes}
     props={{ label: 'name', children: 'children' }}
     height={treeHeight}
     itemSize={22}
     highlight-current
     onNodeClick={handleNodeClick}
     onNodeContextMenu={handleRightClick}
   >
     {{
       default: ({ node, data }) => (
         <span class={ns.e("tree-node")} title={node.label}>
           {!node.isLeaf && <el-icon><FolderOpened /></el-icon>}
           <span>{node.label}</span>
           {!node.isLeaf && (
             <span class={ns.e("tree-count")}>({data.keyCount})</span>
           )}
         </span>
       )
     }}
   </el-tree-v2>
   ```

   **需要的配套实现**：
   - `keysToTree()` 工具函数：将扁平 key 列表转为树形结构（基于 separator）
   - `expandedKeys` 状态管理
   - 树节点排序

2. **统一面板宽度**
   - `key-panel.less` 中 `width: 320px` 与 `index.less` 中 `__key-panel: width: 280px` 不一致
   - 建议：组件内部不设固定宽度，由外层容器控制

   ```less
   // key-panel.less - 移除固定宽度
   .ran-key-panel {
     // width: 320px;  // 移除
     width: 100%;
     height: 100%;
     // ...
   }
   ```

3. **添加右键菜单**
   - 参考 [`KeyListVirtualTree.vue`](AnotherRedisDesktopManager/src/components/KeyListVirtualTree.vue:57) 的右键菜单实现
   - 文件夹右键：多选 / 内存分析 / 加载当前文件夹 / 删除文件夹
   - Key 右键：复制 / 删除 / 多选 / 新标签打开 / 导出

   ```tsx
   // 右键菜单组件
   const renderContextMenu = () => (
     <div
       ref={contextMenuRef}
       class={ns.e("context-menu")}
       style={{
         display: contextMenuVisible.value ? 'block' : 'none',
         left: `${contextMenuPos.x}px`,
         top: `${contextMenuPos.y}px`,
       }}
     >
       {!contextMenuNode.value?.isLeaf ? (
         <ul>
           <li onClick={() => handleMenuAction("multiple_select")}>多选</li>
           <li onClick={() => handleMenuAction("memory_analysis")}>内存分析</li>
           <li onClick={() => handleMenuAction("load_cur_folder")}>加载当前文件夹</li>
           <li onClick={() => handleMenuAction("delete_folder")}>删除文件夹</li>
         </ul>
       ) : (
         <ul>
           <li onClick={() => handleMenuAction("copy")}>复制</li>
           <li onClick={() => handleMenuAction("delete")}>删除</li>
           <li onClick={() => handleMenuAction("multiple_select")}>多选</li>
           <li onClick={() => handleMenuAction("open")}>新标签打开</li>
           <li onClick={() => handleMenuAction("export")}>导出 Key</li>
         </ul>
       )}
     </div>
   );
   ```

4. **添加节点上限保护**
   - 参考 [`KeyListVirtualTree.vue`](AnotherRedisDesktopManager/src/components/KeyListVirtualTree.vue:89) 的 `treeNodesOverflow: 20e4`
   - 超出上限时截断并提示用户

#### P1 - 建议修改

5. **添加键盘导航**
   - 上下箭头选择节点
   - Enter 打开 Key
   - Ctrl+Click 新标签页打开

6. **添加加载更多机制**
   - 当前 SCAN 进度条方案已较优，但建议增加"加载更多"按钮
   - 支持分页加载大量 Key

7. **添加导出功能**
   - 支持批量导出选中的 Key（DUMP + PTTL）
   - 参考 [`KeyListVirtualTree.vue`](AnotherRedisDesktopManager/src/components/KeyListVirtualTree.vue:297) 的 `exportBatch` 方法

8. **优化 Key 项布局**
   - 当前每个 Key 项占用较多垂直空间（checkbox + 名称 + type tag + TTL）
   - 建议在树形模式下简化为单行显示（仅名称），与旧版保持一致

---

## 四、宽度不一致问题汇总

| 位置 | 当前值 | 建议值 |
|------|--------|--------|
| `index.less` `__sidebar` | 260px | 保持（外层控制） |
| `connection-sidebar.less` 根容器 | 240px | 改为 `width: 100%` |
| `index.less` `__key-panel` | 280px | 保持（外层控制） |
| `key-panel.less` 根容器 | 320px | 改为 `width: 100%` |

---

## 五、修改优先级总结

### 连接侧边栏

| 优先级 | 修改项 | 复杂度 |
|--------|--------|--------|
| P0 | 统一宽度（移除组件内固定宽度） | 低 |
| P0 | 添加连接搜索功能 | 低 |
| P0 | 丰富操作菜单（dropdown） | 中 |
| P1 | 添加颜色标记 | 低 |
| P1 | 添加拖拽排序 | 中 |
| P1 | 优化操作按钮为 hover 浮层 | 低 |
| P1 | 添加连接详情 Tooltip | 低 |

### Key 面板

| 优先级 | 修改项 | 复杂度 |
|--------|--------|--------|
| P0 | 统一宽度（移除组件内固定宽度） | 低 |
| P0 | 实现虚拟树形结构 | **高** |
| P0 | 添加右键菜单 | 中 |
| P0 | 添加节点上限保护 | 低 |
| P1 | 添加键盘导航 | 中 |
| P1 | 添加导出功能 | 中 |
| P1 | 优化树形模式下的 Key 项布局 | 低 |
| P1 | 添加加载更多机制 | 中 |
