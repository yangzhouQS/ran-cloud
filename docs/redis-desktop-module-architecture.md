# Redis Desktop Manager — 独立模块架构设计

> **设计原则**：前后端完全解耦，通过 Tauri IPC 协议通信。每个模块具有独立可测试性，可独立开发、独立替换。

---

## 一、整体架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri 2 Application                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Frontend (Vue 3 + TSX)                    │  │
│  │                                                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ 连接管理  │ │ Key 浏览  │ │ 数据编辑  │ │ 工具面板  │  │  │
│  │  │  模块     │ │  模块     │ │  模块     │ │  模块     │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐               │  │
│  │  │ 数据查看  │ │ 设置/主题 │ │ 公共组件  │               │  │
│  │  │  模块     │ │  模块     │ │  模块     │               │  │
│  │  └──────────┘ └──────────┘ └──────────┘               │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │           Services 层（IPC 调用封装）              │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                            │                                 │
│                     Tauri invoke / Events                     │
│                            │                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Backend (Rust + tokio)                     │  │
│  │                                                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │ 连接管理  │ │ Key 操作  │ │ 数据类型  │ │ 工具服务  │  │  │
│  │  │  服务     │ │  服务     │ │  服务     │ │  服务     │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐               │  │
│  │  │ SSH 隧道  │ │ 数据查看  │ │ 存储服务  │               │  │
│  │  │  服务     │ │  服务     │ │  服务     │               │  │
│  │  └──────────┘ └──────────┘ └──────────┘               │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、前端模块架构

### 2.1 目录结构

> **模块化架构**：`src/modules/` 下可放置多个独立工具模块，`redis-desktop-manager` 是其中之一。

```
src/
├── main.ts                          # 应用入口（多页面路由）
├── app.tsx                          # 主应用壳
├── assets/
│   └── styles/
│       ├── index.css                # 全局样式
│       ├── variables.css            # CSS 变量（主题色）
│       └── dark.css                 # 暗黑模式覆盖
│
├── modules/                         # ====== 功能模块目录 ======
│   │
│   ├── redis-desktop-manager/       # 🔴 Redis Desktop Manager 模块
│   │   │
│   │   ├── types/                   # 模块类型定义
│   │   │   ├── connection.ts        # 连接配置类型
│   │   │   ├── redis-key.ts         # Key 数据类型
│   │   │   ├── redis-data.ts        # 数据类型操作类型
│   │   │   ├── redis-command.ts     # 命令日志类型
│   │   │   ├── redis-info.ts        # 服务器信息类型
│   │   │   ├── viewer.ts            # 数据查看器类型
│   │   │   └── ipc.ts               # IPC 请求/响应类型
│   │   │
│   │   ├── services/                # 模块 IPC 服务层
│   │   │   ├── connection-service.ts  # 连接管理 IPC 调用
│   │   │   ├── key-service.ts         # Key 操作 IPC 调用
│   │   │   ├── data-service.ts        # 数据类型操作 IPC 调用
│   │   │   ├── cli-service.ts         # CLI 命令执行 IPC 调用
│   │   │   ├── tool-service.ts        # 工具 IPC 调用
│   │   │   ├── viewer-service.ts      # 数据查看器 IPC 调用
│   │   │   └── event-service.ts       # Tauri Events 监听封装
│   │   │
│   │   ├── composables/             # 模块组合式函数
│   │   │   ├── use-connection.ts      # 连接状态管理
│   │   │   ├── use-key-scanner.ts     # Key 扫描（流式加载）
│   │   │   ├── use-data-editor.ts     # 数据编辑通用逻辑
│   │   │   ├── use-cli-history.ts     # CLI 命令历史
│   │   │   ├── use-event-listener.ts  # Tauri Events 监听 Hook
│   │   │   ├── use-auto-refresh.ts    # 自动刷新 Hook
│   │   │   ├── use-vtable.ts          # VTable 实例管理 Hook
│   │   │   └── index.ts               # 统一导出
│   │   │
│   │   ├── components/              # 模块 UI 组件
│   │   │   │
│   │   │   ├── connection/          # 连接管理子模块
│   │   │   │   ├── connection-list.tsx    # 连接列表（拖拽排序）
│   │   │   │   ├── connection-dialog.tsx  # 新建/编辑连接对话框
│   │   │   │   ├── connection-form/
│   │   │   │   │   ├── basic-form.tsx     # 基础连接表单
│   │   │   │   │   ├── ssh-form.tsx       # SSH 配置表单
│   │   │   │   │   ├── ssl-form.tsx       # SSL/TLS 配置表单
│   │   │   │   │   └── sentinel-form.tsx  # Sentinel 配置表单
│   │   │   │   └── connection-menu.tsx    # 连接右键菜单
│   │   │   │
│   │   │   ├── key/                 # Key 浏览子模块
│   │   │   │   ├── key-panel.tsx          # Key 面板入口（列表/树切换）
│   │   │   │   ├── key-list.tsx           # Key 平铺列表（VTable ListTable）
│   │   │   │   ├── key-tree.tsx           # Key 树形视图（VTable ListTable tree mode）
│   │   │   │   ├── key-detail.tsx         # Key 详情页容器
│   │   │   │   ├── key-header.tsx         # Key 名称/TTL/操作栏
│   │   │   │   └── key-search.tsx         # Key 搜索组件
│   │   │   │
│   │   │   ├── content/             # 数据类型编辑子模块
│   │   │   │   ├── content-router.tsx     # 数据类型路由（按 type 分发）
│   │   │   │   ├── content-string.tsx     # String 编辑器
│   │   │   │   ├── content-hash.tsx       # Hash 编辑器（VTable ListTable）
│   │   │   │   ├── content-list.tsx       # List 编辑器（VTable ListTable）
│   │   │   │   ├── content-set.tsx        # Set 编辑器（VTable ListTable）
│   │   │   │   ├── content-zset.tsx       # ZSet 编辑器（VTable ListTable + 排序）
│   │   │   │   ├── content-stream.tsx     # Stream 编辑器（VTable ListTable）
│   │   │   │   └── content-rejson.tsx     # ReJSON 编辑器（monaco-editor-vue3）
│   │   │   │
│   │   │   ├── viewer/              # 数据查看器子模块
│   │   │   │   ├── format-viewer.tsx      # 格式查看器入口（自动检测）
│   │   │   │   ├── viewer-text.tsx        # 文本查看器
│   │   │   │   ├── viewer-hex.tsx         # Hex 十六进制查看器
│   │   │   │   ├── viewer-json.tsx        # JSON 查看器（monaco-editor-vue3）
│   │   │   │   ├── viewer-binary.tsx      # 二进制查看器
│   │   │   │   ├── viewer-msgpack.tsx     # Msgpack 查看器
│   │   │   │   ├── viewer-protobuf.tsx    # Protobuf 查看器
│   │   │   │   ├── viewer-decompress.tsx  # 解压查看器（Gzip/Brotli/Deflate）
│   │   │   │   ├── viewer-oversize.tsx    # 大文件查看器
│   │   │   │   └── viewer-custom.tsx      # 自定义格式化器
│   │   │   │
│   │   │   ├── tool/                # 工具子模块
│   │   │   │   ├── cli-tab.tsx            # CLI 命令行标签页
│   │   │   │   ├── cli-input.tsx          # 命令输入（自动补全）
│   │   │   │   ├── cli-output.tsx         # 命令输出展示
│   │   │   │   ├── command-log.tsx        # 命令日志面板
│   │   │   │   ├── status-panel.tsx       # 服务器状态面板
│   │   │   │   ├── slow-log.tsx           # 慢日志面板（VTable ListTable）
│   │   │   │   ├── memory-analysis.tsx    # 内存分析面板（VTable ListTable）
│   │   │   │   └── delete-batch.tsx       # 批量删除面板
│   │   │   │
│   │   │   └── common/              # 模块公共组件
│   │   │       ├── vtable-wrapper.tsx     # VTable 通用封装
│   │   │       ├── redis-context.tsx      # Redis 连接上下文 Provider
│   │   │       └── index.ts               # 统一导出
│   │   │
│   │   └── index.ts                 # 模块入口（导出主组件）
│   │
│   └── ...（其他工具模块，如 telepresence-manager 等）
│
├── components/                      # ====== 全局公共组件 ======
│   ├── layout/
│   │   ├── app-layout.tsx           # 应用主布局（三栏）
│   │   ├── sidebar.tsx              # 64px 窄侧边栏
│   │   └── resize-panel.tsx         # 可拖拽调整宽度的面板
│   ├── tabs/
│   │   ├── tab-bar.tsx              # 标签栏
│   │   ├── tab-item.tsx             # 单个标签
│   │   └── tab-context-menu.tsx     # 标签右键菜单
│   └── common/
│       ├── context-menu.tsx         # 右键菜单
│       ├── confirm-dialog.tsx       # 确认对话框
│       ├── loading-overlay.tsx      # 加载遮罩
│       └── empty-state.tsx          # 空状态占位
│
├── pages/                           # ====== 独立页面 ======
│   ├── settings-page.tsx            # 设置页（独立窗口）
│   └── about-page.tsx               # 关于页（独立窗口）
│
├── services/                        # ====== 全局服务 ======
│   ├── tauri.ts                     # Tauri 环境检测
│   └── storage.ts                   # 全局存储服务
│
├── composables/                     # ====== 全局组合式函数 ======
│   ├── use-context-menu.ts          # 右键菜单 Hook
│   ├── use-shortcut.ts              # 快捷键 Hook
│   └── use-theme.ts                 # 主题切换 Hook
│
└── i18n/                            # ====== 国际化 ======
    ├── index.ts                     # i18n 配置
    └── langs/
        ├── cn.ts                    # 中文
        ├── en.ts                    # 英文
        └── ...                      # 其他语言
```

### 2.2 前端模块依赖关系

```
                    ┌─────────────┐
                    │   app.tsx   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
      ┌───────▼──────┐ ┌──▼──────┐ ┌──▼──────────┐
      │  layout/     │ │ tabs/   │ │ connection/ │
      │  模块        │ │ 模块    │ │ 模块        │
      └──────────────┘ └─────────┘ └──────┬───────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
            ┌───────▼──────┐    ┌────────▼───────┐    ┌───────▼──────┐
            │  key/        │    │  tool/         │    │  content/    │
            │  模块        │    │  模块          │    │  模块        │
            └───────┬──────┘    └────────┬───────┘    └───────┬──────┘
                    │                    │                     │
                    └────────┬───────────┘                     │
                             │                                 │
                    ┌────────▼────────┐              ┌────────▼────────┐
                    │  viewer/        │              │  common/        │
                    │  模块           │              │  模块           │
                    └─────────────────┘              └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │  services/      │  ← IPC 调用封装层
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  composables/   │  ← 组合式函数层
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  types/         │  ← 类型定义层
                    └─────────────────┘
```

### 2.3 前端各模块职责

#### 连接管理模块 `connection/`

| 组件 | 职责 | 对外接口 |
|---|---|---|
| `connection-list.tsx` | 展示所有已保存的连接配置，支持拖拽排序 | `onSelect(connection)`, `onEdit(connection)`, `onDelete(connection)` |
| `connection-dialog.tsx` | 新建/编辑连接的对话框 | `visible: boolean`, `mode: 'create' \| 'edit'`, `connection?: ConnectionConfig` |
| `basic-form.tsx` | Host/Port/Auth/Username 表单 | `v-model={formData}` |
| `ssh-form.tsx` | SSH 隧道配置表单 | `v-model={sshConfig}` |
| `ssl-form.tsx` | SSL/TLS 配置表单 | `v-model={sslConfig}` |
| `sentinel-form.tsx` | Sentinel 配置表单 | `v-model={sentinelConfig}` |
| `connection-menu.tsx` | 连接右键菜单 | `onAction(action, connection)` |

#### Key 浏览模块 `key/`

| 组件 | 职责 | 对外接口 |
|---|---|---|
| `key-panel.tsx` | Key 面板入口，管理列表/树视图切换 | `connectionId: string`, `db: number` |
| `key-list.tsx` | Key 平铺列表（VTable ListTable） | `onSelect(key)`, `onLoadMore()` |
| `key-tree.tsx` | Key 树形视图（VTable ListTable tree mode） | `onSelect(key)`, `onExpand(node)` |
| `key-detail.tsx` | Key 详情容器，按类型路由到对应编辑器 | `keyName: string`, `keyType: string` |
| `key-header.tsx` | Key 名称/TTL/操作栏 | `onRename()`, `onDelete()`, `onTTL()`, `onPersist()` |
| `key-search.tsx` | Key 搜索（模糊/精确） | `onSearch(pattern, mode)` |

#### 数据类型编辑模块 `content/`

| 组件 | 职责 | 对外接口 |
|---|---|---|
| `content-router.tsx` | 按 Key 类型分发到对应编辑器 | `keyName`, `keyType` → 渲染对应编辑器 |
| `content-string.tsx` | String 类型查看/编辑 | `keyName: string` |
| `content-hash.tsx` | Hash 类型查看/编辑（VTable ListTable + customRender） | `keyName: string` |
| `content-list.tsx` | List 类型查看/编辑（VTable ListTable） | `keyName: string` |
| `content-set.tsx` | Set 类型查看/编辑（VTable ListTable） | `keyName: string` |
| `content-zset.tsx` | ZSet 类型查看/编辑（VTable ListTable + 排序） | `keyName: string` |
| `content-stream.tsx` | Stream 类型查看/编辑（VTable ListTable） | `keyName: string` |
| `content-rejson.tsx` | ReJSON 类型查看/编辑（monaco-editor-vue3） | `keyName: string` |

#### 工具模块 `tool/`

| 组件 | 职责 | 对外接口 |
|---|---|---|
| `cli-tab.tsx` | CLI 命令行标签页容器 | `connectionId: string` |
| `cli-input.tsx` | 命令输入框 + 自动补全 | `onExecute(command)` |
| `cli-output.tsx` | 命令输出展示 | `outputs: CliOutput[]` |
| `command-log.tsx` | 命令日志面板 | `connectionId: string` |
| `status-panel.tsx` | 服务器状态面板 | `connectionId: string` |
| `slow-log.tsx` | 慢日志面板（VTable ListTable） | `connectionId: string` |
| `memory-analysis.tsx` | 内存分析面板（VTable ListTable） | `connectionId: string` |
| `delete-batch.tsx` | 批量删除面板 | `connectionId: string`, `keys: string[]` |

---

## 三、后端模块架构

### 3.1 目录结构

```
src-tauri/src/
├── main.rs                          # 应用入口
├── lib.rs                           # Tauri 插件注册 + 命令注册
│
├── modules/                         # ====== 业务模块 ======
│   │
│   ├── connection/                  # 连接管理模块（独立）
│   │   ├── mod.rs                   # 模块入口
│   │   ├── commands.rs              # Tauri Commands（前端调用入口）
│   │   ├── service.rs               # 连接管理业务逻辑
│   │   ├── manager.rs               # 连接池管理器
│   │   └── models.rs                # 连接配置数据模型
│   │
│   ├── key/                         # Key 操作模块（独立）
│   │   ├── mod.rs                   # 模块入口
│   │   ├── commands.rs              # Tauri Commands
│   │   ├── service.rs               # Key 操作业务逻辑
│   │   └── models.rs                # Key 数据模型
│   │
│   ├── data/                        # 数据类型操作模块（独立）
│   │   ├── mod.rs                   # 模块入口
│   │   ├── commands.rs              # Tauri Commands
│   │   ├── service.rs               # 数据类型操作业务逻辑
│   │   ├── hash_service.rs          # Hash 专用操作
│   │   ├── list_service.rs          # List 专用操作
│   │   ├── set_service.rs           # Set 专用操作
│   │   ├── zset_service.rs          # ZSet 专用操作
│   │   ├── stream_service.rs        # Stream 专用操作
│   │   ├── string_service.rs        # String 专用操作
│   │   └── models.rs                # 数据类型模型
│   │
│   ├── cli/                         # CLI 命令执行模块（独立）
│   │   ├── mod.rs                   # 模块入口
│   │   ├── commands.rs              # Tauri Commands
│   │   ├── service.rs               # 命令执行引擎
│   │   ├── parser.rs                # Redis 命令参数解析
│   │   ├── autocomplete.rs          # 命令自动补全
│   │   └── models.rs                # CLI 输出模型
│   │
│   ├── tool/                        # 工具模块（独立）
│   │   ├── mod.rs                   # 模块入口
│   │   ├── commands.rs              # Tauri Commands
│   │   ├── info_service.rs          # INFO 命令解析
│   │   ├── slowlog_service.rs       # SLOWLOG 服务
│   │   ├── memory_service.rs        # MEMORY USAGE 分析
│   │   ├── monitor_service.rs       # MONITOR 实时监控
│   │   └── models.rs                # 工具数据模型
│   │
│   ├── viewer/                      # 数据查看器模块（独立）
│   │   ├── mod.rs                   # 模块入口
│   │   ├── commands.rs              # Tauri Commands
│   │   ├── format_detector.rs       # 自动格式检测
│   │   ├── decompress.rs            # 解压引擎（gzip/brotli/deflate）
│   │   ├── deserialize.rs           # 反序列化（MsgPack/Pickle/PHP/Java）
│   │   ├── protobuf.rs              # Protobuf 解析
│   │   └── models.rs                # 查看器数据模型
│   │
│   ├── tunnel/                      # SSH 隧道模块（独立）
│   │   ├── mod.rs                   # 模块入口
│   │   ├── commands.rs              # Tauri Commands
│   │   ├── service.rs               # SSH 隧道管理
│   │   └── models.rs                # SSH 配置模型
│   │
│   └── storage/                     # 存储模块（独立）
│       ├── mod.rs                   # 模块入口
│       ├── commands.rs              # Tauri Commands
│       ├── service.rs               # Tauri Store 封装
│       └── models.rs                # 存储数据模型
│
├── shared/                          # ====== 共享基础设施 ======
│   ├── error.rs                     # 统一错误处理（thiserror + anyhow）
│   ├── result.rs                    # 统一 Result 类型
│   ├── redis_client.rs              # Redis 客户端封装（redis-rs）
│   ├── event.rs                     # Tauri Events 定义
│   └── constants.rs                 # 全局常量
│
└── test/                            # ====== 集成测试 ======
    ├── connection_test.rs
    ├── key_test.rs
    ├── data_test.rs
    └── cli_test.rs
```

### 3.2 后端模块依赖关系

```
                    ┌─────────────────┐
                    │     lib.rs      │  ← Tauri 命令注册
                    └────────┬────────┘
                             │
        ┌────────┬───────────┼───────────┬────────┐
        │        │           │           │        │
   ┌────▼───┐ ┌──▼────┐ ┌───▼───┐ ┌────▼───┐ ┌──▼──────┐
   │connection│ │  key  │ │ data  │ │  cli   │ │  tool   │
   │  模块    │ │ 模块  │ │ 模块  │ │ 模块   │ │ 模块    │
   └────┬────┘ └───┬───┘ └───┬───┘ └────┬───┘ └────┬────┘
        │          │         │          │          │
        │     ┌────▼─────────▼──────────▼──────────▼────┐
        │     │              shared/                     │
        ├─────►  redis_client.rs  ← Redis 连接池封装     │
        ├─────►  error.rs         ← 统一错误处理         │
        ├─────►  event.rs         ← Tauri Events 定义    │
        │     └──────────────────────────────────────────┘
        │
   ┌────▼────┐
   │ tunnel  │  ← SSH 隧道（独立，被 connection 依赖）
   │  模块   │
   └─────────┘
   ┌─────────┐
   │ storage │  ← 存储模块（独立，被 connection 依赖）
   │  模块   │
   └─────────┘
   ┌─────────┐
   │ viewer  │  ← 查看器模块（独立，被 data 依赖）
   │  模块   │
   └─────────┘
```

### 3.3 后端各模块职责

#### 连接管理模块 `connection/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `connect`, `disconnect`, `get_status`, `list_connections` |
| `service.rs` | 连接生命周期管理 | `create_connection()`, `close_connection()`, `get_connection()` |
| `manager.rs` | 连接池管理 | `ConnectionManager` 单例，管理所有活跃连接 |
| `models.rs` | 数据模型 | `ConnectionConfig`, `ConnectionStatus`, `SshConfig`, `SslConfig` |

#### Key 操作模块 `key/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `scan_keys`, `get_key_type`, `get_key_ttl`, `rename_key`, `delete_key`, `set_ttl`, `persist_key` |
| `service.rs` | Key 操作逻辑 | 封装 TYPE/TTL/DEL/RENAME/PERSIST/SCAN 等命令 |
| `models.rs` | 数据模型 | `RedisKey`, `KeyScanResult`, `KeyTreeNode` |

#### 数据类型操作模块 `data/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `get_string`, `set_string`, `get_hash`, `hset`, `hdel`, `lrange`, `lset`, `sscan`, `srem`, `zrange`, `zadd`, `xrange`, `xadd` |
| `service.rs` | 数据类型路由 | 根据 key type 分发到对应子服务 |
| `hash_service.rs` | Hash 操作 | HGETALL/HSET/HDEL/HSCAN/HLEN/HTTL |
| `list_service.rs` | List 操作 | LRANGE/LSET/LPUSH/RPUSH/LPOP/RPOP |
| `set_service.rs` | Set 操作 | SMEMBERS/SSCAN/SREM/SADD/SCARD |
| `zset_service.rs` | ZSet 操作 | ZRANGE/ZSCAN/ZADD/ZREM/ZCARD/ZSCORE |
| `stream_service.rs` | Stream 操作 | XRANGE/XADD/XDEL/XLEN/XTRIM |
| `string_service.rs` | String 操作 | GET/SET/SETNX/SETEX/APPEND/STRLEN |
| `models.rs` | 数据模型 | `HashField`, `ListItem`, `SetMember`, `ZSetMember`, `StreamEntry` |

#### CLI 命令执行模块 `cli/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `execute_command`, `get_command_history`, `subscribe`, `monitor` |
| `service.rs` | 命令执行引擎 | 解析命令 → 构建 redis-rs Command → 执行 → 返回结果 |
| `parser.rs` | 命令参数解析 | `parse_command(input) → (cmd, args)` |
| `autocomplete.rs` | 自动补全 | 返回 Redis 命令列表 + 当前连接支持的命令 |
| `models.rs` | 数据模型 | `CliOutput`, `CommandHistory`, `SubscribeMessage` |

#### 工具模块 `tool/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `get_server_info`, `get_slowlog`, `get_memory_usage`, `start_monitor`, `stop_monitor` |
| `info_service.rs` | INFO 解析 | 解析 INFO ALL/INFO KEYSPACE/INFO CLUSTER |
| `slowlog_service.rs` | 慢日志 | SLOWLOG GET |
| `memory_service.rs` | 内存分析 | SCAN + MEMORY USAGE 批量分析 |
| `monitor_service.rs` | MONITOR | 实时监控 → Tauri Events 推送 |
| `models.rs` | 数据模型 | `ServerInfo`, `SlowLogEntry`, `MemoryEntry`, `MonitorEvent` |

#### SSH 隧道模块 `tunnel/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `create_tunnel`, `close_tunnel`, `get_tunnel_status` |
| `service.rs` | SSH 隧道管理 | 创建/关闭/保活 SSH 隧道 |
| `models.rs` | 数据模型 | `TunnelConfig`, `TunnelStatus` |

#### 数据查看器模块 `viewer/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `detect_format`, `decompress`, `deserialize_msgpack`, `deserialize_protobuf` |
| `format_detector.rs` | 格式检测 | 自动检测二进制数据的编码格式 |
| `decompress.rs` | 解压引擎 | gzip/brotli/deflate/deflate-raw 解压 |
| `deserialize.rs` | 反序列化 | MsgPack/Pickle/PHPSerialize/JavaSerialize 解析 |
| `protobuf.rs` | Protobuf 解析 | 加载 .proto 文件 → 动态解析 |
| `models.rs` | 数据模型 | `FormatType`, `DecompressResult`, `DeserializeResult` |

#### 存储模块 `storage/`

| 文件 | 职责 | 公开 API |
|---|---|---|
| `commands.rs` | 前端调用入口 | `save_connections`, `load_connections`, `save_settings`, `load_settings`, `export_connections`, `import_connections` |
| `service.rs` | 存储操作 | Tauri Store Plugin 封装 |
| `models.rs` | 数据模型 | `AppSettings`, `ConnectionExport` |

---

## 四、IPC 接口协议

### 4.1 Tauri Commands（前端 → 后端）

#### 连接管理

```rust
// 创建连接
#[tauri::command]
async fn connect(config: ConnectionConfig) -> Result<String, AppError>
// 返回: connection_id

// 断开连接
#[tauri::command]
async fn disconnect(connection_id: String) -> Result<(), AppError>

// 获取连接状态
#[tauri::command]
async fn get_connection_status(connection_id: String) -> Result<ConnectionStatus, AppError>

// 选择数据库
#[tauri::command]
async fn select_db(connection_id: String, db: u8) -> Result<(), AppError>

// 获取连接配置列表
#[tauri::command]
async fn list_connections() -> Result<Vec<ConnectionConfig>, AppError>

// 保存连接配置
#[tauri::command]
async fn save_connection(config: ConnectionConfig) -> Result<(), AppError>

// 删除连接配置
#[tauri::command]
async fn delete_connection(config_id: String) -> Result<(), AppError>
```

#### Key 操作

```rust
// SCAN 流式加载 Key
#[tauri::command]
async fn scan_keys(connection_id: String, pattern: String, count: u64, cursor: u64) -> Result<KeyScanResult, AppError>

// 获取 Key 类型
#[tauri::command]
async fn get_key_type(connection_id: String, key: String) -> Result<String, AppError>

// 获取 Key TTL
#[tauri::command]
async fn get_key_ttl(connection_id: String, key: String) -> Result<i64, AppError>

// 设置 Key TTL
#[tauri::command]
async fn set_key_ttl(connection_id: String, key: String, ttl: i64) -> Result<(), AppError>

// 移除 Key 过期时间
#[tauri::command]
async fn persist_key(connection_id: String, key: String) -> Result<(), AppError>

// 重命名 Key
#[tauri::command]
async fn rename_key(connection_id: String, old_key: String, new_key: String) -> Result<(), AppError>

// 删除 Key
#[tauri::command]
async fn delete_keys(connection_id: String, keys: Vec<String>) -> Result<u64, AppError>
// 返回: 删除的 Key 数量
```

#### 数据类型操作

```rust
// String 操作
#[tauri::command]
async fn get_string(connection_id: String, key: String) -> Result<Option<String>, AppError>

#[tauri::command]
async fn set_string(connection_id: String, key: String, value: String, ttl: Option<i64>) -> Result<(), AppError>

// Hash 操作
#[tauri::command]
async fn get_hash_all(connection_id: String, key: String) -> Result<Vec<HashField>, AppError>

#[tauri::command]
async fn hset(connection_id: String, key: String, field: String, value: String) -> Result<(), AppError>

#[tauri::command]
async fn hdel(connection_id: String, key: String, fields: Vec<String>) -> Result<u64, AppError>

// List 操作
#[tauri::command]
async fn lrange(connection_id: String, key: String, start: i64, stop: i64) -> Result<Vec<String>, AppError>

#[tauri::command]
async fn lset(connection_id: String, key: String, index: i64, value: String) -> Result<(), AppError>

// Set 操作
#[tauri::command]
async fn sscan(connection_id: String, key: String, cursor: u64, count: u64) -> Result<SetScanResult, AppError>

#[tauri::command]
async fn srem(connection_id: String, key: String, members: Vec<String>) -> Result<u64, AppError>

// ZSet 操作
#[tauri::command]
async fn zrange(connection_id: String, key: String, start: i64, stop: i64, reverse: bool) -> Result<Vec<ZSetMember>, AppError>

#[tauri::command]
async fn zadd(connection_id: String, key: String, members: Vec<ZSetMember>) -> Result<u64, AppError>

// Stream 操作
#[tauri::command]
async fn xrange(connection_id: String, key: String, start: String, end: String, count: u64) -> Result<Vec<StreamEntry>, AppError>

#[tauri::command]
async fn xadd(connection_id: String, key: String, fields: HashMap<String, String>) -> Result<String, AppError>
```

#### CLI 命令执行

```rust
// 执行任意 Redis 命令
#[tauri::command]
async fn execute_command(connection_id: String, command: String) -> Result<CliOutput, AppError>

// 获取命令历史
#[tauri::command]
async fn get_command_history(connection_id: String, limit: u32) -> Result<Vec<CommandHistory>, AppError>

// 订阅频道
#[tauri::command]
async fn subscribe(connection_id: String, channels: Vec<String>) -> Result<(), AppError>

// 取消订阅
#[tauri::command]
async fn unsubscribe(connection_id: String, channels: Vec<String>) -> Result<(), AppError>

// 启动 MONITOR
#[tauri::command]
async fn start_monitor(connection_id: String) -> Result<(), AppError>

// 停止 MONITOR
#[tauri::command]
async fn stop_monitor(connection_id: String) -> Result<(), AppError>
```

#### 工具命令

```rust
// 获取服务器信息
#[tauri::command]
async fn get_server_info(connection_id: String) -> Result<ServerInfo, AppError>

// 获取慢日志
#[tauri::command]
async fn get_slowlog(connection_id: String, count: u64) -> Result<Vec<SlowLogEntry>, AppError>

// 内存分析
#[tauri::command]
async fn analyze_memory(connection_id: String, pattern: String, count: u64) -> Result<Vec<MemoryEntry>, AppError>
```

#### 数据查看器

```rust
// 自动检测数据格式
#[tauri::command]
async fn detect_format(data: Vec<u8>) -> Result<FormatType, AppError>

// 解压数据
#[tauri::command]
async fn decompress(data: Vec<u8>, format: DecompressFormat) -> Result<Vec<u8>, AppError>

// 反序列化
#[tauri::command]
async fn deserialize(data: Vec<u8>, format: DeserializeFormat) -> Result<serde_json::Value, AppError>
```

### 4.2 Tauri Events（后端 → 前端推送）

| Event 名称 | 触发场景 | Payload 类型 | 消费模块 |
|---|---|---|---|
| `key:scan:progress` | SCAN 流式加载进度 | `{ cursor, keys, total }` | `key/` |
| `cli:output` | CLI 命令执行结果 | `{ output, error }` | `tool/cli-tab.tsx` |
| `cli:subscribe` | Pub/Sub 消息推送 | `{ channel, message }` | `tool/cli-tab.tsx` |
| `cli:monitor` | MONITOR 实时输出 | `{ timestamp, command, args }` | `tool/cli-tab.tsx` |
| `tool:command-log` | 命令日志拦截 | `{ timestamp, command, duration }` | `tool/command-log.tsx` |
| `connection:status` | 连接状态变化 | `{ connection_id, status }` | `connection/` |
| `memory:analysis:progress` | 内存分析进度 | `{ scanned, total, entries }` | `tool/memory-analysis.tsx` |

---

## 五、TypeScript 类型定义

### 5.1 核心类型 `types/connection.ts`

```typescript
/** 连接配置 */
export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  auth?: string
  username?: string
  db?: number
  separator?: string

  // 高级连接选项
  cluster?: ClusterConfig
  sentinel?: SentinelConfig
  ssh?: SshConfig
  ssl?: SslConfig

  // 行为选项
  readOnly?: boolean
  retryStrategy?: RetryStrategy
}

export interface SshConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string      // 文件路径
  passphrase?: string
}

export interface SslConfig {
  enabled: boolean
  ca?: string               // CA 证书路径
  cert?: string             // 客户端证书路径
  key?: string              // 客户端密钥路径
  rejectUnauthorized?: boolean
}

export interface SentinelConfig {
  hosts: Array<{ host: string; port: number }>
  masterName: string
  password?: string
  username?: string
}

export interface ClusterConfig {
  nodes: Array<{ host: string; port: number }>
  natMap?: Record<string, { host: string; port: number }>
}

export type RetryStrategy = 'none' | 'fixed' | 'exponential'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
```

### 5.2 核心类型 `types/redis-key.ts`

```typescript
export interface RedisKey {
  name: string
  type: KeyType
  ttl: number              // -1 = 永久, -2 = 已过期
  size?: number
}

export type KeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'rejson' | 'unknown'

export interface KeyScanResult {
  cursor: number           // 0 表示扫描完成
  keys: string[]
  total: number
}

export interface KeyTreeNode {
  name: string
  fullPath: string
  children?: KeyTreeNode[]
  keyCount: number
  isKey: boolean           // true = 实际 Key, false = 路径节点
}
```

### 5.3 核心类型 `types/redis-data.ts`

```typescript
export interface HashField {
  field: string
  value: string
  ttl?: number             // Redis 7.4+ Hash Field TTL
}

export interface ZSetMember {
  member: string
  score: number
}

export interface StreamEntry {
  id: string
  fields: Record<string, string>
}

export interface SetScanResult {
  cursor: number
  members: string[]
}
```

### 5.4 核心类型 `types/ipc.ts`

```typescript
/** IPC 统一响应 */
export type IpcResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: IpcError }

export interface IpcError {
  code: string
  message: string
  detail?: string
}

/** Tauri Event Payload 类型 */
export interface ScanProgressEvent {
  cursor: number
  keys: string[]
  total: number
}

export interface CliOutputEvent {
  output?: string
  error?: string
}

export interface SubscribeEvent {
  channel: string
  message: string
}

export interface MonitorEvent {
  timestamp: number
  command: string
  args: string[]
}

export interface CommandLogEvent {
  timestamp: number
  command: string
  duration: number
}
```

---

## 六、模块独立可测试性设计

### 6.1 前端模块测试策略

| 模块 | 测试方式 | 独立性保证 |
|---|---|---|
| `connection/` | Mock `connection-service.ts` 测试组件交互 | 组件不直接调用 Tauri invoke |
| `key/` | Mock `key-service.ts` + VTable 渲染测试 | VTable 实例通过 `use-vtable.ts` 管理 |
| `content/` | Mock `data-service.ts` 测试各类型编辑器 | 每个编辑器组件完全独立 |
| `tool/` | Mock `cli-service.ts` + `tool-service.ts` | CLI 输出通过 Events 接收 |
| `viewer/` | Mock `viewer-service.ts` 测试格式检测 | 查看器组件无状态依赖 |
| `services/` | Mock Tauri invoke 测试 IPC 调用 | Service 层是唯一调用 Tauri 的地方 |

### 6.2 后端模块测试策略

| 模块 | 测试方式 | 独立性保证 |
|---|---|---|
| `connection/` | 单元测试 + 本地 Redis 集成测试 | `ConnectionManager` 可注入 Mock Redis 客户端 |
| `key/` | 单元测试 + 本地 Redis 集成测试 | 依赖 `redis_client` trait，可 Mock |
| `data/` | 各子服务独立单元测试 | 每个子服务（hash/list/set/...）完全独立 |
| `cli/` | 命令解析单元测试 + 执行集成测试 | `parser.rs` 纯函数，完全可测试 |
| `tool/` | INFO 解析单元测试 + 集成测试 | `info_service.rs` 解析逻辑纯函数 |
| `viewer/` | 格式检测 + 解压/反序列化单元测试 | 使用固定测试数据，不依赖外部 |
| `tunnel/` | SSH 隧道集成测试（需 SSH 服务器） | 可跳过或使用 Docker 测试环境 |
| `storage/` | Tauri Store 单元测试 | 使用临时目录 |

### 6.3 关键设计模式

1. **Service 层隔离**：前端所有 Tauri invoke 调用都封装在 `services/` 层，组件只调用 Service 函数
2. **Trait 抽象**：后端通过 Rust trait 定义 Redis 客户端接口，支持 Mock 注入
3. **事件驱动**：流式数据（SCAN/Pub/Sub/MONITOR）通过 Tauri Events 推送，前后端解耦
4. **类型安全**：前后端通过 `types/ipc.ts` 和 Rust struct 共享接口定义
5. **模块边界**：每个模块有独立的 `mod.rs`、`commands.rs`、`service.rs`、`models.rs`，职责清晰

---

## 七、技术选型汇总

| 领域 | 选型 | 版本 | 说明 |
|---|---|---|---|
| **桌面框架** | Tauri | 2.x | Rust 后端 + WebView 前端 |
| **前端框架** | Vue 3 | 3.5+ | Composition API + TSX |
| **UI 库** | Element Plus | 2.x | 全局注册，仅用于对话框/表单/菜单等 |
| **表格/树/虚拟列表** | @visactor/vtable | latest | Canvas 渲染，统一替代 vxe-table + vue-virtual-scroller + vue-easy-tree |
| **Vue3 表格封装** | @visactor/vue-vtable | latest | VTable 的 Vue3 官方组件封装 |
| **代码编辑器** | monaco-editor-vue3 | latest | Monaco Editor 的 Vue3 原生封装 |
| **国际化** | vue-i18n | 9.x | Vue3 兼容 |
| **快捷键** | @vueuse/core | latest | useMagicKeys |
| **拖拽排序** | vuedraggable | next | Vue3 兼容 |
| **构建工具** | Rsbuild | latest | 基于 Rspack |
| **Redis 客户端** | redis-rs | 0.25+ | tokio 异步，支持 Cluster |
| **SSH 隧道** | ssh2 | 0.9+ | Rust SSH2 协议实现 |
| **错误处理** | thiserror + anyhow | latest | Rust 错误处理最佳实践 |
| **序列化** | serde + serde_json | latest | Rust 序列化框架 |
| **存储** | tauri-plugin-store | 2.x | Tauri 官方存储插件 |
