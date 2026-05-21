# Beekeeper Studio 全面技术分析报告

> 分析对象：`F:\code999\demo\ran-cloud\libs\beekeeper-studio`
> 分析日期：2026-05-22
> 分析目的：评估与 ran-cloud（Tauri 2 + Vue 3 + TSX）项目的集成可行性，提出二次开发建议

## Context

ran-cloud 项目正在构建一个基于 Tauri 2 + Vue 3 + TSX 的桌面开发工具平台（ran-rs-desktop）。项目已有 Redis 桌面管理、Telepresence 网络工具、JSON2TS 转换器等模块。用户希望评估 Beekeeper Studio（位于 `libs/beekeeper-studio`）的数据库管理功能是否可以集成到 ran-cloud 中，并获取详细的实施方案。

本报告覆盖用户要求的 6 个分析维度，并提供了两个可行的集成方案（Sidecar 和纯 Rust）的完整实施细节。报告完成后将导出到项目目录 `docs/beekeeper-studio-tech-analysis.md`。

---

## 一、架构设计分析

### 1.1 技术栈概览

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron | 39.x |
| 前端框架 | Vue 2.7 | Options API 专属 |
| 状态管理 | Vuex 3 | 15+ 模块 |
| 主进程构建 | esbuild | Node platform |
| 渲染进程构建 | Vite + @vitejs/plugin-vue2 | CJS output |
| 打包分发 | electron-builder | 多平台支持 |
| 内部数据库 | TypeORM + better-sqlite3 | SQLite |
| 包管理 | Yarn 1 workspaces | monorepo |

### 1.2 三进程架构

Beekeeper Studio 采用 **Electron 三进程架构**（Main / Utility / Renderer），核心设计是通过 `MessagePort` 建立 Renderer 与 Utility 进程的直接通信通道，绕过 Main 进程，减少 IPC 瓶颈。

```
┌─────────────────────────────────────────────────────┐
│                    Main Process                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ - app 生命周期管理                              │  │
│  │ - BrowserWindow 创建 (frame: false)            │  │
│  │ - 自定义协议 app://、plugin://                  │  │
│  │ - TypeORM 数据库迁移                            │  │
│  │ - 原生菜单 (Menu)                               │  │
│  │ - 自动更新 (electron-updater)                   │  │
│  │ - 电源监控 (powerMonitor)                       │  │
│  │ - UtilityProcess.fork() 创建 Utility 进程      │  │
│  │ - MessageChannelMain 分发 port 对               │  │
│  └───────────────────────────────────────────────┘  │
│         │                          │                 │
│    ipcMain.handle            postMessage(port1/port2)│
│         │                          │                 │
│  ┌──────▼──────┐          ┌───────▼───────────┐     │
│  │  Renderer   │◄────────►│  Utility Process   │     │
│  │  (Vite/Vue2)│ MessagePort │  (esbuild)      │     │
│  │             │          │                     │     │
│  │ - UI 组件    │          │ - BasicDatabaseClient│   │
│  │ - Vuex Store │          │ - 查询执行引擎       │     │
│  │ - $util.send │          │ - SSH 隧道          │     │
│  │ - 插件系统   │          │ - 导入/导出          │     │
│  └─────────────┘          │ - TypeORM (appdb)   │     │
│                            └─────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

**关键文件**：
- 主进程入口：`apps/studio/src-commercial/entrypoints/main.ts`
- Utility 进程入口：`apps/studio/src-commercial/entrypoints/utility.ts`
- Preload 脚本：`apps/studio/src-commercial/entrypoints/preload.ts`
- 渲染进程入口：`apps/studio/src-commercial/entrypoints/renderer.ts`
- Renderer 侧通信客户端：`apps/studio/src/lib/utility/UtilityConnection.ts`

### 1.3 MessagePort 通信机制

这是整个架构最核心的设计模式：

1. **Main 进程** 调用 `electron.utilityProcess.fork()` 创建 Utility 进程
2. **Renderer** 通过 preload 暴露的 `requestPorts()` 发起 IPC 请求
3. **Main 进程** 创建 `MessageChannelMain`（port1 + port2）
4. port1 发送给 Utility 进程，port2 发送给 Renderer 窗口
5. 此后 Renderer 与 Utility **直接通信**，无需经过 Main 进程

消息格式：`{ id: uuid, name: handlerName, args: {...} }`
响应格式：`{ id: uuid, type: 'reply'|'error', data, error }`

### 1.4 构建体系

采用 **双构建器并行** 方案：

| 构建器 | 目标 | 入口 | 输出 |
|--------|------|------|------|
| esbuild | Main/Utility/Preload (Node.js) | 3个 entrypoints | `dist/main.js`, `dist/utility.js`, `dist/preload.js` |
| Vite | Renderer (浏览器) | `index.html` + `App.vue` | `dist/renderer/` |

原生模块（better-sqlite3, oracledb 等）标记为 `external`，不参与打包，运行时动态加载。

---

## 二、模块设计分析

### 2.1 数据库客户端抽象层

这是 BKS 最核心的模块设计，采用经典的 **接口-抽象类-实现类** 三层继承体系：

```
IBasicDatabaseClient (接口)
    │
    ▼
BasicDatabaseClient<RawResultType, Conn> (抽象类, 883行)
    │
    ├── BaseV1DatabaseClient<RawResultType> (简化基类，提供 DDL 默认实现)
    │
    ├── PostgreSQL Client  (64.7 KB)
    ├── MySQL Client       (49.2 KB)
    ├── SQL Server Client  (52.6 KB)
    ├── SQLite Client      (27.2 KB)
    ├── Redis Client       (30.5 KB)
    ├── Redshift Client    (14.8 KB)
    ├── CockroachDB Client (8.3 KB)
    ├── MariaDB Client     (3.0 KB)
    ├── TiDB Client        (wrapper)
    ├── BigQuery Client    (23.4 KB)
    └── Bedrock Client     (10.6 KB)
    │
    └── [商业版 drivers 在 src-commercial/backend/]
        ├── Oracle          (42.9 KB)
        ├── MongoDB         (35.6 KB)
        ├── ClickHouse      (35.0 KB)
        ├── DuckDB          (34.8 KB)
        ├── SurrealDB       (31.3 KB)
        ├── Cassandra       (28.7 KB)
        ├── Firebird        (46.0 KB)
        ├── SQL Anywhere    (44.8 KB)
        ├── Trino           (20.9 KB)
        ├── LibSQL          (5.0 KB)
        └── ScyllaDB        (wrapper)
```

**抽象方法分组**（BasicDatabaseClient 中需要子类实现的方法）：

| 分组 | 方法数 | 说明 |
|------|--------|------|
| 元数据 | 3 | `supportedFeatures()`, `versionString()`, `getBuilder()` |
| Schema 枚举 | 12 | `listTables/Views/Routines/Columns/Triggers/Indexes/Schemas/...` |
| 查询执行 | 5 | `query()`, `executeQuery()`, `listDatabases()`, `getTableProperties()`, ... |
| DDL | 9 | `createDatabase()`, `getTableCreateScript()`, `dropElement()`, ... |
| DML | 7 | `selectTop()`, `selectTopStream()`, `queryStream()`, `duplicateTable()`, ... |
| 内部 | 2 | `rawExecuteQuery()`, `parseTableColumn()` |

**Renderer 侧代理**：`ElectronUtilityConnectionClient`（345行）实现了 `IBasicDatabaseClient` 接口，每个方法都通过 `$util.send('conn/<methodName>', args)` 转发到 Utility 进程。

**关键文件**：
- 接口定义：`apps/studio/src/lib/db/types.ts`
- 抽象基类：`apps/studio/src/lib/db/clients/BasicDatabaseClient.ts`
- 客户端注册表：`apps/studio/src/lib/db/clients/index.ts`
- Renderer 代理：`apps/studio/src/lib/utility/ElectronUtilityConnectionClient.ts`

### 2.2 SQL 编辑器模块

项目同时存在两代 CodeMirror 集成：

| 代际 | 位置 | 版本 | 用途 |
|------|------|------|------|
| 旧版 | `apps/studio/src/components/common/texteditor/` | CM5 | Studio 应用内的 SQL 编辑器 |
| 新版 | `apps/ui-kit/lib/components/sql-text-editor/` | CM6 | UI Kit 共享库，活跃开发 |

新版 CM6 SQL 编辑器功能：

- **SQL 自动补全**：上下文感知，解析 FROM/JOIN 子句中的表别名，延迟加载列信息
- **多语句高亮**：使用 `sql-query-identifier` 拆分 SQL 文本，高亮当前活跃语句
- **SQL 格式化**：集成 `sql-formatter`，支持多种 SQL 方言，Ctrl+Shift+F 触发
- **语法高亮**：自定义 highlight style 映射 lezer 标签到 CSS 类
- **Vim/Emacs 键绑定**：通过 CM6 keymap 扩展支持
- **LSP 集成**：通过 WebSocket 连接外部 Language Server，支持语义 token 和诊断
- **查询引号自动移除**：`removeQueryQuotesExtension()` 扩展
- **方言支持**：StandardSQL, PostgreSQL, MySQL, Cassandra, SQLite, GreengageSQL

### 2.3 数据表格模块

使用 **Tabulator** 数据网格库（fork 版本 `beekeeper-studio/tabulator`），封装在 UI Kit 中：

核心组件：`apps/ui-kit/lib/components/table/Table.vue`

特性：
- **虚拟水平渲染**：`renderHorizontal: "virtual"` 支持大量列
- **Excel 式范围选择**：`selectableRange: true`
- **内联编辑**：`editTriggerEvent: "dblclick"`
- **外键导航**：点击 FK 单元格跳转关联表
- **主键高亮**：CSS class 标识主键列
- **自定义模块**：HeaderSortTabulatorModule, EventBridgeTabulatorModule, ForeignCacheTabulatorModule
- **数据变更追踪**：插入/更新/删除分开追踪，带可视化指示器
- **分页/排序/过滤**：服务端分页，方言感知排序

Studio 侧的 `TableTable.vue`（2000+ 行）提供完整的表格浏览编辑功能。

### 2.4 插件系统

双层架构：

**后端（Utility 进程）**：`PluginManager`
- 插件发现、安装、更新、卸载
- 从 GitHub 仓库获取插件注册表
- 支持模块系统（Module 抽象类 + Hook 机制）

**前端（Renderer）**：`WebPluginManager` + `WebPluginLoader`
- 每个插件视图运行在独立 `<iframe>` 中（沙箱隔离）
- 通过 `window.postMessage` 通信
- 插件 HTML 通过自定义 `plugin://` 协议加载
- 插件 API 提供：数据库查询、Schema 读取、剪贴板、通知、持久存储等

内置插件：
- `@beekeeperstudio/bks-ai-shell` — AI SQL Shell
- `@beekeeperstudio/bks-er-diagram` — ER 图可视化

### 2.5 连接管理

**连接配置类型**（`IConnection` 接口）：
- 支持 23 种数据库类型
- SSH 隧道（ssh2）：支持 agent/密码/密钥文件认证，支持堡垒机跳转
- SSL/TLS：CA/Cert/Key 文件配置
- 驱动特定选项：Redshift、Cassandra、BigQuery、Azure Auth、LibSQL、SurrealDB 等

**连接存储**：TypeORM + SQLite，密码使用 `simple-encryptor` 加密，密钥存储在 `~/.key` 文件。

**连接生命周期**：
1. 用户配置 → Vuex store `connect()` action
2. `$util.send('conn/create')` → Utility 进程
3. `ConnectionProvider.for(config)` → 转换配置 → 创建 `IDbConnectionServer`
4. `server.createConnection(db)` → 实例化对应驱动客户端
5. `connection.connect()` → 建立 DB 连接 + SSH 隧道

### 2.6 查询执行管线

```
[Vue: TabQueryEditor] ─triggerRun()─► [Vuex Store]
       │                                     │
       │                              $util.send('conn/query')
       │                                     │
       ▼                                     ▼
[UtilityConnection] ──MessagePort──► [Utility Process]
  .send(name, args)                      │
       │                          ConnHandlers['conn/query']
       │                                 │
       │                          BasicDatabaseClient.query()
       │                                 │
       │                          CancelableQuery { execute(), cancel() }
       │                                 │
       │◄──── { queryId } ──────────────┘
       │
  $util.send('query/execute', { queryId })
       │
       ▼
[Utility Process] ──► driver.rawQuery() ──► 结果集
       │
       ▼
[ResultTable.vue] ──► Tabulator 渲染
```

**两阶段查询设计**：先创建查询获取 `queryId`，再调用 `execute()` 执行或 `cancel()` 取消。这允许长时间查询的取消操作。

---

## 三、开发规范分析

### 3.1 Vue 组件规范

- **仅使用 Options API**：全部组件使用 Vue 2 Options API（`data()`, `methods`, `computed`, `watch`），无 Composition API
- **SFC 格式**：所有组件为 `.vue` 单文件组件，非 TSX
- **Mixin 模式**：大量使用 Vue 2 mixins（如 `data_mutators.ts`, `jsonFriendlyMutators.ts`）
- **全局事件系统**：通过 `$root.$emit` / `$root.$on` 使用 `AppEvent` 枚举进行跨组件通信
- **无 i18n**：应用内所有文本硬编码英文，无国际化支持

### 3.2 TypeScript 使用

- **宽松模式**：`tsconfig.json` 未启用 `strict` 模式
- **类型推断**：大量使用 `any` 类型，类型安全程度较低
- **装饰器**：TypeORM 实体使用 `@Entity`, `@Column` 等装饰器
- **混合 JS/TS**：项目中同时存在 `.js` 和 `.ts` 文件

### 3.3 代码风格

- **ESLint**：配置了大量禁用规则（`@typescript-eslint/no-explicit-any: off` 等）
- **命名约定**：文件 kebab-case，组件 PascalCase
- **目录结构**：功能模块化分组（components/ 下按功能域分目录）
- **共享库**：UI Kit 独立包 `@beekeeperstudio/ui-kit`，通过 workspace 引用

### 3.4 测试规范

三层测试架构：

| 层级 | 框架 | 配置文件 |
|------|------|----------|
| 单元测试 | Jest + jsdom | `apps/studio/jest.config.js` |
| 集成测试 | Jest + node env | `apps/studio/jest.integration.config.js` |
| E2E 测试 | Playwright | `apps/studio/playwright.config.ts` |
| UI Kit 测试 | Vitest + happy-dom | `apps/ui-kit/vitest.config.js` |

E2E 测试采用 Page Object Model 模式，组织在 `e2e/pageActions/` 和 `e2e/pageComponents/` 中。

---

## 四、集成可行性评估（ran-cloud / Tauri 2）

### 4.1 架构兼容性对比

| 维度 | Beekeeper Studio | ran-cloud | 兼容性 |
|------|-----------------|-----------|--------|
| 桌面框架 | Electron 39 | Tauri 2 | 不兼容 |
| 前端框架 | Vue 2 Options API + SFC | Vue 3 Composition API + TSX | 需迁移 |
| 状态管理 | Vuex 3 | 无（ref/reactive） | 需迁移 |
| UI 库 | 自定义 + Tabulator | Element Plus | 不一致 |
| 进程模型 | 三进程（Main/Utility/Renderer） | 二进程（Rust Core/WebView） | 需重设计 |
| IPC 机制 | Electron MessagePort | Tauri Commands/Events | 需重写 |

### 4.2 关键阻塞项

#### 阻塞项 1：Utility Process 架构（严重度：高）

Electron 的 `utilityProcess.fork()` 是专有 API，Tauri 没有等价概念。所有数据库操作（23种数据库驱动）运行在 Utility 进程中。

**迁移方案**：
- 方案 A：Tauri sidecar 模式 — 启动独立 Node.js 进程，通过 stdin/stdout 或 TCP 通信
- 方案 B：Rust 原生实现 — 用 Rust 重写数据库驱动层（使用 `sqlx`、`rusqlite`、`tokio-postgres` 等）
- 方案 C：仅复用 UI Kit — 仅提取 `@beekeeperstudio/ui-kit` 的前端组件

#### 阻塞项 2：C++ 原生模块（严重度：高）

以下数据库驱动依赖 C++ 编译的原生模块，无法在 Tauri WebView 中直接运行：

| 模块 | 用途 | 替代方案 |
|------|------|----------|
| `better-sqlite3` | SQLite（内部DB + 用户DB） | `rusqlite` (Rust) 或 `sql.js` (WASM) |
| `ssh2` | SSH 隧道/端口转发 | `russh` (Rust) |
| `oracledb` | Oracle 数据库 | Oracle Instant Client + Rust binding |
| `node-firebird` | Firebird | HTTP API 或 Rust binding |
| `@duckdb/node-api` | DuckDB | DuckDB WASM 或 Rust binding |
| `sqlanywhere` | SQL Anywhere | 无直接替代 |

#### 阻塞项 3：SSH 隧道（严重度：高）

BKS 的 SSH 隧道功能（`src/vendor/node-ssh-forward/` + `src/lib/db/tunnel.ts`）基于 `ssh2` 库实现：
- 支持本地端口转发（动态分配本地端口）
- 支持 SSH Agent / 密码 / 密钥文件认证
- 支持堡垒机跳板链路
- 读取 `~/.ssh/config` 配置

迁移需要 Rust SSH 库（如 `russh`）实现完整的端口转发功能。

#### 阻塞项 4：TypeORM + better-sqlite3 内部数据库（严重度：中）

BKS 使用 TypeORM 管理 21 个实体（连接配置、查询历史、设置等），底层依赖 `better-sqlite3`。

**迁移方案**：
- 使用 Tauri 的 `sql` 插件 + SQLite
- 或使用 Rust 侧的 `rusqlite` + `diesel`/`sea-orm`

### 4.3 可直接复用的模块

| 模块 | 复用难度 | 说明 |
|------|----------|------|
| `IBasicDatabaseClient` 接口定义 | 低 | 纯 TypeScript 接口，可直接移植 |
| 连接配置类型（`IConnection` 等） | 低 | 纯 TypeScript 类型 |
| SQL 解析/格式化逻辑 | 低 | 纯 JS 库（`sql-query-identifier`, `sql-formatter`） |
| UI Kit CM6 编辑器组件 | 中 | 需适配 Vue 3，去除 Web Component 封装 |
| UI Kit Entity List 组件 | 中 | 需适配 Vue 3 + 替换 Tabulator |
| 插件系统架构 | 高 | 深度依赖 Electron iframe + 自定义协议 |
| Tabulator 数据网格 | 中 | 库本身框架无关，但 Vue 封装需重写 |

### 4.4 综合评估

**完整集成（将 BKS 作为 Tauri 应用重建）**：工作量极大，需要：
1. 用 Rust 重写整个 Utility Process 层（数据库驱动 + SSH + 文件操作）
2. Vue 2 → Vue 3 全面迁移（SFC → TSX）
3. Vuex → 响应式状态管理迁移
4. Element Plus 替换自定义 UI 组件
5. TypeORM → Rust ORM 迁移

**部分集成（复用核心逻辑）**：可行，建议提取：
1. 数据库客户端抽象接口和驱动逻辑（TypeScript）
2. 连接配置类型系统
3. SQL 编辑器扩展（CM6）

**Sidecar 模式（最小侵入）**：最务实的方案
1. 将 BKS 的 Utility Process 改造为独立 Node.js 服务
2. Tauri 通过 sidecar 启动该服务
3. 通过 TCP/WebSocket 通信
4. 仅重写前端 UI（Vue 3 + TSX + Element Plus）

---

## 五、修改需求识别

如要将 BKS 的数据库管理功能集成到 ran-cloud 项目中，需要以下修改：

### 5.1 必须修改

| 编号 | 修改项 | 涉及文件 | 说明 |
|------|--------|----------|------|
| M1 | 进程架构重设计 | `src-commercial/entrypoints/*` | 将 Utility Process 改为 sidecar 或 Tauri Command |
| M2 | IPC 通信层替换 | `UtilityConnection.ts`, `ElectronUtilityConnectionClient.ts` | MessagePort → Tauri Commands/Events 或 WebSocket |
| M3 | Vue 2 → Vue 3 迁移 | 所有 `.vue` 文件 | Options API → Composition API, SFC → TSX |
| M4 | Vuex → reactive 迁移 | `src/store/` 全部 | 模块化 ref/reactive 替代 |
| M5 | 原生模块替换 | `better-sqlite3`, `ssh2` 等 | Rust 侧替代或 sidecar |
| M6 | Electron API 剥离 | `NativeWrapper.ts`, `WindowBuilder.ts`, preload | BrowserWindow → Tauri Window |
| M7 | 构建体系替换 | `esbuild.mjs`, `vite.config.mjs`, `electron-builder-config.js` | 改为 Rsbuild + Tauri CLI |

### 5.2 建议修改

| 编号 | 修改项 | 说明 |
|------|--------|------|
| R1 | TypeORM → 轻量存储 | 内部存储改用 Tauri sql 插件或 Rust SQLite |
| R2 | Tabulator → Element Plus Table | 统一 UI 库 |
| R3 | 加密方案替换 | `simple-encryptor` → Tauri 侧加密 |
| R4 | 插件系统简化 | iframe 插件 → Tauri WebView 插件或取消插件系统 |
| R5 | 全局事件替换 | `$root.$emit/$on` → provide/inject 或 mitt |
| R6 | TypeScript strict 模式 | 启用严格类型检查 |

### 5.3 可选修改

| 编号 | 修改项 | 说明 |
|------|--------|------|
| O1 | i18n 国际化 | 添加多语言支持 |
| O2 | 测试框架迁移 | Jest/Vitest/Playwright 保持或调整 |
| O3 | UI Kit 提取发布 | 将通用组件提取为独立 npm 包 |

---

## 六、二次开发建议

### 6.1 推荐方案：Sidecar + Vue 3 重写前端

这是**最务实**的集成路径，既利用了 BKS 成熟的数据库驱动，又契合 ran-cloud 的技术栈。

#### 阶段 1：Sidecar 服务端改造

**目标**：将 BKS Utility Process 改造为独立 Node.js HTTP/WebSocket 服务

**实施步骤**：
1. 创建 `ran-rs-desktop/src-tauri/sidecars/database-service/` 目录
2. 从 `utility.ts` 提取 handler 注册逻辑，改造为 Express/Fastify HTTP 服务
3. 保持 `BasicDatabaseClient` 及所有数据库驱动不变
4. 将 `MessagePort` 通信改为 HTTP REST API 或 WebSocket
5. TypeORM + better-sqlite3 保持不变（在 Node.js 环境中运行）
6. 在 Tauri 配置中注册 sidecar，随应用自动启动

**通信协议设计**：
```
HTTP POST /api/conn/create    → 创建连接
HTTP POST /api/conn/query     → 创建查询
HTTP POST /api/query/execute  → 执行查询
HTTP POST /api/query/cancel   → 取消查询
WebSocket /ws/events          → 实时事件（查询进度、通知等）
```

#### 阶段 2：Vue 3 前端重写

**目标**：用 Vue 3 + TSX + Element Plus 重写数据库管理界面

**目录结构建议**：
```
src/modules/database/
├── types/
│   ├── connection.ts          # IConnection 等类型（从 BKS 移植）
│   ├── query.ts               # 查询相关类型
│   └── table.ts               # 表/列/索引等元数据类型
├── services/
│   ├── db-client.ts           # 重新实现 IBasicDatabaseClient（通过 HTTP 调用 sidecar）
│   ├── connection-manager.ts  # 连接生命周期管理
│   └── query-runner.ts        # 查询执行管线
├── components/
│   ├── connection-panel.tsx   # 连接管理界面
│   ├── sql-editor.tsx         # SQL 编辑器（Monaco Editor 或 CM6）
│   ├── query-result.tsx       # 查询结果展示（Element Plus Table）
│   ├── table-browser.tsx      # 表结构浏览
│   └── table-editor.tsx       # 内联数据编辑
└── index.ts
```

#### 阶段 3：核心功能实现优先级

| 优先级 | 功能 | 复杂度 | 依赖 |
|--------|------|--------|------|
| P0 | 连接管理（MySQL/PostgreSQL/SQLite） | 中 | sidecar + 连接面板 |
| P0 | SQL 编辑器 + 查询执行 | 中 | SQL 编辑器组件 |
| P0 | 查询结果展示 | 中 | 数据表格组件 |
| P1 | 表结构浏览 | 低 | Schema 枚举 API |
| P1 | 内联数据编辑 | 高 | 表格编辑 + 变更追踪 |
| P2 | SSH 隧道支持 | 高 | sidecar SSH 功能 |
| P2 | 数据导入/导出 | 中 | sidecar 导出功能 |
| P3 | SQL 自动补全 | 中 | CM6 或 Monaco 扩展 |
| P3 | ER 图可视化 | 低 | 插件或独立模块 |
| P4 | 更多数据库驱动 | 低 | sidecar 扩展 |

### 6.2 技术选型建议

| 组件 | 当前（BKS） | 建议（ran-cloud） | 理由 |
|------|-------------|-------------------|------|
| SQL 编辑器 | CodeMirror 6 (UI Kit) | Monaco Editor | 已有 Monaco 集成经验，统一技术栈 |
| 数据表格 | Tabulator (fork) | Element Plus Table + 虚拟滚动 | 统一 UI 库 |
| 状态管理 | Vuex 3 | Vue 3 ref/reactive | 匹配 ran-cloud 模式 |
| 组件风格 | Vue 2 SFC | Vue 3 TSX | 匹配 ran-cloud 模式 |
| CSS 方案 | 自定义 CSS | BEM + Less | 匹配 ran-cloud 模式 |
| 进程通信 | Electron MessagePort | HTTP REST + WebSocket | sidecar 通信 |
| 内部存储 | TypeORM + better-sqlite3 | Tauri sql 插件 | 轻量化 |

### 6.3 风险与注意事项

1. **sidecar 进程管理**：需处理 sidecar 崩溃重启、端口冲突、生命周期同步等问题
2. **安全性**：sidecar HTTP 服务需要限制监听地址（localhost only），防止远程访问
3. **性能**：HTTP 通信比 MessagePort 多一层序列化/反序列化开销，大结果集需要分页/流式传输
4. **打包体积**：sidecar 包含 Node.js runtime + 所有数据库驱动，会显著增加安装包大小
5. **交叉编译**：sidecar 的原生模块（better-sqlite3 等）需要为每个目标平台编译
6. **许可证**：BKS 使用 MIT + 商业双许可证，Ultimate 版功能有商业限制

### 6.4 方案 A：Sidecar 模式（推荐快速落地）

#### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                  ran-cloud Tauri 2 App                    │
│                                                          │
│  ┌──────────────────┐   ┌─────────────────────────────┐ │
│  │   Rust Backend    │   │    Vue 3 Frontend (TSX)     │ │
│  │                   │   │                             │ │
│  │  SidecarManager  │   │  modules/db-manager/        │ │
│  │  (进程生命周期)   │   │   services/bks-client.ts    │ │
│  │                   │   │   stores/db-store.ts        │ │
│  │  RedisDesktop    │   │   components/               │ │
│  │  Telepresence    │   │   types/                    │ │
│  └──────┬───────────┘   └──────────┬──────────────────┘ │
│         │ spawn/manage              │ HTTP + WS          │
│         │                           │ (localhost)        │
│  ┌──────▼───────────────────────────▼─────────────────┐ │
│  │            BKS Sidecar (Node.js)                    │ │
│  │                                                      │ │
│  │  Fastify HTTP server + WebSocket                     │ │
│  │  ┌────────────────────────────────────────────────┐ │ │
│  │  │  BKS Handler Registry (复用原始代码)            │ │ │
│  │  │  ConnHandlers, QueryHandlers, ExportHandlers.. │ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  │  Session State per sId                               │ │
│  │  TypeORM + better-sqlite3 (连接配置存储)             │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

#### Sidecar 目录结构

```
libs/bks-sidecar/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                      # 入口，替代 BKS utility.ts
│   ├── server.ts                     # Fastify 服务配置
│   ├── auth.ts                       # Token 认证中间件
│   ├── session.ts                    # 会话管理（替代 MessagePort state）
│   ├── routes/
│   │   ├── index.ts                  # 路由注册
│   │   ├── connection-routes.ts      # 连接 CRUD + 生命周期
│   │   ├── schema-routes.ts          # Schema 枚举
│   │   ├── query-routes.ts           # 查询执行
│   │   ├── data-routes.ts            # 数据操作（CRUD on table data）
│   │   ├── structure-routes.ts       # DDL（create/alter/drop）
│   │   ├── export-routes.ts          # 导出操作
│   │   └── admin-routes.ts           # 健康检查、关闭
│   ├── ws/
│   │   ├── websocket-manager.ts      # WebSocket 连接管理
│   │   └── event-bridge.ts           # BKS 事件 → WS 桥接
│   ├── adapters/
│   │   ├── handler-adapter.ts        # BKS handlers → Fastify 路由适配
│   │   └── state-adapter.ts          # BKS State → HTTP session 模型
│   └── lifecycle/
│       ├── port-discovery.ts         # 端口发现/写入
│       └── signal-handlers.ts        # 优雅关闭
├── scripts/
│   └── build.ts                      # 多平台构建
└── README.md
```

#### 入口设计

入口 `src/index.ts` 替代 BKS 的 `utility.ts`：

- 解析 CLI 参数：`--port`（默认 0，OS 自动分配）、`--token`（Tauri 生成的认证令牌）
- 初始化 Fastify 服务，禁用 CORS，仅绑定 `127.0.0.1`
- 注册认证中间件，校验 `Authorization: Bearer <token>`
- 注册所有 REST 路由 `/api/v1/`
- 注册 WebSocket 端点 `/ws`
- 写入端口到临时文件，通过 stdout 发送就绪信号：`{"ready":true,"port":12345}`

#### REST API 完整设计

**Admin 端点**（无需会话）：
- `GET /api/v1/health` → `{ status: "ok", uptime, connections }`
- `POST /api/v1/shutdown` → 优雅关闭

**会话管理**：
- `POST /api/v1/sessions` → `{ sId: "uuid" }`
- `DELETE /api/v1/sessions/:sId` → 销毁会话，断开所有连接

**连接生命周期**：
- `POST /api/v1/sessions/:sId/connections/create` — 创建并连接（接收 `IConnection` 配置）
- `POST /api/v1/sessions/:sId/connections/test` — 测试连接（不持久化）
- `POST /api/v1/sessions/:sId/connections/change-database` — 切换数据库
- `DELETE /api/v1/sessions/:sId/connections` — 断开连接

**Schema 枚举**（需要活跃连接）：
- `GET /api/v1/sessions/:sId/schemas?filter=...`
- `GET /api/v1/sessions/:sId/databases?filter=...`
- `GET /api/v1/sessions/:sId/tables?filter=...`
- `GET /api/v1/sessions/:sId/views?filter=...`
- `GET /api/v1/sessions/:sId/routines?filter=...`
- `GET /api/v1/sessions/:sId/tables/:table/columns?schema=...`
- `GET /api/v1/sessions/:sId/tables/:table/indexes?schema=...`
- `GET /api/v1/sessions/:sId/tables/:table/triggers?schema=...`
- `GET /api/v1/sessions/:sId/tables/:table/keys?schema=...`
- `GET /api/v1/sessions/:sId/tables/:table/properties?schema=...`

**查询执行**（两阶段设计，保持 BKS 的 CancelableQuery 模式）：
- `POST /api/v1/sessions/:sId/query` → `{ queryId }` — 创建查询
- `POST /api/v1/sessions/:sId/query/:queryId/execute` → 执行并返回结果
- `POST /api/v1/sessions/:sId/query/:queryId/cancel` → 取消查询
- `POST /api/v1/sessions/:sId/execute` — 同步执行，直接返回完整结果

**数据操作**：
- `POST /api/v1/sessions/:sId/tables/:table/select-top` — 分页查询
- `POST /api/v1/sessions/:sId/changes` — 批量应用变更（insert/update/delete）
- `GET /api/v1/sessions/:sId/tables/:table/length?schema=...`

**DDL 操作**：
- `GET /api/v1/sessions/:sId/tables/:table/create-script?schema=...` — 获取建表语句
- `DELETE /api/v1/sessions/:sId/elements/:name?type=...&schema=...` — DROP
- `POST /api/v1/sessions/:sId/elements/:name/truncate?type=...` — TRUNCATE

**统一响应格式**：
```json
{ "ok": true, "data": <result> }
{ "ok": false, "error": { "code": "CONNECTION_ERROR", "message": "..." } }
```

#### WebSocket 协议

端点：`ws://127.0.0.1:{port}/ws?token={auth_token}`

服务端 → 客户端：
- `{ type: "queryResult", queryId, data, hasMore }`
- `{ type: "queryError", queryId, error }`
- `{ type: "exportProgress", exportId, percentComplete }`

客户端 → 服务端：
- `{ type: "queryCancel", queryId }`
- `{ type: "ping" }`

#### Rust 侧 SidecarManager

在 `ran-rs-desktop/src-tauri/src/modules/sidecar/mod.rs` 中实现：

```rust
pub struct SidecarManager {
    process: Mutex<Option<Child>>,           // Node.js 子进程
    port: AtomicU16,                         // 发现的端口号
    auth_token: String,                      // 生成的认证令牌
    base_url: RwLock<String>,                // http://127.0.0.1:{port}
    status: watch::Sender<SidecarStatus>,    // Starting | Ready | Failed | Stopped
}
```

- **启动**：在 Tauri `setup` 中 spawn sidecar 进程，传入 `--port 0 --token <random>`
- **端口发现**：读取 stdout 的 `{"ready":true,"port":N}` 行
- **健康监控**：每 30s 调用 `GET /health`
- **崩溃恢复**：检测进程退出后自动重启，最多 3 次
- **关闭**：应用退出时先发 `POST /shutdown`，再 kill 进程

进程生命周期状态机：
```
[Spawning] → [Waiting Ready] → [Ready] → [App Close]
                 ↓ timeout          ↓ health fail
              [Failed]          [Recovering]
                 ↓ 3 retries        ↓
              [Error]          [Ready]
```

#### lib.rs 集成变更

```rust
// 新增注册
pub mod sidecar;

// setup 中：
let sidecar = Arc::new(SidecarManager::new());
sidecar.start().await?;
app.manage(sidecar);

// invoke_handler 新增：
sidecar_status,
sidecar_restart,
```

#### 前端模块结构

```
src/modules/db-manager/
├── index.tsx                           # 主页面
├── index.less                          # 样式
├── types/
│   ├── connection.ts                   # IConnection 类型（简化版 BKS）
│   ├── schema.ts                       # Table, Column, Index 类型
│   ├── query.ts                        # 查询结果类型
│   └── index.ts
├── services/
│   ├── bks-client.ts                   # Sidecar HTTP 客户端
│   ├── bks-websocket.ts               # WebSocket 管理
│   └── sidecar-bridge.ts              # Tauri sidecar 状态桥接
├── stores/
│   ├── db-connection-store.ts         # 连接 CRUD + 活跃连接状态
│   ├── db-schema-store.ts             # Schema 树状态
│   └── db-query-store.ts             # 查询标签页、结果、执行状态
└── components/
    ├── connection-sidebar.tsx          # 连接列表 + 创建/编辑表单
    ├── schema-tree.tsx                # 数据库/表/列树浏览
    ├── query-editor-tab.tsx           # SQL 编辑器 + 结果面板
    ├── table-data-tab.tsx             # 表数据浏览（分页 + 内联编辑）
    └── status-bar.tsx                # 连接信息 + 查询统计
```

`bks-client.ts` 核心方法（模式参考现有 `redis-commands.ts`）：

- `bksSessionCreate(): Promise<string>` — 返回 sId
- `bksConnectionCreate(sId, config): Promise<void>` — 创建连接
- `bksConnectionTest(sId, config): Promise<void>` — 测试连接
- `bksListTables(sId, filter?): Promise<TableOrView[]>` — 列出表
- `bksExecuteQuery(sId, sql): Promise<NgQueryResult[]>` — 执行查询
- `bksSelectTop(sId, table, offset, limit): Promise<TableResult>` — 分页查询
- `bksApplyChanges(sId, changes): Promise<TableUpdateResult[]>` — 应用变更

#### 安全设计

- Token 认证：Tauri 生成 256-bit 随机令牌，通过 CLI 参数传递，永不写入磁盘
- 仅绑定 localhost（`127.0.0.1`），无网络暴露
- 限流：100 req/s per connection
- 请求体大小限制：10MB

#### 构建与打包

- 使用 **Node.js SEA（Single Executable Application）** 或 **pkg** 打包为独立可执行文件
- Phase 1 仅支持纯 JS 驱动（pg, mysql2, tedious/mssql, better-sqlite3）
- 通过 `tauri.conf.json` 的 `bundle.resources` 打包 sidecar 二进制
- 开发模式：独立启动 sidecar（`npm run sidecar:dev`），固定端口 9876

#### 实施阶段

| 阶段 | 内容 | 关键产出 |
|------|------|----------|
| Phase 1 | Sidecar 骨架 + 连接管理 | Fastify 服务 + 连接创建/测试/断开路由 |
| Phase 2 | Tauri 集成 | SidecarManager + 进程生命周期 + 命令注册 |
| Phase 3 | 前端模块 | 连接面板 + Schema 浏览器 + 查询编辑器 + 结果表格 |
| Phase 4 | 扩展功能 | 导入/导出、DDL、事务、SSH 隧道 |

#### 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| BKS handler 耦合 Electron | handler 仅依赖 `state(sId)` 获取 DB 访问，不直接调用 Electron API |
| 原生模块兼容性 | Phase 1 聚焦纯 JS 驱动，原生模块作为可选依赖 |
| Sidecar 崩溃 | Rust 侧自动检测重启 + 前端重连 UI |
| 二进制体积 | esbuild tree-shaking 排除未用驱动，目标 < 50MB |
| 端口冲突 | 使用 port 0（OS 分配）+ 文件发现 |

---

### 6.5 方案 B：纯 Rust 后端（推荐长期方案）

#### 整体架构

```
┌──────────────────────────────────────────────────────┐
│                ran-cloud Tauri 2 App                  │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │              Rust Backend                         │ │
│  │                                                    │ │
│  │  DatabaseConnectionManager                        │ │
│  │    ├── DashMap<String, Arc<dyn DatabaseClient>>   │ │
│  │    │     ├── PostgresClient  (sqlx::PgPool)       │ │
│  │    │     ├── MySqlClient     (sqlx::MySqlPool)    │ │
│  │    │     ├── SqliteClient    (sqlx::SqlitePool)   │ │
│  │    │     └── SqlServerClient (tiberius + bb8)     │ │
│  │    ├── SshTunnelManager  (ssh2 / russh)           │ │
│  │    └── CancelTokens    (DashMap<String, Token>)   │ │
│  │                                                    │ │
│  │  Tauri Commands ←───────→ Vue 3 Frontend          │ │
│  │  (invoke / events)       (TSX + Element Plus)     │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

#### Rust Crate 选型

| 数据库 | Crate | 理由 |
|--------|-------|------|
| PostgreSQL | `sqlx` (postgres feature) | 内置连接池、编译时查询检查、统一 Row API |
| MySQL | `sqlx` (mysql feature) | 与 PostgreSQL 共享 Row trait，统一 row_mapper |
| SQLite | `sqlx` (sqlite feature) | 异步 API（rusqlite 是同步的，需 spawn_blocking） |
| SQL Server | `tiberius` | 唯一成熟的 Rust TDS 客户端 |
| 连接池 | sqlx 内置 (PgPool/MySqlPool/SqlitePool) | 无需额外 crate |
| SQL Server 池 | `bb8` + 自定义 tiberius wrapper | sqlx 不支持 SQL Server |
| SSH 隧道 | `ssh2`（已有）/ 远期 `russh` | ssh2 已集成，russh 为纯 Rust 方案 |

**Cargo.toml 新增依赖**：

```toml
# === Database Drivers ===
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "mysql", "sqlite"] }
tiberius = { version = "0.12", features = ["tds73", "rustls"] }
tokio-util = { version = "0.7", features = ["compat"] }

# === Connection Pool (for tiberius) ===
bb8 = "0.9"

# === Date/Time ===
chrono = { version = "0.4", features = ["serde"] }

# === URL Parsing ===
url = "2"

# === Futures ===
futures = "0.3"
```

#### 核心 Trait 设计

```rust
// src-tauri/src/modules/database/shared/traits.rs

#[async_trait]
pub trait DatabaseClient: Send + Sync {
    // === 元数据 ===
    async fn supported_features(&self) -> AppResult<SupportedFeatures>;
    async fn version_string(&self) -> AppResult<String>;
    async fn default_schema(&self) -> AppResult<Option<String>>;

    // === 连接生命周期 ===
    async fn connect(&mut self) -> AppResult<()>;
    async fn disconnect(&mut self) -> AppResult<()>;
    async fn is_connected(&self) -> AppResult<bool>;

    // === Schema 枚举 ===
    async fn list_databases(&self, filter: Option<DatabaseFilter>) -> AppResult<Vec<String>>;
    async fn list_schemas(&self, filter: Option<SchemaFilter>) -> AppResult<Vec<String>>;
    async fn list_tables(&self, filter: Option<FilterOptions>) -> AppResult<Vec<TableOrView>>;
    async fn list_views(&self, filter: Option<FilterOptions>) -> AppResult<Vec<TableOrView>>;
    async fn list_routines(&self, filter: Option<FilterOptions>) -> AppResult<Vec<Routine>>;
    async fn list_table_columns(&self, table: &str, schema: Option<&str>) -> AppResult<Vec<TableColumn>>;
    async fn list_table_indexes(&self, table: &str, schema: Option<&str>) -> AppResult<Vec<TableIndex>>;
    async fn list_table_triggers(&self, table: &str, schema: Option<&str>) -> AppResult<Vec<TableTrigger>>;
    async fn get_primary_keys(&self, table: &str, schema: Option<&str>) -> AppResult<Vec<PrimaryKeyColumn>>;
    async fn get_table_properties(&self, table: &str, schema: Option<&str>) -> AppResult<Option<TableProperties>>;

    // === 查询执行 ===
    async fn execute_query(&self, sql: &str) -> AppResult<Vec<QueryResult>>;
    async fn get_table_length(&self, table: &str, schema: Option<&str>) -> AppResult<u64>;
    async fn select_top(&self, params: SelectTopParams) -> AppResult<TableResult>;

    // === DDL ===
    async fn get_table_create_script(&self, table: &str, schema: Option<&str>) -> AppResult<String>;
    async fn drop_element(&self, name: &str, element_type: DatabaseElement, schema: Option<&str>) -> AppResult<()>;
    async fn truncate_element(&self, name: &str, element_type: DatabaseElement, schema: Option<&str>) -> AppResult<()>;

    // === DML ===
    async fn apply_changes(&self, changes: TableChanges) -> AppResult<Vec<QueryResult>>;

    // === 工具 ===
    fn wrap_identifier(&self, value: &str) -> String;
}
```

约 25 个方法（BKS 有 ~40 个，已精简掉导入/导出回调、驱动特定方法等）。

#### AppError 扩展

在 `shared/error.rs` 中新增：

```rust
#[error("数据库错误: {0}")]
Database(String),

#[error("查询超时: {0}")]
QueryTimeout(String),

#[error("连接池错误: {0}")]
Pool(String),
```

#### 类型标准化策略

所有数据库结果统一为 `serde_json::Value`（每行 = `Map<String, Value>`）：

```
Driver Row (sqlx::Row / tiberius::Row)
    ↓ row_to_json()
serde_json::Value
    ↓ Tauri IPC (原生 JSON 支持)
Vue 3 Frontend
```

映射规则：
- NULL → `Value::Null`
- 整数 → `Value::Number`
- 浮点 → `Value::Number(from_f64)`
- 字符串 → `Value::String`
- 二进制 → Base64 `Value::String`
- 时间戳 → ISO 8601 `Value::String`
- 布尔 → `Value::Bool`
- PostgreSQL 数组 → `Value::Array`

#### Rust 模块目录结构

```
src-tauri/src/modules/database/
├── mod.rs                          # 模块入口、setup()
├── shared/
│   ├── mod.rs
│   ├── traits.rs                   # DatabaseClient trait
│   ├── models.rs                   # 共享类型（QueryResult, TableOrView, etc.）
│   ├── error.rs                    # 数据库错误辅助
│   ├── change_builder.rs           # ChangeBuilder 基础 trait
│   └── row_mapper.rs               # sqlx Row → serde_json::Value 工具
├── connection/
│   ├── mod.rs
│   ├── models.rs                   # DatabaseConnectionConfig, ConnectionInfo
│   ├── commands.rs                 # Tauri 命令：连接 CRUD
│   └── service.rs                  # DatabaseConnectionManager
├── query/
│   ├── mod.rs
│   ├── models.rs                   # QueryRequest, StreamChunk
│   ├── commands.rs                 # db_query_execute, db_query_start, db_query_cancel
│   └── service.rs                  # 查询执行、流式传输、取消
├── schema/
│   ├── mod.rs
│   ├── commands.rs                 # db_list_tables, db_list_columns 等
│   └── service.rs                  # Schema 枚举分发
├── data/
│   ├── mod.rs
│   ├── models.rs                   # TableChanges, SelectTopParams
│   ├── commands.rs                 # db_apply_changes, db_select_top 等
│   └── service.rs                  # DML 操作
├── drivers/
│   ├── mod.rs                      # 驱动注册表、工厂函数
│   ├── postgresql/
│   │   ├── mod.rs
│   │   ├── client.rs               # PostgresClient impl DatabaseClient
│   │   ├── change_builder.rs       # PostgreSQL DDL 生成
│   │   └── queries.rs              # Schema 内省静态 SQL
│   ├── mysql/
│   │   ├── mod.rs
│   │   ├── client.rs               # MySqlClient impl DatabaseClient
│   │   ├── change_builder.rs
│   │   └── queries.rs
│   ├── sqlite/
│   │   ├── mod.rs
│   │   ├── client.rs               # SqliteClient impl DatabaseClient
│   │   ├── change_builder.rs
│   │   └── queries.rs
│   └── sqlserver/
│       ├── mod.rs
│       ├── client.rs               # SqlServerClient impl DatabaseClient
│       ├── change_builder.rs
│       └── queries.rs
└── storage/
    ├── mod.rs
    ├── models.rs                   # 保存的连接、文件夹结构
    ├── commands.rs                 # db_storage_load/save/delete
    └── service.rs                  # JSON 文件持久化（tauri-plugin-store）
```

#### DatabaseConnectionManager

```rust
pub struct DatabaseConnectionManager {
    clients: DashMap<String, Arc<dyn DatabaseClient>>,    // 活跃的数据库客户端
    configs: RwLock<HashMap<String, DatabaseConnectionConfig>>,  // 连接配置
    running_queries: DashMap<String, JoinHandle<()>>,     // 运行中的查询任务
    cancel_tokens: DashMap<String, CancellationToken>,    // 取消令牌
    app_handle: RwLock<Option<AppHandle>>,                // Tauri 句柄
    tunnel_manager: SshTunnelManager,                     // SSH 隧道（复用现有）
}
```

- 注册方式：`app.manage(Arc::new(DatabaseConnectionManager::new()))`
- 与 `RedisConnectionManager` 完全相同的模式

#### 连接配置类型

```rust
pub struct DatabaseConnectionConfig {
    pub id: String,
    pub name: String,
    pub connection_type: DatabaseType,     // PostgreSQL | MySQL | SQLite | SqlServer
    pub host: Option<String>,
    pub port: Option<u16>,
    pub user: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    pub schema: Option<String>,
    pub options: Option<DatabaseOptions>,  // 驱动特定选项
    pub ssh_tunnel: Option<SshTunnelConfig>,
    pub ssl_mode: Option<SslMode>,
    pub connection_timeout: u64,
    pub query_timeout: u64,
    pub readonly: bool,
}
```

#### 驱动工厂

```rust
pub fn create_client(config: &DatabaseConnectionConfig, host: &str, port: u16)
    -> AppResult<Box<dyn DatabaseClient>>
{
    match config.connection_type {
        DatabaseType::PostgreSQL => Ok(Box::new(PostgresClient::new(config, host, port)?)),
        DatabaseType::MySQL => Ok(Box::new(MySqlClient::new(config, host, port)?)),
        DatabaseType::SQLite => Ok(Box::new(SqliteClient::new(config)?)),
        DatabaseType::SqlServer => Ok(Box::new(SqlServerClient::new(config, host, port)?)),
    }
}
```

#### 流式查询架构

```
Frontend → db_query_start(conn_id, sql, query_id, chunk_size)
    ↓
Backend spawns tokio task with CancellationToken
    ↓
Task reads rows via sqlx::fetch() stream
    ↓ (每 chunk_size 行)
emit "database:query:chunk:{query_id}" → Frontend
    ↓ (完成)
emit "database:query:complete:{query_id}" → Frontend
    ↓ (用户取消)
Frontend → db_query_cancel(query_id)
    → CancellationToken.cancel() → stream reader stops
```

#### Tauri 命令列表

**连接管理**：
- `db_connection_create`, `db_connection_close`, `db_connection_close_all`
- `db_connection_test`, `db_connection_list`, `db_connection_save`, `db_connection_delete`

**Schema 枚举**：
- `db_list_databases`, `db_list_schemas`, `db_list_tables`, `db_list_views`
- `db_list_routines`, `db_list_table_columns`, `db_list_table_indexes`
- `db_list_table_triggers`, `db_get_primary_keys`, `db_get_table_properties`

**查询执行**：
- `db_query_execute`, `db_query_start`, `db_query_cancel`
- `db_get_table_length`, `db_select_top`

**DDL**：
- `db_get_create_script`, `db_drop_element`, `db_truncate_element`

**DML**：
- `db_apply_changes`

#### 前端模块

```
src/modules/database-manager/
├── index.tsx                        # 主布局（标签页式）
├── services/
│   └── db-commands.ts               # Tauri invoke 封装（模式同 redis-commands.ts）
├── stores/
│   └── db-store.ts                  # 响应式状态（模式同 redis-store.ts）
├── types/
│   ├── connection.ts                # 连接配置类型
│   ├── query.ts                     # 查询结果类型
│   ├── schema.ts                    # Schema 类型
│   └── index.ts
└── components/
    ├── connection-sidebar.tsx       # 连接列表 + 新建/编辑表单
    ├── connection-form.tsx          # 数据库特定连接表单
    ├── schema-browser.tsx           # 树视图：数据库 → Schema → 表 → 列
    ├── query-editor.tsx             # SQL 编辑器 + 结果面板
    ├── result-table.tsx             # 数据网格 + 内联编辑
    └── table-properties.tsx         # 表属性：列、索引、触发器、关系
```

#### 实施阶段

| 阶段 | 内容 | 关键产出 |
|------|------|----------|
| Phase 1 | Core Trait + PostgreSQL | `DatabaseClient` trait、`PostgresClient`、连接/查询/schema 命令 |
| Phase 2 | MySQL + SQLite | `MySqlClient`、`SqliteClient`、共享 row_mapper |
| Phase 3 | 数据编辑 + 前端 | 内联编辑、变更追踪、Schema 浏览器、结果表格 |
| Phase 4 | SQL Server + SSH | `SqlServerClient`（tiberius）、SshTunnelManager 复用 |
| Phase 5 | 导入/导出 + 高级 | CSV/JSON/SQL 导出、查询历史、自动补全、备份 |

#### 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Trait Object vs Enum | `Arc<dyn DatabaseClient>` | 连接异构，新驱动无需改 manager |
| sqlx vs 独立驱动 | sqlx 统一 PG/MySQL/SQLite | 统一 Row trait，内置连接池 |
| SQL Server | tiberius + bb8 | sqlx 不支持 SQL Server |
| 流式传输 | Tauri events | 与 Redis scan 模式一致，轻量无持久连接 |
| 内部存储 | tauri-plugin-store | 轻量，不引入 ORM |
| SSH | 复用现有 SshTunnelManager | 移至 shared/ 共享 |

---

### 6.6 方案对比与推荐

| 维度 | 方案 A (Sidecar) | 方案 B (纯 Rust) |
|------|------------------|-------------------|
| 开发速度 | 快（复用 BKS 全部驱动代码） | 慢（每种驱动需 Rust 重写） |
| 安装包体积 | 大（含 Node.js runtime） | 小（原生二进制） |
| 运行性能 | 中（HTTP 序列化开销） | 高（零拷贝 IPC） |
| 内存占用 | 高（Node.js 进程） | 低（Rust 原生） |
| 数据库支持 | 23种（全部复用 BKS） | 4-6种（按需增加） |
| 维护复杂度 | 高（双进程 + Node.js 依赖） | 低（单一 Rust 代码库） |
| 长期可维护性 | 中（依赖 BKS 版本同步） | 高（完全自主控制） |

**推荐策略**：
- **快速验证/原型阶段** → 方案 A（Sidecar），1-2 个月内可出可用版本
- **正式产品/长期路线** → 方案 B（纯 Rust），逐步替代 Sidecar
- **混合路径** → 先用 Sidecar 上线，同时并行开发 Rust 驱动，按数据库类型逐步迁移

---

## 附录：关键文件索引

| 用途 | 文件路径 |
|------|----------|
| 主进程入口 | `apps/studio/src-commercial/entrypoints/main.ts` |
| Utility 进程入口 | `apps/studio/src-commercial/entrypoints/utility.ts` |
| Preload 脚本 | `apps/studio/src-commercial/entrypoints/preload.ts` |
| 渲染进程入口 | `apps/studio/src-commercial/entrypoints/renderer.ts` |
| DB 客户端抽象基类 | `apps/studio/src/lib/db/clients/BasicDatabaseClient.ts` |
| DB 客户端注册表 | `apps/studio/src/lib/db/clients/index.ts` |
| Renderer 侧代理 | `apps/studio/src/lib/utility/ElectronUtilityConnectionClient.ts` |
| MessagePort 通信层 | `apps/studio/src/lib/utility/UtilityConnection.ts` |
| 连接提供商 | `apps/studio/src-commercial/backend/lib/connection-provider.ts` |
| SSH 隧道 | `apps/studio/src/lib/db/tunnel.ts` |
| Vuex Store | `apps/studio/src/store/index.ts` |
| UI Kit CM6 编辑器 | `apps/ui-kit/lib/components/sql-text-editor/SqlTextEditor.ts` |
| UI Kit Tabulator 表格 | `apps/ui-kit/lib/components/table/Table.vue` |
| 插件管理器 | `apps/studio/src/services/plugin/PluginManager.ts` |
| esbuild 配置 | `apps/studio/esbuild.mjs` |
| Vite 配置 | `apps/studio/vite.config.mjs` |
| electron-builder 配置 | `apps/studio/electron-builder-config.js` |
| TypeORM 连接 | `apps/studio/src/common/appdb/Connection.ts` |
| 连接配置类型 | `apps/studio/src/common/interfaces/IConnection.ts` |

---

## 实施步骤

本报告为分析文档，实施步骤仅涉及导出操作：

1. 在 `ran-rs-desktop/docs/` 目录下创建 `beekeeper-studio-tech-analysis.md`
2. 将本计划文件的全部内容复制到该文件中
3. 验证文件已正确写入

## 验证

- 确认 `ran-rs-desktop/docs/beekeeper-studio-tech-analysis.md` 文件存在且内容完整
- 确认文件包含全部 6 个分析章节 + 2 个深化方案
