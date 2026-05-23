# Beekeeper Studio → Tauri/Rust 迁移可行性分析报告

## Context

Beekeeper Studio 是一个支持 23 种数据库的跨平台 SQL 编辑器和数据库管理工具，当前基于 Electron 39.8.5 + Vue 2.7 + TypeScript 构建。本项目评估将其功能迁移至 Tauri v2 + Rust 技术栈的可行性。**本次迁移仅实现 5 种核心数据库驱动**：PostgreSQL、MySQL、MariaDB、TiDB、SQLite。其余数据库（Redis 已在 ran-rs-desktop 中实现，其他如 SQL Server、Oracle、MongoDB 等不在本次迁移范围）。

项目中已存在一个 `ran-rs-desktop` Tauri 原型，实现了完整的 Redis 桌面管理模块（Vue 3 + Element Plus + Rsbuild + Rust），为迁移提供了已验证的架构模式。

---

## 一、总体可行性评估

**结论：可行，但工作量大**

迁移具备有利条件：
1. BKS 已使用 context isolation + `UtilityConnection`（MessagePort IPC），IPC 边界清晰可替换
2. `ran-rs-desktop` 已证明 Tauri 命令、状态管理、SSH 隧道在 Rust 中的实现模式
3. 前端数据库驱动抽象层（`IBasicDatabaseClient` 接口）提供了 Rust 侧重实现的清晰契约
4. UI Kit 已作为 Web Components 导出，框架无关性强

主要挑战：
1. 5 种核心数据库驱动需要在 Rust 中实现（PostgreSQL、MySQL、MariaDB、TiDB、SQLite）
2. 插件系统的沙箱 iframe 机制需要适配
3. Vue 2 → Vue 3 的前端迁移工作量大（16+ Vuex 模块、50+ 事件）

---

## 二、包管理分析

### 2.1 当前依赖规模

| 工作区 | 生产依赖 | 开发依赖 |
|--------|----------|----------|
| `apps/studio/` | 127 个 | 33 个 |
| `apps/ui-kit/` | 16 个 | 21 个 |

### 2.2 依赖分类

**A 类：可直接用 Rust 替代（核心依赖）**

| Node.js 包 | Rust crate | 成熟度 |
|-----------|-----------|--------|
| `pg` / `pg-cursor` | `tokio-postgres` + `postgres` | ★★★★★ |
| `mysql2` | `mysql_async` / `sqlx` | ★★★★☆ |
| `better-sqlite3` | `rusqlite` | ★★★★★ |
| `ssh2` | `russh`（纯 Rust）或 `ssh2` crate | ★★★★☆ |
| `knex`（查询构建） | `sea-query` | ★★★★☆ |
| `xlsx` | `calamine`（读）+ `rust_xlsxwriter`（写） | ★★★★☆ |
| `papaparse` | `csv` crate | ★★★★★ |
| `axios` / `axios-retry` | `reqwest` + middleware | ★★★★★ |
| `bcryptjs` | `bcrypt` crate | ★★★★★ |
| `simple-encryptor` | `aes-gcm` crate | ★★★★★ |
| `lodash` | Rust stdlib + `itertools` | — |
| `marked` | `pulldown-cmark` | ★★★★★ |
| `dompurify` | `ammonia` | ★★★★★ |
| `ini` | `configparser` crate | ★★★★★ |
| `semver` | `semver` crate | ★★★★★ |
| `ws` | `tokio-tungstenite` | ★★★★★ |
| `redis` | `redis`（ran-rs-desktop 已验证） | ★★★★★ |

**B 类：需要适配/封装**

| Node.js 包 | 挑战 | 策略 |
|-----------|------|------|
| `tabulator-tables`（自定义 fork） | 浏览器端表格组件 | 替换为 `@visactor/vtable`（ran-rs-desktop 已验证） |
| `codemirror` v5 + CM6 | 旧版本及 CM6 | 替换为 `monaco-editor`（ran-rs-desktop 已验证 `monaco-editor-vue3`） |
| `split.js` | 纯 DOM 库 | 保留在前端 |
| `vue-js-modal` / `vuedraggable` / `vue-select` | Vue 2 专属 | 迁移到 Vue 3 + Element Plus |
| `xel` | Web Components | 替换为 Element Plus 组件 |
| `jquery` | 遗留 DOM | 完全移除 |
| `@electron/remote` | Electron API | Tauri 插件（dialog/clipboard/shell） |

**C 类：需要完全重实现（8 个领域）**

1. TypeORM（内部存储） → `sea-orm`
2. Electron 自定义协议 → Tauri protocol handler
3. Utility 进程 MessagePort IPC → Tauri command 系统
4. 插件沙箱（iframe） → 保留 iframe 方式 + Rust 侧生命周期管理
5. SSH 隧道 → 已在 ran-rs-desktop 实现 `SshTunnelManager`
6. 原生菜单 → Tauri menu API
7. 驱动依赖管理（`DriverDepManager`） → 本次 5 种数据库无需此模块

---

## 三、数据库驱动兼容性

### 3.1 核心数据库映射（5 种必须实现）

| # | 数据库 | 当前驱动 | Rust crate | 成熟度 | 风险 | 工作量 |
|---|--------|---------|-----------|--------|------|--------|
| 1 | PostgreSQL | `pg`（纯 JS） | `tokio-postgres` | ★★★★★ | 低 | S |
| 2 | MySQL | `mysql2`（原生） | `mysql_async` / `sqlx` | ★★★★☆ | 低 | S |
| 3 | MariaDB | `mysql2` | 同 MySQL（`mysql_async`） | ★★★★☆ | 低 | S |
| 4 | TiDB | `mysql2` | 同 MySQL（`mysql_async`） | ★★★★☆ | 低 | S |
| 5 | SQLite | `better-sqlite3`（C++） | `rusqlite` | ★★★★★ | 低 | S |

**工作量说明**：S=1-2周

### 3.2 驱动特性分析

**PostgreSQL（`tokio-postgres`）**：成熟度最高，异步原生，支持 SSL、连接池（`deadpool-postgres`）、管道模式、流式查询。完全覆盖当前 `pg` + `pg-cursor` 的全部功能。

**MySQL / MariaDB / TiDB（`mysql_async`）**：纯 Rust 实现，支持 SSL、连接池、预处理语句。TiDB 和 MariaDB 使用 MySQL 协议，无需额外适配。注意：MariaDB 的 ed25519 认证需要额外处理（当前使用 `@coresql/mysql2-auth-ed25519`）。

**SQLite（`rusqlite`）**：捆绑 SQLite，无需系统依赖。支持事务、预编译语句、Blob I/O、扩展加载。同时用于内部元数据存储（替代 TypeORM + `better-sqlite3`）。

### 3.3 风险评估

本次 5 种数据库驱动的 Rust crate 均为高成熟度，整体风险**低**。唯一需注意的是 MariaDB ed25519 认证，可在 `mysql_async` 基础上按需扩展。

---

## 四、UI 组件库迁移

### 4.1 当前 UI Kit 组件清单（19 个）

| 组件 | 功能 | 迁移策略 |
|------|------|---------|
| `Table.vue` | 数据表格（Tabulator.js） | 使用 Vue 3 TSX 重写，表格引擎替换为 `@visactor/vtable` |
| `EntityList.vue` | 数据库实体树形列表 | 使用 Vue 3 TSX 重写 + Element Plus Tree |
| `SqlTextEditor.vue` | SQL 编辑器（CM6） | 使用 Vue 3 TSX 重写为 Monaco Editor（`monaco-editor-vue3`），支持 SQL 高亮/补全 |
| `TextEditor.vue` | 通用文本编辑器（CM6） | 使用 Vue 3 TSX 重写为 Monaco Editor |
| `MergeTextEditor.vue` | Diff/合并编辑器（CM6 merge） | 使用 Vue 3 TSX 重写为 Monaco Editor diff editor |
| `SuperFormatter.vue` | SQL 格式化器 | 使用 Vue 3 TSX 重写 |
| `DataEditor.vue` | 数据编辑器 | 使用 Vue 3 TSX 重写 |
| `ContextMenu.vue` | 右键菜单 | 使用 Vue 3 TSX 重写 |
| `MongoShell.vue` | MongoDB Shell | 暂不迁移（不在本次数据库范围） |
| `SurrealTextEditor.vue` | SurrealDB 编辑器 | 暂不迁移（不在本次数据库范围） |

### 4.2 迁移路径

1. **UI Kit 升级到 Vue 3**：`@vue/web-component-wrapper` → Vue 3 原生 `defineCustomElement`
2. **编辑器替换为 Monaco Editor**：所有 CodeMirror 编辑器组件替换为 `monaco-editor`（`monaco-editor-vue3`），ran-rs-desktop 已验证此方案。Monaco Editor 提供 SQL 高亮/补全、diff 编辑、多语言支持等完整功能
3. **主题系统**：5 套 SCSS 主题 → CSS 自定义属性 + Element Plus 主题变量
4. **Xel 替换**：34KB 的 xel.scss → Element Plus 组件库
5. **表格引擎替换**：`tabulator-tables` 自定义 fork → `@visactor/vtable`（ran-rs-desktop 已验证）
6. **组件开发规范**：所有 Vue 3 组件使用 TSX 语法开发（ran-rs-desktop 已验证此模式）

### 4.3 框架迁移映射

| 当前（Vue 2） | 目标（Vue 3） |
|-------------|-------------|
| Vuex 3.x（16+ 模块） | Pinia |
| `vue-class-component` + `vue-property-decorator` | Vue 3 Composition API + TSX 语法 |
| `vue-js-modal` | Element Plus Dialog |
| `vuedraggable` v2 | `vuedraggable` v4 / `@vueuse/integrations` |
| `vue-select` | Element Plus Select |
| `v-tooltip` | Element Plus Tooltip |
| `portal-vue` | Vue 3 `<Teleport>` |
| jQuery | 完全移除 |
| `v-hotkey` | `@vueuse/core` `useMagicKeys` |

---

## 五、第三方依赖映射总表

### 5.1 基础设施与构建

| Node.js | Rust / 替代 |
|---------|-----------|
| `electron` 39.8.5 | `tauri` v2 |
| `electron-builder` 26.7 | `tauri build`（内置） |
| `esbuild`（主进程） | 不再需要（Rust 后端） |
| `vite`（渲染进程） | `rsbuild`（ran-rs-desktop 已验证） |
| `@electron/remote` | `tauri-plugin-*` 系列 |
| `electron-log` | `log` + `env_logger` |
| `node-gyp` | 不再需要 |

### 5.2 数据处理

| Node.js | Rust |
|---------|------|
| `typeorm`（内部 DB） | `sea-orm` |
| `knex` | `sea-query`（查询构建器，非 ORM） |
| `xlsx` | `calamine`（读）+ `rust_xlsxwriter`（写） |
| `papaparse` | `csv` crate |
| `sql-formatter` | `sqlformat` 或自定义 |
| `sql-query-identifier` | 自定义正则 |

### 5.3 安全与认证

| Node.js | Rust |
|---------|------|
| `simple-encryptor` | `aes-gcm` crate |
| `bcryptjs` | `bcrypt` crate |

### 5.4 SSH 与网络

| Node.js | Rust |
|---------|------|
| `ssh2` | `russh`（纯 Rust）或 `ssh2` crate（ran-rs-desktop 使用 `ssh2`） |
| `ssh-config` | Rust 直接解析 |
| `ws` | `tokio-tungstenite` |
| `axios` / `axios-retry` | `reqwest` |

---

## 六、插件系统迁移

### 6.1 当前架构

- **后端**（Utility 进程）：`PluginManager` + `PluginFileManager` + `PluginRegistry`
- **前端**（Renderer）：`WebPluginManager` + `WebPluginLoader`
- **沙箱**：iframe sandbox（`allow-scripts allow-same-origin allow-forms`）
- **通信**：`window.postMessage` 双向通信
- **自定义协议**：`plugin://{pluginId}/{entryPath}`

### 6.2 迁移策略：保留 iframe 沙箱

**核心决策**：iframe 沙箱方式在 Tauri WebView 中完全兼容，风险最低。

| 层 | 当前 | 迁移后 |
|---|------|--------|
| 插件发现/安装 | Node.js `PluginFileManager` | Rust `std::fs` + 插件目录扫描 |
| Manifest 解析 | TypeScript JSON 解析 | Rust `serde` 反序列化 |
| 插件注册表 | TypeScript `PluginRegistry` | Rust `HashMap` + `DashMap` |
| 沙箱执行 | iframe sandbox | **保持不变**（WebView 原生支持） |
| 消息通信 | `window.postMessage` | **保持不变** |
| 自定义协议 | Electron `protocol.registerFileProtocol` | Tauri `tauri::protocol::tauri` |
| 插件 API | `postMessage` → Utility 进程 | `postMessage` → Tauri invoke |
| 插件菜单 | `PluginMenuFactories` + IPC | 相同模式，Tauri 菜单 API |

### 6.3 关键文件

- `libs/beekeeper-studio/apps/studio/src/services/plugin/web/WebPluginLoader.ts` — 核心 iframe 加载和消息通信逻辑
- `libs/beekeeper-studio/apps/studio/src/services/plugin/types.ts` — Manifest V0/V1 类型定义
- `libs/beekeeper-studio/apps/studio/src/services/plugin/PluginManager.ts` — 插件生命周期管理

---

## 七、C++ 原生模块处理

### 7.1 需处理的原生模块（仅 5 种数据库相关）

| 模块 | C++ 依赖 | Rust 策略 |
|------|---------|----------|
| `better-sqlite3` | SQLite3 C API | `rusqlite`（捆绑 SQLite，纯 Rust 绑定） |
| `mysql2` | MariaDB C client | `mysql_async`（纯 Rust） |
| `ssh2` | libssh2 | `russh`（纯 Rust）或 `ssh2` crate |
| `pg` | 纯 JS | `tokio-postgres`（纯 Rust） |
| `typeorm`（内部 DB） | 依赖 `better-sqlite3` | `sea-orm` + `rusqlite` |

### 7.2 策略

1. **全部使用纯 Rust 替代**：`rusqlite`、`mysql_async`、`tokio-postgres` 均为纯 Rust 实现，无需任何 C++ 编译
2. **消除构建复杂性**：不再需要 `node-gyp`、`node-abi`、`electron-builder install-app-deps`
3. **SSH 隧道**：`ssh2` crate 已在 ran-rs-desktop 中验证（基于 libssh2），后续可迁移到纯 Rust 的 `russh`
4. **交叉编译**：Rust 交叉编译比 Node.js 原生模块更成熟，支持 6 平台矩阵（win-x64/arm64, mac-x64/arm64, linux-x64/arm64）
5. **不再需要驱动依赖管理**：当前 BKS 的 `DriverDepManager`（用于下载 Oracle Instant Client 等）在本次 5 种数据库范围内不需要

---

## 八、性能与安全影响

### 8.1 性能预期

| 指标 | Electron（当前） | Tauri（预期） | 提升 |
|------|-----------------|-------------|------|
| 安装包大小 | 200-250 MB | 15-25 MB | **~90% 缩减** |
| 空闲内存 | 300-500 MB | 30-80 MB | **~85% 缩减** |
| 10 连接内存 | 800 MB-1.2 GB | 200-400 MB | **~60-70% 缩减** |
| 冷启动时间 | 3-5 秒 | 0.5-1.5 秒 | **~70% 更快** |
| 数据库查询 IPC 延迟 | 2-5 ms（JS 开销） | 0.1-0.5 ms（Rust 原生） | **10-50x 更快** |
| SSH 隧道建立 | ~500 ms | ~200 ms | **~2.5x 更快** |
| CI 构建产物 | ~500 MB/平台 | ~50 MB/平台 | **~90% 缩减** |

### 8.2 安全改进

| 方面 | Electron | Tauri |
|------|---------|-------|
| IPC 边界 | 自定义 MessagePort + preload bridge | 类型化 Tauri 命令 + serde 验证 |
| 沙箱 | context isolation 启用，sandbox 禁用 | 完整 CSP 强制 + 沙箱 WebView |
| 攻击面 | 完整 Node.js 运行时 | 零 Node.js，纯 Rust 二进制 |
| 远程代码执行 | 可能通过 Node.js eval | 消除 — 后端无 JS 运行时 |
| 依赖漏洞 | 127 npm 包 + 深层依赖树 | ~30-40 Rust crate + 浅层依赖树 |
| 文件系统访问 | `@electron/remote` 可绕过 | Tauri capability 作用域限制 |

---

## 九、分阶段迁移路径

### Phase 0：基础建设

**目标**：建立 Tauri 项目结构，验证核心模式

- 基于 `ran-rs-desktop` 扩展项目结构
- 建立多模块 Rust 架构（参考 `redis_desktop` 模块模式）
- 定义 Rust 版 `BasicDatabaseClient` trait（镜像 TypeScript 接口）
- 建立全平台 CI/CD 管道

**前端模块**：`ran-rs-desktop/src/modules/sql-studio/`
**后端模块**：`ran-rs-desktop/src-tauri/src/modules/sql-studio/`

**模块目录结构（后端）**：
```
src-tauri/src/modules/sql-studio/
├── mod.rs                          # 模块入口
├── connection/
│   ├── mod.rs
│   ├── commands.rs                 # Tauri 命令
│   ├── models.rs                   # 连接配置模型
│   └── service.rs                  # 连接管理器
├── query/
│   ├── mod.rs
│   ├── commands.rs                 # 查询执行命令
│   ├── models.rs                   # 查询结果模型
│   └── service.rs                  # 查询执行服务
├── drivers/
│   ├── mod.rs                      # 驱动注册表
│   ├── basic_database_client.rs    # BasicDatabaseClient trait
│   ├── postgresql.rs               # PostgreSQL 驱动
│   ├── mysql.rs                    # MySQL/MariaDB/TiDB 驱动
│   └── sqlite.rs                   # SQLite 驱动
├── tunnel/
│   ├── mod.rs
│   └── service.rs                  # SSH 隧道（复用 redis_desktop 的 SshTunnelManager）
└── storage/
    ├── mod.rs
    ├── commands.rs
    ├── models.rs
    └── service.rs                  # sea-orm + rusqlite 内部存储
```

**模块目录结构（前端）**：
```
src/modules/sql-studio/
├── index.ts                        # 模块入口
├── connection/
│   ├── ConnectionForm.tsx          # 连接表单组件
│   ├── ConnectionList.tsx          # 连接列表组件
│   └── types.ts                    # 连接类型定义
├── query/
│   ├── QueryEditor.tsx             # SQL 查询编辑器（Monaco Editor）
│   ├── ResultTable.tsx             # 查询结果表格（@visactor/vtable）
│   └── types.ts                    # 查询类型定义
├── sidebar/
│   ├── EntityList.tsx              # 数据库实体列表
│   ├── DatabaseTree.tsx            # 数据库树形导航
│   └── types.ts
├── store/
│   ├── connection.ts               # Pinia 连接 store
│   ├── query.ts                    # Pinia 查询 store
│   └── sidebar.ts                  # Pinia 侧边栏 store
└── hooks/
    ├── useConnection.ts            # 连接管理 hook
    └── useQuery.ts                 # 查询执行 hook
```

**关键参考文件**：
- `ran-rs-desktop/src-tauri/src/lib.rs` — Tauri 命令注册模式
- `ran-rs-desktop/src-tauri/src/modules/redis_desktop/mod.rs` — 模块化组织
- `ran-rs-desktop/src-tauri/src/modules/redis_desktop/connection/service.rs` — 连接管理模式
- `ran-rs-desktop/src-tauri/src/modules/redis_desktop/tunnel/service.rs` — SSH 隧道实现
- `libs/beekeeper-studio/apps/studio/src/lib/db/types.ts` — `DatabaseTypes` 和 `ConnectionType` 定义
- `libs/beekeeper-studio/apps/studio/src/lib/db/clients/BasicDatabaseClient.ts` — 基础客户端接口

**风险**：低 — ran-rs-desktop 已验证大部分模式

### Phase 1：核心数据库驱动（5 种）

**目标**：实现 PostgreSQL、MySQL、MariaDB、TiDB、SQLite 的 Rust 驱动

按优先级：
1. **SQLite**（`rusqlite`）— 最简单，本地文件，同时也是内部元数据存储
2. **PostgreSQL**（`tokio-postgres`）— 最大用户群，成熟度最高
3. **MySQL/MariaDB**（`mysql_async`）— 第二大用户群，MariaDB 和 TiDB 复用同一驱动

每个驱动实现内容：
- Rust 连接管理器（类似 `RedisConnectionManager`）
- Tauri 命令集（类似 `redis_connection_*` 命令模式）
- 前端 Vue 3 连接表单
- 查询编辑器集成

**风险**：低 — 所有 5 种数据库的 Rust crate 均高度成熟，无中高风险项

### Phase 2：前端迁移

**目标**：Vue 2 → Vue 3 完整前端重建

- UI Kit 19 个组件移植到 Vue 3
- 连接界面重建（Vue 3 + Element Plus 表单）
- 核心界面重建（查询编辑器、结果表格、侧边栏）
- 16+ Vuex 模块 → Pinia stores
- 5 套主题 → CSS 自定义属性
- Tab 系统 → `dockview-vue`（ran-rs-desktop 已用）
- 50+ AppEvent 事件 → `mitt` 或 `@vueuse/core` 事件系统

**风险**：中 — 工作量大但模式清晰；`tabulator-tables` 自定义 fork 的功能需在 `@visactor/vtable` 中逐一验证

### Phase 3：SSH 隧道与高级连接

**目标**：实现所有连接模式

- SSH 隧道系统（ran-rs-desktop 已有 `SshTunnelManager`）
- 堡垒机（跳板机）支持
- 所有 SSL/TLS 模式（CA 证书、客户端证书、自签名信任）
- 自定义协议处理器（`postgresql://`、`mysql://`、`sqlite://` 等）

**风险**：低 — SSH 已在 ran-rs-desktop 中验证

### Phase 4：插件系统

**目标**：插件系统完整迁移

- Rust 插件管理器（文件系统、注册表、生命周期）
- 插件沙箱（保留 iframe 方式）
- 自定义协议处理器（`plugin://`）
- 插件商店服务
- AI Shell 插件、ER Diagram 插件

**风险**：中 — iframe 方式成熟且 WebView 兼容

### Phase 5：商业化功能（暂时不实现）

**目标**：商业版功能迁移

- 许可证管理系统
- 云同步（Beekeeper Studio Cloud）
- 全格式导入/导出（CSV, JSON, JSONL, XLSX）
- 数据库备份/恢复
- 深度链接协议
- 文件关联（.db, .sqlite3, .duckdb）
- 系统托盘

**风险**：中 — 功能明确但涉及双许可证模型

### Phase 6：测试与优化

**目标**：生产级质量

- 每个 Rust 驱动的单元测试
- 集成测试（使用 testcontainers，与当前 BKS 一致）
- E2E 测试（Playwright，与当前 BKS 一致）
- 跨平台测试（Windows, macOS, Linux; x64, ARM64）
- 性能剖析和优化
- 内存泄漏检测

### Phase 7：迁移与发布

**目标**：平滑过渡

- 从 Electron 版本导入设置
- 已保存连接的数据迁移
- 两个版本并行发布
- 文档更新

---

## 十、风险评估矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| MariaDB ed25519 认证 | 低 | 低 | 评估是否需要支持；如需要可在 `mysql_async` 基础上扩展 |
| UI 迁移工作量低估 | 中 | 高 | 从 UI Kit 移植开始；增量迁移 |
| 插件系统回归 | 低 | 高 | 保留 iframe 方式；全面 E2E 测试 |
| 跨平台构建失败 | 中 | 高 | CI 矩阵从 Phase 0 开始；每周全平台测试 |
| `tabulator-tables` fork 功能迁移 | 中 | 中 | 已确定使用 `@visactor/vtable`（ran-rs-desktop 已验证）；需逐一验证自定义 fork 的功能覆盖 |

---

## 十一、架构决策记录

**ADR-1**：保留 iframe 插件沙箱 — 最小迁移风险，WebView 原生支持

**ADR-2**：使用 `russh` 替代 `ssh2` — 消除 libssh2 C 依赖（或沿用 ran-rs-desktop 已验证的 `ssh2` crate）

**ADR-3**：使用 Element Plus 替代 Xel，Vue 3 TSX 替代 SFC — 所有组件使用 TSX 语法开发（ran-rs-desktop 已验证），表格统一使用 `@visactor/vtable`

**ADR-4**：使用 Monaco Editor 替代 CodeMirror — ran-rs-desktop 已验证 `monaco-editor-vue3`，提供更强大的 SQL 补全和 diff 编辑能力，与 VS Code 同源生态

**ADR-5**：使用 `sea-orm` 替代 TypeORM，`sea-query` 替代 `knex` — `sea-orm` 基于 `sea-query` 构建，与 TypeORM 模式匹配（实体定义、迁移、关系映射）

---

## 十二、关键参考文件

### Beekeeper Studio（源）

| 用途 | 路径 |
|------|------|
| 数据库类型定义 | `libs/beekeeper-studio/apps/studio/src/lib/db/types.ts` |
| 基础客户端接口 | `libs/beekeeper-studio/apps/studio/src/lib/db/clients/BasicDatabaseClient.ts` |
| 客户端注册表 | `libs/beekeeper-studio/apps/studio/src/lib/db/clients/index.ts` |
| Utility 进程入口 | `libs/beekeeper-studio/apps/studio/src-commercial/entrypoints/utility.ts` |
| Preload 脚本 | `libs/beekeeper-studio/apps/studio/src-commercial/entrypoints/preload.ts` |
| Main 进程入口 | `libs/beekeeper-studio/apps/studio/src-commercial/entrypoints/main.ts` |
| 插件加载器 | `libs/beekeeper-studio/apps/studio/src/services/plugin/web/WebPluginLoader.ts` |
| 插件类型 | `libs/beekeeper-studio/apps/studio/src/services/plugin/types.ts` |
| 插件管理器 | `libs/beekeeper-studio/apps/studio/src/services/plugin/PluginManager.ts` |
| Vuex Store | `libs/beekeeper-studio/apps/studio/src/store/index.ts` |
| IPC 连接 | `libs/beekeeper-studio/apps/studio/src/lib/utility/UtilityConnection.ts` |
| SSH 隧道 | `libs/beekeeper-studio/apps/studio/src/lib/db/tunnel.ts` |
| UI Kit 组件 | `libs/beekeeper-studio/apps/ui-kit/lib/components/` |
| 包依赖 | `libs/beekeeper-studio/apps/studio/package.json` |
| Docker 开发环境 | `libs/beekeeper-studio/dev/docker-compose.yml` |

### ran-rs-desktop（已验证的 Tauri 模式）

| 用途 | 路径 |
|------|------|
| Tauri 入口 | `ran-rs-desktop/src-tauri/src/lib.rs` |
| Redis 模块组织 | `ran-rs-desktop/src-tauri/src/modules/redis_desktop/mod.rs` |
| 连接管理模式 | `ran-rs-desktop/src-tauri/src/modules/redis_desktop/connection/service.rs` |
| SSH 隧道实现 | `ran-rs-desktop/src-tauri/src/modules/redis_desktop/tunnel/service.rs` |
| 共享类型 | `ran-rs-desktop/src-tauri/src/shared/` |
| Cargo 依赖 | `ran-rs-desktop/src-tauri/Cargo.toml` |
| 前端包配置 | `ran-rs-desktop/package.json` |

---

## 十三、验证方案

迁移验证按以下方式进行：

1. **单元测试**：每个 Rust 数据库驱动（5 种）需要对应的单元测试，使用 `testcontainers` 对真实数据库运行
2. **集成测试**：参考 `libs/beekeeper-studio/dev/docker-compose.yml`，使用 PostgreSQL、MySQL、MariaDB 的 Docker 容器运行相同的测试数据集（TiDB 复用 MySQL 测试，SQLite 为本地文件）
3. **E2E 测试**：使用 Playwright 对 Tauri 窗口执行端到端测试（连接、查询、导入导出流程）
4. **性能基准**：建立关键操作（冷启动、查询执行、大数据量渲染）的基准对比
5. **跨平台验证**：CI 矩阵覆盖 Windows/macOS/Linux 的 x64/ARM64 架构
6. **插件兼容性**：验证现有 BKS 插件在新 iframe 沙箱中的加载和通信
