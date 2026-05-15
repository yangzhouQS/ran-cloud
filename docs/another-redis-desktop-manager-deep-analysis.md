# AnotherRedisDesktopManager 深度分析文档

> 基于对所有源文件的逐行阅读，全面分析模块设计、架构设计、功能设计和设计规范。

---

## 一、项目概览

### 1.1 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron | 12.x |
| 前端框架 | Vue | 2.6.x (Options API) |
| UI 组件库 | Element UI | 2.x (size: small) |
| 数据表格 | vxe-table | 3.9.x |
| 虚拟树 | @qii401/vue-easy-tree | - |
| 虚拟滚动 | vue-virtual-scroller (RecycleScroller) | - |
| Redis 客户端 | ioredis | 5.3.x |
| SSH 隧道 | tunnel-ssh | 5.1.x |
| JSON 编辑器 | monaco-editor | 0.30.x |
| 构建工具 | Webpack | 4.x |
| 国际化 | vue-i18n | 8.x (14 种语言) |
| 快捷键 | keymaster | - |
| 拖拽排序 | SortableJS | - |
| 命令解析 | @qii401/redis-splitargs | - |
| 大数 JSON | @qii401/json-bigint | - |
| 格式解码 | protobufjs, rawproto, php-serialize, algo-msgpack-with-bigint, java-object-serialization, pickleparser | - |
| 压缩解压 | zlib (Node.js 内置), brotli (Node.js 内置) | - |

### 1.2 项目结构

```
AnotherRedisDesktopManager/
├── build/                          # Webpack 构建配置
│   ├── webpack.base.conf.js        # 基础配置
│   ├── webpack.dev.conf.js         # 开发配置
│   ├── webpack.prod.conf.js        # 生产配置
│   ├── utils.js                    # 构建工具函数
│   ├── vue-loader.conf.js          # Vue Loader 配置
│   ├── build.js                    # 构建入口
│   └── check-versions.js           # Node/NPM 版本检查
├── config/                         # 环境配置
│   ├── index.js                    # 主配置（端口、代理等）
│   ├── dev.env.js                  # 开发环境变量
│   └── prod.env.js                 # 生产环境变量
├── pack/                           # Electron 打包
│   ├── electron/
│   │   ├── electron-main.js        # Electron 主进程
│   │   ├── update.js               # 自动更新
│   │   ├── win-state.js            # 窗口状态持久化
│   │   ├── font-manager.js         # 字体管理
│   │   ├── package.json            # Electron 应用 package
│   │   └── icons/                  # 应用图标
│   └── scripts/
│       └── notarize.js             # macOS 公证
├── src/                            # 前端源码
│   ├── main.js                     # Vue 入口
│   ├── App.vue                     # 根组件
│   ├── Aside.vue                   # 侧边栏组件
│   ├── bus.js                      # 事件总线
│   ├── shortcut.js                 # 快捷键管理
│   ├── addon.js                    # CLI 参数/字体/缩放初始化
│   ├── util.js                     # 核心工具函数
│   ├── storage.js                  # localStorage 持久化
│   ├── redisClient.js              # Redis 连接工厂
│   ├── commands.js                 # Redis 命令分类
│   ├── router/
│   │   └── index.js                # 路由（单页无路由）
│   ├── i18n/
│   │   ├── i18n.js                 # i18n 配置
│   │   └── langs/                  # 14 种语言文件
│   ├── components/                 # 业务组件
│   │   ├── contents/               # 数据类型编辑器（7 个）
│   │   ├── viewers/                # 格式查看器（16 个）
│   │   └── *.vue                   # 其他组件
│   └── assets/                     # 静态资源
├── static/                         # 静态文件
│   └── theme/
│       ├── light/                  # 亮色主题 CSS
│       └── dark/                   # 暗色主题 CSS
├── index.html                      # HTML 入口
├── package.json                    # 项目配置
├── babel.config.json               # Babel 配置
├── .postcssrc.js                   # PostCSS 配置
└── element-variables.scss          # Element UI 主题变量
```

---

## 二、架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 主进程                        │
│  electron-main.js                                       │
│  ├── BrowserWindow (窗口管理)                             │
│  ├── IPC 通信 (主题/字体/窗口控制)                          │
│  ├── nativeTheme (系统主题监听)                            │
│  ├── auto-update (自动更新)                               │
│  └── win-state (窗口位置/大小持久化)                       │
└──────────────────────┬──────────────────────────────────┘
                       │ IPC
┌──────────────────────┴──────────────────────────────────┐
│                   Electron 渲染进程                        │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Vue 2 全局实例                           │ │
│  │  Vue.prototype.$bus = 事件总线                        │ │
│  │  Vue.prototype.$util = 工具函数                       │ │
│  │  Vue.prototype.$storage = 存储管理                    │ │
│  │  Vue.prototype.$shortcut = 快捷键管理                 │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────┐  ┌──────────────────────────────────────┐  │
│  │  Aside    │  │            Tabs (主内容区)            │  │
│  │  侧边栏   │  │                                      │  │
│  │           │  │  ┌────────┐ ┌────────┐ ┌─────────┐  │  │
│  │ ┌───────┐ │  │  │Status  │ │CliTab  │ │KeyDetail│  │  │
│  │ │Conn.  │ │  │  │服务器   │ │命令行   │ │键详情    │  │  │
│  │ │List   │ │  │  └────────┘ └────────┘ └─────────┘  │  │
│  │ └───────┘ │  │  ┌────────┐ ┌────────┐              │  │
│  │ ┌───────┐ │  │  │DelBatch│ │Memory  │              │  │
│  │ │KeyList│ │  │  │批量删除 │ │Analysis│              │  │
│  │ │Tree   │ │  │  └────────┘ └────────┘              │  │
│  │ └───────┘ │  │  ┌────────┐                         │  │
│  │           │  │  │SlowLog │                         │  │
│  │           │  │  └────────┘                         │  │
│  └──────────┘  └──────────────────────────────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │               核心服务层                               │ │
│  │  redisClient.js ← ioredis 连接工厂                    │ │
│  │  storage.js     ← localStorage 持久化                │ │
│  │  util.js        ← Buffer/格式检测/树构建              │ │
│  │  commands.js    ← Redis 命令分类                      │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 2.2 核心设计模式

#### 2.2.1 事件总线模式（Event Bus）

[`bus.js`](AnotherRedisDesktopManager/src/bus.js) 创建一个空 Vue 实例作为全局事件中心：

```javascript
const bus = new Vue();
// 注入到 Vue.prototype.$bus
```

**所有跨组件通信**通过 `$bus.$emit/$on/$off` 实现，这是项目最核心的设计模式。

**关键事件清单：**

| 事件名 | 发送者 | 接收者 | 用途 |
|--------|--------|--------|------|
| `refreshConnections` | Setting, ConnectionMenu | Connections | 刷新连接列表 |
| `openConnection` | Connections | ConnectionWrapper | 打开连接 |
| `closeConnection` | App.vue, ConnectionMenu | ConnectionWrapper | 关闭连接 |
| `clickedKey` | KeyListVirtualTree, KeyHeader | Tabs | 打开键详情 Tab |
| `openStatus` | ConnectionMenu | Tabs | 打开服务器状态 Tab |
| `openCli` | ConnectionMenu | Tabs | 打开 CLI Tab |
| `openDelBatch` | KeyListVirtualTree, ConnectionMenu | Tabs | 打开批量删除 Tab |
| `memoryAnalysis` | KeyListVirtualTree, ConnectionMenu | Tabs | 打开内存分析 Tab |
| `slowLog` | ConnectionMenu | Tabs | 打开慢日志 Tab |
| `refreshKeyList` | KeyHeader, CliTab, DeleteBatch | KeyList | 刷新键列表 |
| `removePreTab` | KeyHeader, Tabs | Tabs | 关闭当前 Tab |
| `removeAllTab` | ConnectionWrapper | Tabs | 关闭所有 Tab |
| `changeDb` | CliTab, OperateItem | CliTab | 切换数据库 |
| `commandLog` | redisClient (monkey-patch) | CommandLog | 记录执行命令 |
| `reloadSettings` | Setting | KeyList, ConnectionWrapper | 重新加载设置 |
| `update-check` | Setting | UpdateCheck | 检查更新 |
| `addCustomFormatter` | FormatViewer | Aside | 添加自定义格式化器 |
| `refreshViewers` | CustomFormatter | FormatViewer | 刷新查看器列表 |
| `changeMatchMode` | KeyListVirtualTree | OperateItem | 更改搜索模式 |

#### 2.2.2 全局原型注入模式

[`main.js`](AnotherRedisDesktopManager/src/main.js:8) 将核心模块注入到 Vue 原型链：

```javascript
Vue.prototype.$bus = bus;           // 事件总线
Vue.prototype.$util = util;         // 工具函数
Vue.prototype.$storage = storage;   // 存储管理
Vue.prototype.$shortcut = shortcut; // 快捷键
```

所有组件通过 `this.$bus`、`this.$util`、`this.$storage`、`this.$shortcut` 直接访问，**无需 import**。

#### 2.2.3 连接工厂模式

[`redisClient.js`](AnotherRedisDesktopManager/src/redisClient.js) 是 Redis 连接的工厂，根据配置创建不同类型的连接：

```
createRedisClient(config)
├── config.ssh → createSSHConnection(config)
│   ├── SSH + Standalone
│   ├── SSH + Cluster (多隧道 + NAT 映射)
│   └── SSH + Sentinel
├── config.sentinel → createConnection() with sentinelOptions
├── config.cluster → new Redis.Cluster()
└── 默认 → new Redis() (standalone)
```

**关键特性：**
- 命令日志：通过 monkey-patch `Redis.prototype.sendCommand`，每次命令执行后 emit `commandLog` 事件
- 只读模式：检查 `writeCMD` 列表，阻止写命令执行
- 重试策略：最多 3 次，指数退避
- Cluster NAT 映射：SSH+Cluster 模式下，将远程节点地址映射为本地隧道地址

#### 2.2.4 动态组件模式

项目大量使用 Vue 的 `<component :is="xxx">` 动态组件：

1. **KeyDetail** → 根据 `keyType` 动态选择内容组件：
   - `string` → KeyContentString
   - `hash` → KeyContentHash
   - `set` → KeyContentSet
   - `zset` → KeyContentZset
   - `list` → KeyContentList
   - `stream` → KeyContentStream
   - `ReJSON-RL`/`json`/`tair-json` → KeyContentReJson

2. **FormatViewer** → 根据 `selectedView` 动态选择查看器：
   - Text, Hex, Json, Binary, Msgpack, PHPSerialize, JavaSerialize, Pickle
   - Brotli, Gzip, Deflate, DeflateRaw, Protobuf, OverSize, Custom

3. **KeyList** → 使用 `keyListType` 动态渲染（当前固定为 KeyListVirtualTree）

#### 2.2.5 流式扫描模式（Stream Scan）

所有键列表和内容加载都使用 ioredis 的 `scanBufferStream` 流式 API：

```
SCAN 流程:
1. 创建 scanStream (match, count)
2. stream.on('data') → 累积数据
3. 达到 pageSize → stream.pause()
4. 用户点击 "Load More" → stream.resume()
5. stream.on('end') → 扫描完成
```

**使用流式扫描的组件：**
- `KeyList.vue` → `scanBufferStream` (键列表)
- `KeyContentHash.vue` → `hscanBufferStream` (Hash 字段)
- `KeyContentSet.vue` → `sscanBufferStream` (Set 成员)
- `KeyContentZset.vue` → `zscanBufferStream` (ZSet 成员搜索模式)
- `MemoryAnalysis.vue` → `scanBufferStream` + `MEMORY USAGE`
- `DeleteBatch.vue` → `scanBufferStream` (批量删除扫描)

### 2.3 数据流

```
用户操作 → 组件方法 → ioredis 命令 → Redis 服务器
                ↓
         $bus.$emit(event) → 其他组件响应
                ↓
         $storage.saveXxx() → localStorage 持久化
```

**无状态管理库**：项目不使用 Vuex/Pinia，所有状态通过以下方式管理：
1. 组件 `data()` 本地状态
2. `$bus` 事件跨组件通信
3. `$storage` (localStorage) 持久化
4. `props` 父子组件传递

---

## 三、模块设计

### 3.1 入口模块

#### [`main.js`](AnotherRedisDesktopManager/src/main.js)

**职责**：Vue 应用入口，全局配置

```javascript
// 关键初始化：
Vue.use(ElementUI, { size: 'small' });     // Element UI 小尺寸
Vue.prototype.$bus = bus;                   // 事件总线
Vue.prototype.$util = util;                 // 工具函数
Vue.prototype.$storage = storage;           // 存储管理
Vue.prototype.$shortcut = shortcut;         // 快捷键

// 全局异常处理
Vue.config.errorHandler = () => $bus.$emit('closeConnection');
```

#### [`addon.js`](AnotherRedisDesktopManager/src/addon.js)

**职责**：Electron 环境初始化（CLI 参数、字体、缩放、链接跳转）

- 解析 CLI 参数：`--host`, `--port`, `--auth`, `--ssh-host`, `--sentinel-master-name`, `--ssl` 等
- 初始化字体：通过 IPC 获取系统字体列表
- 初始化缩放：读取 localStorage 中的 zoomFactor
- 外部链接跳转：拦截 `href` 点击，用 `shell.openExternal()` 打开

### 3.2 核心服务模块

#### [`util.js`](AnotherRedisDesktopManager/src/util.js) — 工具函数库（391 行）

**Buffer 处理**：
| 函数 | 用途 |
|------|------|
| `bufVisible(buf)` | 判断 Buffer 是否可显示为文本 |
| `bufToString(buf)` | Buffer → UTF-8 字符串 |
| `bufToHex(buf)` | Buffer → Hex 字符串 |
| `xToBuffer(str)` | Hex/UTF-8 字符串 → Buffer |
| `bufToBinary(buf)` | Buffer → 二进制字符串 |
| `binaryStringToBuffer(str)` | 二进制字符串 → Buffer |
| `bufToQuotation(buf)` | Buffer 带引号的字符串表示 |

**格式自动检测**（按优先级）：
1. `isJson()` — JSON 格式
2. `isPHPSerialize()` — PHP 序列化（`a:`, `s:`, `i:` 等）
3. `isJavaSerialize()` — Java 序列化（`0xaced0005` 魔数）
4. `isPickle()` — Python Pickle（`0x80` 协议头）
5. `isMsgpack()` — MessagePack
6. `isBrotli()` — Brotli 压缩
7. `isGzip()` — Gzip 压缩（`0x1f8b` 魔数）
8. `isDeflate()` — Deflate 压缩
9. `isProtobuf()` — Protobuf 编码
10. `isDeflateRaw()` — Raw Deflate

**键树构建**：
- `keysToTree(keys, separator)` — 将扁平键名列表转为层级树结构
- `keysToList(keys)` — 无分隔符时直接转列表
- `formatTreeData()` — 递归构建树节点（含 keyCount 统计）
- `sortKeysAndFolder()` — 文件夹优先排序

**其他工具**：
- `humanFileSize(bytes)` — 人类可读文件大小
- `leftTime(seconds)` — TTL 剩余时间格式化
- `copyToClipboard(text)` — 复制到剪贴板（通过 Electron clipboard）
- `debounce(fn, delay)` — 防抖
- `createAndDownloadFile(name, content)` — 创建并下载文件

#### [`storage.js`](AnotherRedisDesktopManager/src/storage.js) — 持久化管理（193 行）

**存储结构**（全部在 localStorage）：

| Key | 内容 |
|-----|------|
| `connections` | 所有连接配置（JSON 数组） |
| `settings` | 全局设置（字体、缩放、分页大小） |
| `custom_formatter` | 自定义格式化器列表 |
| `cliTips_{name}` | 每个连接的 CLI 命令历史 |
| `lastSelectedDb_{name}` | 每个连接最后选择的 DB |
| `customDbName_{name}` | 每个连接的自定义 DB 名称 |
| `searchTips_{name}` | 每个连接的搜索历史 |
| `theme` | 主题模式 (system/light/dark) |
| `sidebar_width` | 侧边栏宽度 |

**连接 CRUD**：
```javascript
storage.getConnections(sorted)     // 获取所有连接
storage.addConnection(config)      // 添加连接
storage.editConnectionByKey(key, config) // 编辑连接
storage.deleteConnection(key)      // 删除连接（含清理）
```

#### [`redisClient.js`](AnotherRedisDesktopManager/src/redisClient.js) — 连接工厂（380 行）

**连接类型矩阵**：

| 模式 | ioredis API | 特殊处理 |
|------|-------------|----------|
| Standalone | `new Redis(options)` | 基础连接 |
| Cluster | `new Redis.Cluster(nodes, options)` | natMap 地址映射 |
| Sentinel | `new Redis(sentinelOptions)` | sentinels 列表 |
| SSH + Standalone | `tunnel-ssh` → `new Redis` | SSH 隧道端口映射 |
| SSH + Cluster | 多个 `tunnel-ssh` → `new Redis.Cluster` | 每个节点一条隧道 |
| SSH + Sentinel | `tunnel-ssh` → `new Redis(sentinelOptions)` | 隧道到 Sentinel |

**全局行为注入**：
```javascript
// 命令日志
const originSendCommand = Redis.prototype.sendCommand;
Redis.prototype.sendCommand = function(command) {
  $bus.$emit('commandLog', command);
  return originSendCommand.call(this, command);
};

// 只读模式
Redis.prototype.sendCommand = function(command) {
  if (writeCMD[command.name]) {
    return; // 阻止写命令
  }
};
```

#### [`commands.js`](AnotherRedisDesktopManager/src/commands.js) — 命令分类（200 行）

三大分类：
- **adminCMD** — 管理命令（ACL, CONFIG, CLUSTER, DEBUG, INFO...）
- **readCMD** — 读命令（GET, HGET, SCAN, TYPE, TTL...）
- **writeCMD** — 写命令（SET, DEL, HSET, LPUSH, SADD, ZADD, FLUSHDB...）

导出 `{ allCMD, writeCMD }`，其中 `allCMD` 用于 CLI 自动补全提示。

### 3.3 布局组件

#### [`App.vue`](AnotherRedisDesktopManager/src/App.vue) — 根布局

```
┌──────────────────────────────────────────────┐
│ ┌──────────┐ ┌────────────────────────────┐  │
│ │  Aside    │ │         Tabs               │  │
│ │  侧边栏   │ │         主内容区            │  │
│ │ (可拖拽宽) │ │                            │  │
│ │ 200~1500px│ │                            │  │
│ └──────────┘ └────────────────────────────┘  │
│                          UpdateCheck 浮层     │
└──────────────────────────────────────────────┘
```

- 侧边栏宽度可拖拽调整，持久化到 localStorage
- 暗色模式通过 CSS class `.dark-mode` 控制
- 监听 `reloadSettings` 事件更新全局设置

#### [`Aside.vue`](AnotherRedisDesktopManager/src/Aside.vue) — 侧边栏

包含：
- 顶部按钮栏：CommandLog、Settings、New Connection
- Connections 组件列表
- NewConnectionDialog 弹窗
- Setting 弹窗
- CommandLog 弹窗
- HotKeys 弹窗
- CustomFormatter 弹窗

快捷键：`Ctrl+N` (新建连接), `Ctrl+,` (设置), `Ctrl+G` (命令日志)

### 3.4 连接管理模块

#### [`Connections.vue`](AnotherRedisDesktopManager/src/components/Connections.vue)

- 连接列表渲染，支持搜索过滤（≥4 个连接时显示搜索框）
- SortableJS 拖拽排序，更新 `order` 字段
- 监听 `refreshConnections` 事件刷新列表

#### [`ConnectionWrapper.vue`](AnotherRedisDesktopManager/src/components/ConnectionWrapper.vue)

**每个连接的容器组件**，管理连接生命周期：

```
ConnectionWrapper
├── ConnectionMenu    (连接标题、操作按钮)
├── OperateItem       (DB 选择、搜索、新建键)
└── KeyList           (键列表)
```

**生命周期**：
1. `created` → 调用 `redisClient.createRedisClient()` 创建连接
2. `pingInterval` → 每 30 秒 PING 保活
3. 关闭时 → `client.quit()` + 清除定时器

**自定义颜色**：每个连接可设置颜色，通过 CSS 变量 `--menu-color` 应用

#### [`ConnectionMenu.vue`](AnotherRedisDesktopManager/src/components/ConnectionMenu.vue)

**连接操作菜单**：

| 操作 | 功能 |
|------|------|
| Status | 打开服务器状态 Tab |
| CLI | 打开命令行 Tab |
| Refresh | 刷新 DB 键数量 |
| Close | 关闭连接 |
| Edit | 编辑连接配置 |
| Delete | 删除连接 |
| Duplicate | 复制连接 |
| Color | 设置连接颜色 |
| Memory Analysis | 内存分析 |
| Slow Log | 慢日志 |
| Import Keys | 导入键（CSV → RESTORE） |
| Import CMD | 导入命令（文件 → 逐行执行） |
| FlushDB | 清空数据库（需输入确认） |

#### [`NewConnectionDialog.vue`](AnotherRedisDesktopManager/src/components/NewConnectionDialog.vue)

**连接配置表单**：

| 分区 | 字段 |
|------|------|
| 基础 | host, port, password, username, connection name, separator |
| SSH | host, port, username, password, private key, passphrase, timeout |
| SSL | key, ca, cert, SNI |
| Sentinel | nodePassword, masterName |
| Cluster | 开关 |
| Readonly | 开关 |

#### [`OperateItem.vue`](AnotherRedisDesktopManager/src/components/OperateItem.vue)

**数据库操作栏**：

- **DB 选择器**：显示每个 DB 的键数量，支持自定义名称，可过滤
- **搜索框**：带自动补全历史，支持精确匹配模式
- **新建键**：选择类型（String/Hash/List/Set/Zset/Stream/ReJSON），输入键名
- **取消扫描**：长时间扫描时显示取消按钮

### 3.5 键管理模块

#### [`KeyList.vue`](AnotherRedisDesktopManager/src/components/KeyList.vue)

**键列表容器**，管理 SCAN 生命周期：

```
SCAN 流程:
1. initScanStreamsAndScan()
   ├── 单机: [client]
   └── 集群: client.nodes('master')
2. 每个节点创建 scanBufferStream
3. data 事件 → keyList.concat(keys)
4. 达到 pageSize → stream.pause()
5. Load More → stream.resume()
6. Load All → 重新创建 scanStream(count=50000)
```

**集群优化**：`keysPageSize` 除以 master 节点数

**导出功能**：DUMP + PTTL → CSV 文件下载

#### [`KeyListVirtualTree.vue`](AnotherRedisDesktopManager/src/components/KeyListVirtualTree.vue)（622 行）

**虚拟树组件**，核心渲染组件：

- 使用 `@qii401/vue-easy-tree` 实现虚拟滚动
- 树节点由 `util.keysToTree()` 从扁平键名构建
- 节点限制 200,000（超出截断并警告）
- 展开状态通过 `expandedKeys: Set` 维护
- 右键菜单：文件夹（多选/内存分析/加载当前文件夹/删除文件夹）、键（复制/删除/多选/新标签打开/导出）
- 多选模式：Shift 批量勾选、全选/取消全选、批量删除/导出

#### [`KeyDetail.vue`](AnotherRedisDesktopManager/src/components/KeyDetail.vue)

**键详情容器**，根据类型动态选择内容组件：

```javascript
const typeMap = {
  string: 'KeyContentString',
  hash: 'KeyContentHash',
  zset: 'KeyContentZset',
  set: 'KeyContentSet',
  list: 'KeyContentList',
  stream: 'KeyContentStream',
  'ReJSON-RL': 'KeyContentReJson',
  json: 'KeyContentReJson',       // Upstash Redis
  'tair-json': 'KeyContentReJson', // Tair Redis
};
```

#### [`KeyHeader.vue`](AnotherRedisDesktopManager/src/components/KeyHeader.vue)

**键头部操作栏**：

| 操作 | 快捷键 | 功能 |
|------|--------|------|
| 重命名 | Enter | RENAME 命令（需输入 'y' 确认） |
| TTL | Enter | EXPIRE 命令 |
| Persist | 点击图标 | PERSIST 命令（移除过期） |
| 删除 | Ctrl+D | DEL 命令（需确认） |
| 刷新 | Ctrl+R / F5 | 重新加载键内容 |
| 自动刷新 | 开关 | 每 2 秒自动刷新 |
| Dump | 按钮 | 复制 RESTORE 命令到剪贴板 |

### 3.6 数据类型编辑模块

所有内容组件遵循统一模式：

| 特性 | String | Hash | List | Set | ZSet | Stream | ReJSON |
|------|--------|------|------|-----|------|--------|--------|
| 数据加载 | GET | HSCAN | LRANGE | SSCAN | ZRANGE/ZSCAN | XREVRANGE | JSON.GET |
| 分页加载 | - | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| 新增行 | - | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| 编辑行 | - | ✅ | ✅ | ✅ | ✅ | 只读 | - |
| 删除行 | - | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| 搜索过滤 | - | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Dump 命令 | SET | HSET | RPUSH | SADD | ZADD | XADD | JSON.SET |
| 保存 | SET | HSET | LINSERT+LREM | SADD+SREM | ZADD+ZREM | XADD | JSON.SET |
| 快捷键保存 | Ctrl+S | - | - | - | - | - | Ctrl+S |
| 表格组件 | - | vxe-table | vxe-table | vxe-table | vxe-table | vxe-table | - |
| 特殊功能 | - | HTTL (7.4+) | - | - | ASC/DESC 切换 | Groups/Consumers | - |

#### [`KeyContentHash.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentHash.vue)
- 使用 `hscanBufferStream` 流式加载
- 支持 Redis 7.4+ 的 `HTTL`/`HEXPIRE` 字段级 TTL
- 编辑时如果 field 变更，自动 `HDEL` 旧 field

#### [`KeyContentList.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentList.vue)
- 使用 `LRANGE` 分页加载（pageIndex × pageSize）
- 编辑使用 `LINSERT AFTER` + `LREM` 保持顺序
- 递归加载直到填满 pageSize

#### [`KeyContentSet.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentSet.vue)
- 使用 `sscanBufferStream` 流式加载
- 编辑使用 `SADD` 新值 + `SREM` 旧值

#### [`KeyContentZset.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentZset.vue)
- 默认模式：`ZREVRANGE`/`ZRANGE` 有序分页
- 搜索模式：`zscanBufferStream` 无序扫描
- 支持 ASC/DESC 排序切换

#### [`KeyContentStream.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentStream.vue)
- 使用 `XREVRANGE` 按时间倒序加载
- 支持 Min/Max ID 过滤
- Groups/Consumers 信息查看（`XINFO GROUPS`/`XINFO CONSUMERS`）
- 只能新增 Stream Entry，不能编辑

#### [`KeyContentString.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentString.vue) / [`KeyContentReJson.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentReJson.vue)
- 单值编辑，使用 FormatViewer 显示和编辑
- Ctrl+S 保存
- ReJSON 使用 `JSON.GET`/`JSON.SET` 命令

### 3.7 格式查看器模块

#### [`FormatViewer.vue`](AnotherRedisDesktopManager/src/components/FormatViewer.vue) — 格式查看器容器

**自动格式检测链**（首次加载时自动执行）：

```
content 为空 → Text
content > 20MB → OverSize
isJson → Json
isPHPSerialize → PHPSerialize
isJavaSerialize → JavaSerialize
isPickle → Pickle
isMsgpack → Msgpack
isBrotli → Brotli
isGzip → Gzip
isDeflate → Deflate
isProtobuf → Protobuf
isDeflateRaw → DeflateRaw
!bufVisible → Hex
默认 → Text
```

**14 个内置查看器 + 自定义查看器**：

| 查看器 | 功能 | 可编辑 |
|--------|------|--------|
| ViewerText | 纯文本 textarea | ✅ |
| ViewerHex | Hex 显示 | ✅ |
| ViewerJson | Monaco Editor (JSON 高亮) | ✅ |
| ViewerBinary | 二进制显示 | ❌ |
| ViewerMsgpack | MessagePack 解码 | ✅ |
| ViewerPHPSerialize | PHP 反序列化 | ✅ |
| ViewerJavaSerialize | Java 反序列化 (只读) | ❌ |
| ViewerPickle | Python Pickle 解码 | ✅ |
| ViewerBrotli | Brotli 解压 | ✅ |
| ViewerGzip | Gzip 解压 | ✅ |
| ViewerDeflate | Deflate 解压 | ✅ |
| ViewerDeflateRaw | Raw Deflate 解压 | ✅ |
| ViewerProtobuf | Protobuf 解码 (树形显示) | ✅ |
| ViewerOverSize | 大文件提示 (>20MB) | ❌ |
| ViewerCustom | 用户自定义 JS 格式化 | ✅ |

### 3.8 CLI 模块

#### [`CliTab.vue`](AnotherRedisDesktopManager/src/components/CliTab.vue)（466 行）

**完整的 Redis 命令行模拟器**：

**核心功能**：
- 命令输入：`el-autocomplete` + Redis 命令自动补全
- 命令历史：上下箭头浏览，持久化到 localStorage
- 命令解析：`@qii401/redis-splitargs` 解析参数（支持引号、转义）
- 结果展示：递归格式化 Buffer/Array/Object

**特殊命令处理**：

| 命令 | 行为 |
|------|------|
| `exit`/`quit` | 关闭 CLI Tab |
| `clear` | 清空输出 |
| `help` | 显示帮助 |
| `multi` | 开始事务队列 |
| `exec` | 执行事务 |
| `discard` | 取消事务 |
| `subscribe`/`psubscribe` | 进入订阅模式 |
| `monitor` | 进入监控模式 |
| `select` | 切换 DB（同步到其他组件） |
| 写命令 (set/hset/...) | 触发 `refreshKeyList` |

**独立连接**：CLI 使用 `client.duplicate()` 创建独立连接，不影响主连接

### 3.9 工具模块

#### [`Status.vue`](AnotherRedisDesktopManager/src/components/Status.vue) — 服务器状态

- **INFO 命令**解析为 key-value 对象
- 三个卡片：Server（版本/OS/PID）、Memory（used/peak/lua）、Stats（clients/connections/commands）
- DB Keys 表格：解析 `db0=db=keys=100,expires=50,avg_ttl=3600` 格式
- 集群模式：每个 master 节点单独查询 `INFO KEYSPACE`
- 自动刷新（2 秒间隔）
- 全量 INFO 搜索过滤

#### [`SlowLog.vue`](AnotherRedisDesktopManager/src/components/SlowLog.vue) — 慢日志

- `SLOWLOG GET 20000` 获取慢日志
- `CONFIG GET slowlog-log-slower-than` / `slowlog-max-len` 显示配置
- RecycleScroller 虚拟滚动渲染
- 按 Cost 排序（升序/降序切换）
- 集群模式：每个 master 节点单独查询

#### [`MemoryAnalysis.vue`](AnotherRedisDesktopManager/src/components/MemoryAnalysis.vue) — 内存分析

- SCAN 扫描所有键 + `MEMORY USAGE` 获取每个键内存大小
- 支持最小大小过滤（KB）
- 支持暂停/继续/重新开始
- 最大扫描 200,000 键
- 点击键可跳转到键详情
- RecycleScroller 虚拟滚动

#### [`DeleteBatch.vue`](AnotherRedisDesktopManager/src/components/DeleteBatch.vue) — 批量删除

- 支持指定键 + 模式匹配扫描
- Standalone：每 5000 键批量 `DEL`
- Cluster：逐个 `DEL`（不支持批量）
- 扫描可暂停/继续
- RecycleScroller 虚拟滚动

### 3.10 设置模块

#### [`Setting.vue`](AnotherRedisDesktopManager/src/components/Setting.vue)

| 设置项 | 存储 | 说明 |
|--------|------|------|
| 主题 | `localStorage.theme` | system/light/dark |
| 语言 | vue-i18n `locale` | 14 种语言 |
| 页面缩放 | `settings.zoomFactor` | 0.5~2.0 |
| 字体 | `settings.fontFamily` | 系统字体选择（多选） |
| 分页大小 | `settings.keysPageSize` | 10~20000 |
| 导出连接 | 文件下载 (.ano) | Base64 编码 JSON |
| 导入连接 | 文件上传 (.ano) | 替换所有连接 |
| 清除缓存 | `localStorage.clear()` | 清空所有数据 |

### 3.11 Electron 主进程

#### [`electron-main.js`](AnotherRedisDesktopManager/pack/electron/electron-main.js)

**窗口管理**：
- `winState` 持久化窗口位置/大小/最大化状态
- `autoHideMenuBar: true` 隐藏菜单栏
- `nodeIntegration: true` + `contextIsolation: false`（渲染进程可直接使用 Node.js）

**IPC 通道**：

| 通道 | 方向 | 功能 |
|------|------|------|
| `hideWindow` | 渲染→主 | 隐藏窗口 |
| `minimizeWindow` | 渲染→主 | 最小化窗口 |
| `toggleMaximize` | 渲染→主 | 切换最大化 |
| `getMainArgs` | 渲染→主 | 获取命令行参数和版本 |
| `changeTheme` | 渲染→主 | 切换主题 |
| `os-theme-updated` | 主→渲染 | 系统主题变更通知 |
| `getTempPath` | 渲染→主 | 获取临时目录 |
| `get-all-fonts` | 渲染→主 | 获取系统字体列表 |
| `send-all-fonts` | 主→渲染 | 返回字体列表 |
| `closingWindow` | 主→渲染 | 窗口关闭前通知 |

**macOS 特殊处理**：自定义应用菜单（App/Edit/View/Window/Help）

#### [`update.js`](AnotherRedisDesktopManager/pack/electron/update.js)
- 使用 `electron-updater` 自动更新
- 生产环境自动检查 GitHub Releases

#### [`win-state.js`](AnotherRedisDesktopManager/pack/electron/win-state.js)
- 窗口位置/大小持久化到文件
- `getLastState()` 获取上次窗口状态
- `watchClose(browserWindow)` 保存关闭时的状态

### 3.12 国际化模块

#### [`i18n.js`](AnotherRedisDesktopManager/src/i18n/i18n.js)

- 使用 `vue-i18n` 8.x
- 14 种语言：cn, tw, en, de, fr, es, it, ko, pt, ru, tr, ua, vi
- 默认语言：中文 (cn)
- 语言偏好存储在 localStorage

---

## 四、功能设计

### 4.1 连接管理功能

```
连接生命周期:
创建 → 编辑 → 测试连接 → 打开 → 使用 → 关闭
  ↓                                    ↓
复制                              自动重连(3次)
删除
导出/导入
```

**连接配置项**：
- 基础：Host, Port, Auth, Username, Name, Separator
- SSH 隧道：Host, Port, User, Password/PrivateKey, Passphrase, Timeout
- SSL/TLS：Key, CA, Cert, SNI
- Sentinel：节点密码, Master 名称
- Cluster：开关
- Readonly：只读模式

### 4.2 键操作功能

**键浏览**：
- SCAN 流式扫描（分页加载）
- 树形视图（按分隔符层级展示）
- 虚拟滚动（大数据量性能优化）
- 精确匹配模式（EXISTS 命令）
- 搜索历史自动补全

**键操作**：
- 查看详情（7 种数据类型）
- 新建键（选择类型）
- 重命名键（需确认）
- 删除键（需确认）
- 修改 TTL / Persist
- 自动刷新（2 秒间隔）
- Dump 命令复制
- 批量导出（DUMP + PTTL → CSV）

**批量操作**：
- Shift 多选
- 全选/取消全选
- 批量删除
- 批量导出

### 4.3 数据编辑功能

**通用模式**：
- 分页加载（pageSize=200，搜索时 pageSize=2000）
- 行内操作：复制、编辑、删除、Dump
- 搜索过滤（表格头部搜索框）
- 加载更多（滚动到底部自动加载）

**各类型特殊功能**：
- Hash：Redis 7.4+ 字段级 TTL
- List：LINSERT + LREM 保持顺序编辑
- ZSet：ASC/DESC 排序切换
- Stream：Groups/Consumers 查看，Min/Max ID 过滤
- ReJSON：JSON 格式验证

### 4.4 格式查看功能

**自动检测**：首次加载自动识别格式并选择最佳查看器

**手动切换**：下拉选择器可手动切换 14 种格式

**自定义格式化器**：用户可编写 JavaScript 函数自定义解码逻辑

### 4.5 CLI 功能

- 完整的 Redis 命令行模拟
- 命令自动补全（基于 allCMD 字典）
- 命令历史（上下箭头，持久化）
- 事务支持（MULTI/EXEC/DISCARD）
- 订阅模式（SUBSCRIBE/PSUBSCRIBE）
- 监控模式（MONITOR）
- 结果递归格式化（Buffer/Array/Object）
- Ctrl+L 清屏

### 4.6 工具功能

**服务器状态**：Server/Memory/Stats 三大面板 + DB Keys 表 + 全量 INFO 搜索

**慢日志**：SLOWLOG GET + CONFIG 查询 + Cost 排序

**内存分析**：MEMORY USAGE 逐键分析 + 大小排序 + 最小过滤

**批量删除**：SCAN + DEL 批量删除 + 暂停/继续

### 4.7 设置功能

- 主题切换（System/Light/Dark）
- 14 种语言切换
- 页面缩放（0.5~2.0）
- 字体选择（系统字体列表）
- 分页大小配置
- 连接导入/导出
- 缓存清理
- 版本信息/更新检查

---

## 五、设计规范

### 5.1 组件命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase.vue | `KeyDetail.vue`, `CliTab.vue` |
| 内容子组件 | 目录/PascalCase.vue | `contents/KeyContentHash.vue` |
| 查看器子组件 | 目录/PascalCase.vue | `viewers/ViewerJson.vue` |
| 工具模块 | camelCase.js | `redisClient.js`, `util.js` |

### 5.2 组件结构规范

每个 Vue 组件遵循固定结构：

```vue
<template>
  <!-- HTML 模板 -->
</template>

<script>
// 1. import 依赖
// 2. export default {
//      data()        - 本地状态
//      props         - 外部传入
//      components    - 子组件注册
//      computed      - 计算属性
//      watch         - 侦听器
//      created()     - 创建时钩子（事件监听注册）
//      methods       - 方法
//      mounted()     - 挂载后钩子（初始化）
//      beforeDestroy() - 销毁前钩子（清理）
//    }
</script>

<style type="text/css">
  /* 局部样式（无 scoped） */
</style>
```

### 5.3 样式规范

**全局样式**：
- 所有样式无 `scoped`，通过 CSS class 命名避免冲突
- 暗色模式通过 `.dark-mode` 前缀选择器实现
- 大量使用 `calc(100vh - Npx)` 实现全屏高度适配

**典型暗色模式写法**：
```css
.normal-element { background: #fafafa; }
.dark-mode .normal-element { background: #263238; }
```

**主题切换**：
- 通过替换 `<link>` 标签的 CSS 文件实现（`static/theme/{light,dark}/index.css`）
- Element UI 主题通过预编译的 CSS 覆盖

### 5.4 数据处理规范

**Buffer 优先**：
- 所有 Redis 键名和值使用 `Buffer` 类型传输（`*Buffer` 后缀 API）
- 显示时通过 `$util.bufToString()` 转换
- 二进制数据通过 `$util.bufToHex()` 显示

**BigInt 安全**：
- JSON 解析使用 `@qii401/json-bigint` 避免精度丢失

**编辑不重新加载**：
- 编辑操作后直接修改本地数据数组（`this.$set()` / `splice()`）
- 不重新调用 `initShow()`（注释 `// do not reinit, #786`）

### 5.5 交互规范

**确认对话框**：
- 删除操作：`this.$confirm()` 二次确认
- 重命名：`this.$prompt()` 需输入 'y' 确认
- FlushDB：`this.$prompt()` 需输入 'y' 确认

**消息提示**：
- 成功：`this.$message.success({ duration: 1000 })`
- 失败：`this.$message.error()`
- 警告：`this.$message.warning()`

**快捷键**：
- 全局：Ctrl+N (新建), Ctrl+, (设置), Ctrl+G (日志), Ctrl+W (关闭 Tab)
- Tab 作用域：Ctrl+R/F5 (刷新), Ctrl+S (保存), Ctrl+D (删除), Ctrl+L (清屏)
- 使用 `keymaster` 库 + scope 机制避免冲突

### 5.6 性能优化规范

**虚拟滚动**：
- 键列表：`@qii401/vue-easy-tree`（虚拟树）
- 慢日志/内存分析/批量删除：`vue-virtual-scroller` (RecycleScroller)
- 数据表格：`vxe-table` 内置虚拟滚动

**流式加载**：
- 所有 SCAN 操作使用 ioredis Stream API
- 达到 pageSize 自动暂停，用户触发继续

**数据量限制**：
- 树节点上限 200,000（超出截断）
- CLI 历史上限 2,000 行
- CLI 命令提示持久化最近 200 条
- 内存分析上限 200,000 键
- 慢日志上限 20,000 条

### 5.7 错误处理规范

**连接错误**：
- 重试策略：最多 3 次，指数退避
- SCAN 错误：检测 `unknown command scan` 特殊提示
- 连接断开：全局 `errorHandler` → `$bus.$emit('closeConnection')`

**命令错误**：
- `try/catch` 包裹所有 Redis 命令
- 错误消息通过 `this.$message.error()` 显示
- SCAN 流错误：`stream.on('error')` 处理

### 5.8 代码组织规范

**无类型系统**：纯 JavaScript，无 TypeScript

**Options API**：全部使用 Vue 2 Options API

**无状态管理**：不使用 Vuex，通过 Event Bus + localStorage + props 管理

**无 API 层**：直接在组件中调用 ioredis，无中间服务层

**全局变量**：
- `global.APP_ENV` — 环境标识（development/production）
- `globalChangeTheme()` — 全局主题切换函数（定义在 index.html）

---

## 六、总结

### 6.1 架构特点

| 优点 | 缺点 |
|------|------|
| 事件总线解耦组件 | 事件流难以追踪和调试 |
| 流式加载处理大数据 | 无流控/背压机制 |
| 格式自动检测用户友好 | 检测逻辑不可扩展（硬编码） |
| 虚拟滚动性能优秀 | 树操作复杂度高 |
| 14 种语言国际化 | 语言文件维护成本高 |
| 多种 Redis 部署模式支持 | SSH+Cluster 实现复杂 |
| CLI 功能完整 | 无命令验证/沙箱 |

### 6.2 关键数据流

```
用户点击键 → KeyListVirtualTree.nodeClick()
  → $bus.$emit('clickedKey', client, key)
  → Tabs.addKeyTab(client, key)
    → client.type(key) → 获取类型
    → Tabs.addTab(tabItem)
      → KeyDetail 渲染
        → KeyHeader (名称/TTL/操作)
        → KeyContent* (类型对应编辑器)
          → FormatViewer (格式查看/编辑)
```

### 6.3 迁移关注点

1. **Event Bus → Pinia/Composable**：所有 `$bus` 事件需要重写为响应式状态管理
2. **Options API → Composition API**：所有组件需要用 `<script setup>` + TSX 重写
3. **localStorage → tauri-plugin-store**：存储层需要替换
4. **ioredis → Rust redis**：连接管理需要用 Rust 重写
5. **Electron IPC → Tauri IPC**：主进程通信需要替换
6. **Element UI → Element Plus**：UI 组件库升级
7. **vxe-table → VTable**：数据表格替换
8. **Monaco Editor → 独立加载**：JSON 编辑器集成方式变更
9. **Buffer 处理 → Uint8Array**：二进制数据处理方式变更
10. **无类型 → TypeScript**：全量类型定义
