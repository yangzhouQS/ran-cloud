# AnotherRedisDesktopManager (ARDM) 深度分析文档

> 基于 56+ 源文件的逐行深度阅读，全面覆盖模块设计、架构设计、功能设计、设计规范

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈与依赖分析](#2-技术栈与依赖分析)
3. [架构设计](#3-架构设计)
4. [模块设计](#4-模块设计)
5. [功能设计详解](#5-功能设计详解)
6. [数据流设计](#6-数据流设计)
7. [设计规范与模式](#7-设计规范与模式)
8. [迁移关键映射表](#8-迁移关键映射表)

---

## 1. 项目概览

### 1.1 项目定位
AnotherRedisDesktopManager 是一个跨平台的 Redis 桌面管理客户端，支持 Standalone、Sentinel、Cluster 三种部署模式，提供 Key 管理、数据编辑、CLI 终端、慢日志分析、内存分析等功能。

### 1.2 文件结构统计

| 分类 | 文件数 | 说明 |
|------|--------|------|
| 核心基础设施 | 13 | main.js, App.vue, bus.js, storage.js, util.js, redisClient.js, commands.js 等 |
| 连接管理组件 | 4 | Connections.vue, ConnectionWrapper.vue, ConnectionMenu.vue, NewConnectionDialog.vue |
| Key 列表组件 | 3 | KeyList.vue, KeyListNormal.vue, KeyListVirtualTree.vue |
| Key 详情组件 | 2 | KeyDetail.vue, KeyHeader.vue |
| 数据类型组件 | 7 | KeyContentString/Hash/List/Set/Zset/Stream/ReJson.vue |
| 操作组件 | 1 | OperateItem.vue (DB选择器 + 搜索 + 新建Key) |
| Tab管理组件 | 1 | Tabs.vue |
| CLI 终端组件 | 2 | CliTab.vue, CliContent.vue |
| 工具组件 | 4 | Status.vue, SlowLog.vue, MemoryAnalysis.vue, DeleteBatch.vue |
| 格式查看器 | 16 | FormatViewer.vue + 14个 Viewer 组件 + JsonEditor.vue |
| 设置/日志 | 4 | Setting.vue, CommandLog.vue, HotKeys.vue, CustomFormatter.vue |
| UI 辅助组件 | 7 | RightClickMenu.vue, ScrollToTop.vue, InputPassword.vue, InputBinary.vue, FileInput.vue, LanguageSelector.vue, PaginationTable.vue, UpdateCheck.vue |
| 国际化 | 14 | i18n.js + 13种语言文件 |
| Electron | 4 | electron-main.js, update.js, win-state.js, font-manager.js |
| 构建配置 | 7 | webpack configs, babel, postcss |
| **总计** | **~70** | |

---

## 2. 技术栈与依赖分析

### 2.1 核心框架
- **Vue 2.6** (Options API) + **Element UI 2.15**
- **Electron 12** (Node.js 集成, contextIsolation: false)
- **Webpack 4** 构建

### 2.2 Redis 交互
- **ioredis 5.3** — 完整的 Redis 客户端，支持 Cluster/Sentinel/Pipeline/Stream
- **@qii404/redis-splitargs** — Redis 命令参数解析（支持 Buffer）
- **@qii404/json-bigint** — BigInt 兼容的 JSON 解析

### 2.3 数据展示
- **vxe-table 3.9** — 高性能虚拟滚动表格（Hash/List/Set/Zset/Stream 数据编辑）
- **@qii404/vue-easy-tree** — 虚拟滚动树（Key 树形视图，200K+ 节点）
- **vue-virtual-scroller** — RecycleScroller（SlowLog/MemoryAnalysis/DeleteBatch 列表）
- **monaco-editor** — 代码编辑器（CLI 终端 + JSON 编辑器）
- **SortableJS** — 连接列表拖拽排序

### 2.4 数据格式化
- **msgpack-lite** — MessagePack 解码
- **protobufjs** — Protobuf 解码
- **pako** — Gzip/Deflate/DeflateRaw 解压
- **brotli** — Brotli 解压
- **php-serialize** — PHP 序列化解码
- **java-deserialize** — Java 序列化解码
- **pickle** — Python Pickle 解码

### 2.5 其他
- **node-version-compare** — Redis 版本比较（用于特性检测如 HTTL/HEXPIRE）
- **keymaster** — 全局快捷键绑定
- **font-list** (Electron) — 系统字体列表获取

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Electron Main                      │
│  electron-main.js (窗口管理/主题/更新/字体/IPC)        │
│  update.js (autoUpdater)  win-state.js (窗口状态)      │
│  font-manager.js (系统字体)                            │
├─────────────────────────────────────────────────────┤
│                    Renderer Process                    │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │  App.vue  │  │ Aside.vue│  │    Tabs.vue       │    │
│  │  (根布局)  │  │(左侧边栏)│  │  (多Tab管理)      │    │
│  └──────────┘  └──────────┘  └──────────────────┘    │
│       │              │               │                 │
│  ┌────────────────────────────────────────────────┐   │
│  │              Global Services                     │   │
│  │  bus.js (事件总线)  storage.js (持久化)           │   │
│  │  util.js (工具函数)  redisClient.js (Redis工厂)  │   │
│  │  commands.js (命令字典)  shortcut.js (快捷键)     │   │
│  └────────────────────────────────────────────────┘   │
│       │              │               │                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │Connection│  │  KeyList │  │   KeyDetail       │    │
│  │ Wrapper  │  │(Normal/  │  │ (Header+Content)  │    │
│  │(连接包装) │  │ VTree)   │  │                   │    │
│  └──────────┘  └──────────┘  └──────────────────┘    │
│       │                                              │
│  ┌────────────────────────────────────────────────┐   │
│  │             ConnectionMenu                       │   │
│  │  Status/CLI/SlowLog/MemoryAnalysis/DeleteBatch  │   │
│  │  + OperateItem (DB选择器/搜索/新建Key)           │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 3.2 全局状态管理（无 Vuex/Pinia）

ARDM **不使用**集中式状态管理库，而是通过以下三种机制管理状态：

1. **Vue.prototype 全局注入**（4个服务）
   - `$bus` — 事件总线（20+ 事件）
   - `$util` — 工具函数（30+ 函数）
   - `$storage` — localStorage CRUD
   - `$shortcut` — 快捷键绑定

2. **EventBus 事件驱动**（`bus.js`）
   ```javascript
   // 20+ 事件定义
   clickedKey, openStatus, openCli, openDelBatch,
   memoryAnalysis, slowLog, refreshConnections,
   refreshKeyList, closeConnection, openConnection,
   removePreTab, removeAllTab, commandLog,
   reloadSettings, update-check, duplicateConnection,
   fontInited, changeDb, changeMatchMode,
   refreshViewers, addCustomFormatter
   ```

3. **localStorage 持久化**（`storage.js`）
   - 连接配置（加密存储）
   - 应用设置（字体/缩放/分页大小/主题）
   - 自定义格式化器
   - CLI 命令历史
   - 搜索历史
   - 自定义 DB 名称
   - 最后选择的 DB

### 3.3 组件层级关系

```
App.vue
├── Aside.vue (左侧边栏)
│   ├── NewConnectionDialog.vue (新建连接弹窗)
│   ├── Setting.vue (设置弹窗)
│   │   └── LanguageSelector.vue (语言选择)
│   ├── CommandLog.vue (命令日志弹窗)
│   ├── HotKeys.vue (快捷键提示弹窗)
│   ├── CustomFormatter.vue (自定义格式化器弹窗)
│   │   └── FileInput.vue (文件选择器)
│   └── Connections.vue (连接列表)
│       └── ConnectionWrapper.vue × N (每个连接)
│           ├── ConnectionMenu.vue (连接右键菜单)
│           │   ├── OperateItem.vue (DB选择器+搜索+新建Key)
│           │   └── KeyList.vue (Key列表容器)
│           │       ├── KeyListNormal.vue (普通列表模式)
│           │       └── KeyListVirtualTree.vue (树形模式)
│           └── [通过 Tabs.vue 管理的 Tab 内容]
│               ├── Status.vue (服务器状态)
│               ├── CliTab.vue (CLI终端)
│               │   └── CliContent.vue (Monaco只读编辑器)
│               ├── KeyDetail.vue (Key详情)
│               │   ├── KeyHeader.vue (Key头部操作)
│               │   └── KeyContent{String|Hash|List|Set|Zset|Stream|ReJson}.vue
│               │       └── FormatViewer.vue (格式查看器)
│               │           ├── JsonEditor.vue (Monaco JSON编辑器)
│               │           └── Viewer{Text|Hex|Binary|Json|Msgpack|...}.vue
│               ├── DeleteBatch.vue (批量删除)
│               ├── MemoryAnalysis.vue (内存分析)
│               └── SlowLog.vue (慢日志)
└── Tabs.vue (右侧Tab管理)
    └── UpdateCheck.vue (更新检查)
```

---

## 4. 模块设计

### 4.1 连接管理模块

#### ConnectionConfig 数据模型
```javascript
{
  host: '127.0.0.1',
  port: 6379,
  auth: '',           // 密码
  username: '',       // Redis 6.0+ ACL 用户名
  name: '',           // 连接别名
  separator: ':',     // Key 分隔符（用于树形视图）
  connectionName: '', // 唯一标识（自动生成）
  cluster: false,     // Cluster 模式
  sentinel: false,    // Sentinel 模式
  sentinelConfig: {
    name: 'mymaster',
    host: '',
    port: 26379,
    auth: '',
    username: '',
    nodePassword: '',  // Sentinel 节点密码
  },
  sshOptions: {
    host: '', port: 22, username: '', password: '',
    privateKey: '', passphrase: '', timeout: 30000,
  },
  ssl: false,         // TLS 连接
  readOnly: false,    // 只读模式
  color: '',          // 连接颜色标记
  sortOrder: 0,       // 排序顺序
}
```

#### 连接生命周期
1. **创建**: `NewConnectionDialog` → `storage.addConnection()` → `$bus.$emit('refreshConnections')`
2. **打开**: `Connections.vue` → `$bus.$emit('openConnection')` → `ConnectionWrapper.initShow()`
   - 创建 ioredis 客户端（`redisClient.js` 工厂函数）
   - Monkey-patch `sendCommand` 用于命令日志 + 只读拦截
   - 启动 10s `ping` 心跳
   - 设置 CSS 变量 `--menu-color` 用于颜色标记
3. **关闭**: `$bus.$emit('closeConnection')` → `client.quit()` + 清理
4. **编辑/删除/复制**: 通过 `ConnectionMenu` 右键菜单操作

#### 连接列表排序
- 使用 **SortableJS** 实现拖拽排序
- `≥4` 个连接时显示搜索框
- 排序结果持久化到 localStorage

### 4.2 Key 管理模块

#### Key 列表加载（`KeyList.vue`）
```
SCAN 流程:
1. client.scanBufferStream({match, count: keysPageSize})
2. stream.on('data') → 累积 keys
3. 达到 pageSize → stream.pause() (背压控制)
4. 用户点击 "Load More" → stream.resume()
5. stream.on('end') → loadMoreDisable = true
```

#### Key 树形视图（`KeyListVirtualTree.vue`）
- **200K 节点溢出保护**: `treeNodesOverflow = 200000`，超出时截断并警告
- **keysToTree()**: 按 separator 分割 Key，构建文件夹层级
  - `keyNode: true/false` — 区分 Key 节点和文件夹节点
  - `keyCount` — 文件夹下 Key 数量
  - `nameBuffer` — Buffer 形式的完整 Key 名
  - `fullName` — 字符串形式的完整 Key 名
- **展开状态持久化**: `expandedKeys: Set()` 跨刷新保留
- **多选操作**: Shift+Click 批量选择，支持删除/导出
- **右键菜单**: 复制/删除/多选/新Tab打开/导出/内存分析/加载当前文件夹/删除文件夹

#### Key 搜索（`OperateItem.vue`）
- **el-autocomplete** 带历史搜索建议（Set，最多 200 条）
- **精确搜索**: `searchExact` checkbox → `match = exactKey` 而非 `*pattern*`
- **取消搜索**: 800ms 延迟后显示取消按钮
- **搜索历史持久化**: `ipcRenderer.on('closingWindow')` 时保存到 localStorage

#### Key 详情（`KeyDetail.vue` + `KeyHeader.vue`）
```javascript
// KeyHeader 功能:
- Key 名称显示 + 重命名（需输入 'y' 确认）
- TTL 显示 + 修改（expire/persist/-1）
- 删除 Key
- 刷新（自动刷新间隔 2s）
- Dump 命令复制
- 快捷键: ctrl+r 刷新, ctrl+d 删除

// KeyDetail 根据 type 动态加载组件:
const componentMap = {
  string: 'KeyContentString',
  hash:   'KeyContentHash',
  list:   'KeyContentList',
  set:    'KeyContentSet',
  zset:   'KeyContentZset',
  stream: 'KeyContentStream',
  rejson: 'KeyContentReJson',
};
```

### 4.3 数据类型模块

#### 通用数据加载模式

| 类型 | 总数命令 | 加载命令 | 分页方式 | 搜索方式 |
|------|----------|----------|----------|----------|
| String | - | GET | 无分页 | - |
| Hash | HLEN | HSCAN Stream | pause/resume | HSCAN match |
| List | LLEN | LRANGE | pageIndex-based | 内存过滤 |
| Set | SCARD | SSCAN Stream | pause/resume | SSCAN match |
| Zset | ZCARD | ZRANGE/ZREVRANGE 或 ZSCAN | pageIndex 或 Stream | ZSCAN match |
| Stream | XLEN | XREVRANGE | lastId-based | 内存过滤 |
| ReJSON | - | JSON.GET | 无分页 | - |

#### 通用编辑模式（Add New + Delete Old）

```javascript
// Hash 编辑:
HSET key newField newValue → 如果 field 变更则 HDEL key oldField

// List 编辑:
LINSERT key AFTER oldValue newValue → LREM key 1 oldValue
// 保持列表顺序，#1082

// Set 编辑:
SADD key newValue → 如果值存在(reply==0)报错 → SREM key oldValue

// Zset 编辑:
ZADD key score newMember → 如果 member 变更则 ZREM key oldMember

// Stream 新增:
XADD key '*' field1 value1 field2 value2...
// Stream 不支持编辑已有条目
```

#### 内联数组操作（不重新初始化）
```javascript
// 编辑后直接修改数组，而非重新 initShow()
// 注释: // do not reinit, #786
this.$set(this.hashData, this.hashData.indexOf(before), newLine);  // 编辑
this.hashData.splice(this.hashData.indexOf(row), 1);  // 删除
this.hashData.push(newLine);  // 新增
this.total--;  // 更新总数
```

#### Hash TTL 支持（Redis ≥ 7.4）
```javascript
// 版本检测
ttlSupport() {
  return versionCompare(this.client.ardmRedisVersion, '7.4') >= 0;
}
// HTTL 查询
client.call('HTTL', key, 'FIELDS', keys.length, ...keys)
// HEXPIRE 设置
client.call('HEXPIRE', key, ttl, "FIELDS", 1, field)
```

#### Zset 双模式
```javascript
// 默认模式: 有序（按分数排序）
getListRange() → ZRANGE/ZREVRANGE (pageIndex-based)

// 搜索模式: 无序（SCAN 随机）
getListScan() → ZSCAN Stream (pause/resume)
// 当 filterValue 非空时切换到 SCAN 模式
```

#### Stream 分页
```javascript
// XREVRANGE + lastId 追踪
listScan() {
  const pageSize = this.filterValue ? searchPageSize : (hasData ? pageSize + 1 : pageSize);
  client.xrevrangeBuffer([key, maxId, minId, 'COUNT', pageSize])
    → 跳过与 lastId 相同的边界条目
    → 递归调用直到填满 pageSize
    → cancelScanning 标志用于 beforeDestroy 取消
}
```

### 4.4 CLI 终端模块

#### CliTab.vue 架构
```
CliTab.vue
├── CliContent.vue (Monaco 只读编辑器，显示输出)
├── el-autocomplete (命令输入 + 自动补全)
└── Stop Subscribe/Monitor 按钮

功能:
- 命令历史 (↑↓ 键浏览，最多 2000 条)
- 自动补全 (allCMD 字典 + 历史命令)
- MULTI/EXEC 事务支持
- SUBSCRIBE/PSUBSCRIBE 订阅模式
- MONITOR 监控模式
- 命令结果递归解析 (Buffer/List/Dict/Pipeline)
- 特殊命令: exit/quit/clear/help
- SELECT 后自动同步 DB: $bus.$emit('changeDb')
- 写操作后刷新 Key 列表: $bus.$emit('refreshKeyList')
```

#### 命令自动补全
```javascript
// commands.js 定义:
allCMD = {
  GET: 'GET key',
  SET: 'SET key value [EX seconds] [PX milliseconds]',
  CONFIG: ['CONFIG GET parameter', 'CONFIG SET parameter value'],
  // ... 200+ 命令
}

adminCMD = { DEBUG: 1, CONFIG: 1, ... }  // 管理命令
readCMD  = { GET: 1, HGET: 1, ... }      // 读命令
writeCMD = { SET: 1, HSET: 1, ... }       // 写命令
```

### 4.5 工具模块

#### Status.vue（服务器状态）
- **INFO** 命令解析 → Server/Memory/Stats 三卡片
- **DB Keys** 表格: 解析 `db0:keys=100,expires=50,avg_ttl=3600`
- **Cluster 支持**: 每个 master 节点独立查询 INFO KEYSPACE
- **自动刷新**: 2s 间隔，可开关
- **全局搜索**: 过滤所有 INFO 字段

#### SlowLog.vue（慢日志）
- **SLOWLOG GET 20000**: 获取最多 20000 条慢日志
- **CONFIG GET**: 获取 `slowlog-log-slower-than` 和 `slowlog-max-len`
- **RecycleScroller**: 虚拟滚动列表
- **按耗时排序**: ASC/DESC 切换
- **Cluster**: 每个 master 节点独立查询

#### MemoryAnalysis.vue（内存分析）
- **SCAN + MEMORY USAGE**: 逐 Key 扫描并查询内存占用
- **流式处理**: SCAN → pause → MEMORY USAGE → resume（100ms 间隔渲染）
- **最大 200000 Key** 限制
- **最小大小过滤**: minSizeKB 配置
- **排序**: 按内存大小 ASC/DESC
- **点击跳转**: 点击 Key 打开详情

#### DeleteBatch.vue（批量删除）
- **两种模式**: 指定 Key 列表 + SCAN pattern 匹配
- **Standalone**: 每 5000 Key 一批 DEL
- **Cluster**: 逐个 DEL（因为 Key 可能分布在不同 slot）
- **流式扫描**: SCAN + pause/resume（100ms 间隔渲染）

### 4.6 格式查看器模块

#### FormatViewer.vue（格式自动检测链）
```javascript
autoFormat() {
  if (overSize > 20MB) → OverSize
  if (isJson)          → Json
  if (isPHPSerialize)  → PHPSerialize
  if (isJavaSerialize) → JavaSerialize
  if (isPickle)        → Pickle
  if (isMsgpack)       → Msgpack
  if (isBrotli)        → Brotli
  if (isGzip)          → Gzip
  if (isDeflate)       → Deflate
  if (isProtobuf)      → Protobuf
  if (isDeflateRaw)    → DeflateRaw
  if (!bufVisible)     → Hex
  default              → Text
}
```

#### 14 种 Viewer 组件
| Viewer | 功能 | 大小 |
|--------|------|------|
| ViewerText | 纯文本显示 + 编辑 | 1412 chars |
| ViewerHex | Hex 显示 + 编辑 | 676 chars |
| ViewerJson | JSON 格式化显示 | 1249 chars |
| ViewerBinary | 二进制数据显示 | 687 chars |
| ViewerMsgpack | MessagePack 解码 | 1375 chars |
| ViewerProtobuf | Protobuf 解码 + 字段定义 | 4324 chars |
| ViewerGzip | Gzip 解压 | 1000 chars |
| ViewerDeflate | Deflate 解压 | 1009 chars |
| ViewerDeflateRaw | DeflateRaw 解压 | 1018 chars |
| ViewerBrotli | Brotli 解压 | 1014 chars |
| ViewerJavaSerialize | Java 序列化解码 | 1014 chars |
| ViewerPHPSerialize | PHP 序列化解码 | 1344 chars |
| ViewerPickle | Python Pickle 解码 | 708 chars |
| ViewerCustom | 自定义外部命令格式化 | 5012 chars |
| ViewerOverSize | >20MB 文件提示 | 1110 chars |

#### JsonEditor.vue（Monaco 编辑器）
- **JSONbig**: BigInt 兼容的 JSON 解析
- **折叠/展开**: toggleCollapse() → editor.foldAll/unfoldAll
- **只读/编辑模式**: cursorStyle 区分（underline-thin vs line）
- **字体同步**: `$bus.$on('fontInited')` 更新 fontFamily
- **JSON 验证**: `getContent()` 中验证 JSON 格式

### 4.7 设置模块

#### Setting.vue
- **UI 设置**: 主题(light/dark/system)、语言(13种)、页面缩放(0.5-2.0)、字体选择
- **通用设置**: 每页加载数(10-20000)、连接导入/导出(.ano 文件, Base64 编码)
- **其他**: 版本信息、快捷键提示、缓存清理、更新检查

#### CustomFormatter.vue
- 自定义格式化器: name + command + params
- 模板变量: `{VALUE}`, `{FIELD}`, `{SCORE}`, `{MEMBER}`, `{HEX}`, `{HEX_FILE}`
- 保存到 localStorage → `$bus.$emit('refreshViewers')` 刷新所有 FormatViewer

---

## 5. 功能设计详解

### 5.1 多 Tab 管理（Tabs.vue）

```javascript
// 6 种 Tab 类型
tabTypes = {
  status:         { component: 'Status',         icon: 'fa fa-info-circle' },
  cli:            { component: 'CliTab',          icon: 'fa fa-terminal' },
  keyDetail:      { component: 'KeyDetail',       icon: 'fa fa-edit' },
  deleteBatch:    { component: 'DeleteBatch',     icon: 'fa fa-trash' },
  memoryAnalysis: { component: 'MemoryAnalysis',  icon: 'fa fa-bar-chart' },
  slowLog:        { component: 'SlowLog',         icon: 'fa fa-clock-o' },
}

// Tab 打开策略:
// - 同连接同类型同Key → 替换当前Tab
// - Ctrl+Click → 新Tab打开
// - 右键菜单: 关闭/关闭其他/关闭右侧/关闭左侧

// Tab 切换:
// - 鼠标滚轮在 Tab 栏上滚动可切换 Tab
```

### 5.2 DB 选择器（OperateItem.vue）

```javascript
// DB 列表获取:
1. CONFIG GET databases → [...Array(N).keys()]
2. 失败时回退到 16 个 DB
3. INFO KEYSPACE 解析 → 获取每个 DB 的 Key 数量
   正则: /db(\d+)\:keys=(\d+)/
4. Cluster 模式: 最大 DB 从 INFO KEYSPACE 推断

// DB 切换:
SELECT dbIndex → 清空搜索 → refreshKeyList → 保存到 localStorage → 通知 CLI

// 自定义 DB 名称:
localStorage key: 'custom_db_{connectionName}'
```

### 5.3 新建 Key（OperateItem.vue）

```javascript
// 7 种 Key 类型及默认值:
newKeyTypes = {
  String: { cmd: 'SET key ""' },
  Hash:   { cmd: 'HSET key "New field" "New value"' },
  List:   { cmd: 'LPUSH key "New member"' },
  Set:    { cmd: 'SADD key "New member"' },
  Zset:   { cmd: 'ZADD key 0 "New member"' },
  Stream: { cmd: 'XADD key * "New key" "New value"' },
  ReJSON: { cmd: 'JSON.SET key $ '{"New key":"New value"}' },
}

// 创建后:
$bus.$emit('refreshKeyList', client, key, 'add')
$bus.$emit('clickedKey', client, key, true)  // 新Tab打开
```

### 5.4 命令日志中间件（redisClient.js）

```javascript
// Monkey-patch sendCommand
const originSendCommand = Redis.prototype.sendCommand;
Redis.prototype.sendCommand = function(command, stream) {
  const start = Date.now();
  const result = originSendCommand.call(this, command, stream);

  // 只读模式拦截
  if (this.options.readOnly && writeCMD[command.name.toUpperCase()]) {
    return Promise.reject(new Error('Write command in readonly mode'));
  }

  // 命令日志（可跳过: withoutLogging）
  if (!this.withoutLogging) {
    result.then((reply) => {
      const cost = Date.now() - start;
      Vue.prototype.$bus.$emit('commandLog', {
        command: { name: command.name, args: command.args },
        cost,
        time: new Date(),
        connectionName: this.options.connectionName,
      });
    });
  }

  return result;
};
```

### 5.5 主题系统

```javascript
// 三种模式: light / dark / system
// CSS 文件切换:
static/theme/light/index.css  (198KB)
static/theme/dark/index.css   (232KB)

// 主题切换流程:
1. localStorage.theme = mode
2. globalChangeTheme(mode) → document.body.classList.add/remove('dark-mode')
3. Electron: nativeTheme.themeSource = mode
4. OS 主题变更: nativeTheme.on('updated') → 自动同步

// CSS 规范:
// - .dark-mode 前缀覆盖样式
// - CSS 变量 --menu-color 用于连接颜色标记
```

### 5.6 国际化

```javascript
// 13 种语言: en, cn, tw, tr, ru, pt, de, fr, ua, it, es, ko, vi
// Element UI 语言包 + 自定义翻译合并
// localStorage.lang 存储选择
```

---

## 6. 数据流设计

### 6.1 事件流图

```
用户操作                    EventBus                    响应组件
────────────────────────────────────────────────────────────────
点击连接名     → openConnection    → ConnectionWrapper.initShow()
点击Key        → clickedKey        → Tabs.openKeyDetail()
右键连接       → (直接调用方法)      → ConnectionMenu
切换DB         → changeDb          → OperateItem + CliTab
搜索Key        → (直接调用方法)      → KeyList.refreshKeyList()
新建Key        → refreshKeyList    → KeyList
              + clickedKey         → Tabs.openKeyDetail()
删除Key        → refreshKeyList    → KeyList
编辑数据       → (直接修改数组)      → Content组件内联更新
执行CLI命令    → commandLog        → CommandLog
              + changeDb           → OperateItem + CliTab
              + refreshKeyList     → KeyList
关闭连接       → closeConnection   → ConnectionWrapper
设置变更       → reloadSettings    → 全局
格式化器变更   → refreshViewers    → FormatViewer
更新检查       → update-check      → UpdateCheck
窗口关闭       → closingWindow     → OperateItem + CliTab (保存历史)
```

### 6.2 数据持久化流

```
storage.js API:
├── getConnections() / addConnection() / deleteConnection()
├── getSetting() / saveSettings()
├── getCustomFormatter() / saveCustomFormatters()
└── getStorageKeyByName(type, name) → 生成唯一 localStorage key

localStorage Keys:
├── ardm_connections_{hash}     → 连接配置（加密）
├── ardm_settings               → 应用设置
├── ardm_custom_formatter       → 自定义格式化器
├── ardm_cli_tip_{name}         → CLI 命令历史
├── ardm_search_tip_{name}      → 搜索历史
├── ardm_last_db_{name}         → 最后选择的DB
├── ardm_custom_db_{name}       → 自定义DB名称
├── ardm_connection_order       → 连接排序
├── theme                       → 主题模式
├── lang                        → 语言选择
└── IgnoreUpdateVersion_{ver}   → 忽略的更新版本
```

---

## 7. 设计规范与模式

### 7.1 Vue 2 Options API 模式

```javascript
// 所有组件使用 Options API
export default {
  data() { return { ... }; },
  props: ['client', 'redisKey', 'hotKeyScope'],
  components: { ... },
  computed: { ... },
  watch: { ... },
  created() { ... },    // 事件监听绑定
  mounted() { ... },    // 初始化 + initShow()
  beforeDestroy() { ... }, // 清理: quit client, clearInterval, deleteScope
  methods: { ... },
};
```

### 7.2 Props 传递模式

```javascript
// 核心 Props 传递链:
App → Aside → Connections → ConnectionWrapper → ConnectionMenu
                                                         → OperateItem
                                                         → KeyList
       Tabs → KeyDetail → KeyHeader
                       → KeyContent* → FormatViewer → Viewer*

// 关键 Props:
client: ioredis 实例（直接传递，非序列化）
redisKey: Buffer（Key 名）
config: Object（连接配置）
hotKeyScope: String（快捷键作用域）
```

### 7.3 父子组件通信模式

```javascript
// 1. $parent 链式访问（不推荐但大量使用）
this.$parent.$parent.$parent.$refs.keyList.refreshKeyList()
this.$parent.$parent.$refs.keyHeader.keyTTL

// 2. $bus 事件总线（主要通信方式）
this.$bus.$emit('clickedKey', client, key, newTab)
this.$bus.$on('changeDb', (client, dbIndex) => { ... })

// 3. $refs 直接调用
this.$refs.formatViewer.getContent()
this.$refs.contentTable.scrollTo(0, 99999999)
this.$refs.veTree.setCheckedAll(checked)
```

### 7.4 Buffer 处理规范

```javascript
// 所有 Key 和 Value 以 Buffer 形式存储
// 显示时转换:
this.$util.bufToString(buffer)   // Buffer → UTF-8 字符串
this.$util.bufToHex(buffer)      // Buffer → Hex 字符串
this.$util.bufVisible(buffer)    // 是否可显示为文本（非二进制）

// 编辑时转换:
Buffer.from(string)              // 字符串 → Buffer
this.$util.xToBuffer(hexString)  // Hex → Buffer

// 可见性判断:
bufVisible() → 检测是否包含不可打印字符
不可见 → 显示 [Hex] 标签，使用 Hex 模式编辑
```

### 7.5 SCAN 流式处理规范

```javascript
// 标准 SCAN Stream 模式:
initScanStream() {
  const scanOption = { match: this.getScanMatch(), count: this.pageSize };
  scanOption.match != '*' && (scanOption.count = this.searchPageSize);

  this.scanStream = this.client.hscanBufferStream(this.redisKey, scanOption);

  this.scanStream.on('data', (reply) => {
    // 解析数据
    this.oneTimeListLength += data.length;
    this.hashData = this.hashData.concat(data);

    // 背压控制
    if (this.oneTimeListLength >= this.pageSize) {
      this.scanStream.pause();
      this.loadingIcon = '';
    }
  });

  this.scanStream.on('end', () => {
    this.loadingIcon = '';
    this.loadMoreDisable = true;
  });
}

// Load More:
initShow(false)  // resetTable = false
  → this.oneTimeListLength = 0;
  → this.scanStream.resume();
```

### 7.6 CSS 规范

```css
/* 全局样式 */
.dark-mode { ... }  /* 暗色模式覆盖 */

/* 组件内 scoped 样式 */
/* 使用 type="text/css" 而非 scoped */

/* 常用 CSS 类名 */
.key-select           /* 选中的 Key 高亮 */
.content-table-container  /* vxe-table 容器 */
.content-more-container  /* Load More 按钮容器 */
.connection-form      /* 连接表单 */
.key-list-custom-node /* 树节点自定义内容 */
.key-list-right-menu  /* 右键菜单 */
.batch-operate        /* 批量操作按钮 */
```

### 7.7 快捷键规范

```javascript
// 全局快捷键 (keymaster)
ctrl+n / ⌘+n    → 新建连接
ctrl+, / ⌘+,    → 设置
ctrl+g / ⌘+g    → 命令日志
ctrl+w / ⌘+w    → 关闭 Tab
ctrl+? / ⌘+?    → 快捷键提示

// Tab 作用域快捷键
ctrl+r / ⌘+r / F5  → 刷新 (Status/SlowLog/MemoryAnalysis/KeyHeader)
ctrl+d / ⌘+d       → 删除 (KeyHeader)
ctrl+s / ⌘+s       → 保存 (KeyContentString/ReJson)
ctrl+l / ⌘+l       → 清屏 (CliTab)

// 作用域管理:
this.$shortcut.bind(keys, scope, handler)
this.$shortcut.deleteScope(scope)  // beforeDestroy 时清理
```

### 7.8 错误处理规范

```javascript
// 1. 用户操作错误 → $message.error
this.$message.error(e.message);
this.$message.error({ message: '...', duration: 1000 });

// 2. 确认操作 → $confirm
this.$confirm(this.$t('message.confirm_to_delete_row_data'), { type: 'warning' })

// 3. 静默失败（非关键操作）
.catch((e) => {});  // 如 initTotal() 失败

// 4. 全局异常处理（Electron）
process.on('uncaughtException', (err) => {
  dialog.showMessageBoxSync(...);
  process.exit();
});
```

---

## 8. 迁移关键映射表

### 8.1 技术栈映射

| ARDM (Vue 2 + Electron) | ran-rs-desktop (Vue 3 + Tauri) |
|--------------------------|--------------------------------|
| Vue 2 Options API | Vue 3 Composition API + TSX |
| Element UI 2.15 | Element Plus |
| Electron 12 | Tauri 2 |
| ioredis (Node.js) | redis crate (Rust) |
| localStorage | tauri-plugin-store |
| Vue.prototype.$bus | mitt (typed events) |
| Vue.prototype.$util | composable functions |
| Vue.prototype.$storage | Tauri Store service |
| keymaster | Tauri globalShortcut |
| vxe-table 3.9 | @visactor/vtable |
| vue-easy-tree | @visactor/vtable tree mode |
| vue-virtual-scroller | @visactor/vtable |
| monaco-editor | Monaco (保持) |
| SortableJS | vuedraggable / @vueuse/integrations |
| webpack 4 | Rsbuild |

### 8.2 架构映射

| ARDM 模式 | ran-rs-desktop 模式 |
|-----------|---------------------|
| EventBus (bus.js) | mitt + Tauri Events |
| Vue.prototype 注入 | Pinia stores + Composables |
| localStorage 直接操作 | tauri-plugin-store (Rust) |
| ioredis Monkey-patch | Rust 中间件层 |
| SCAN Stream (Node.js) | Tauri Events 流式推送 |
| $parent 链式访问 | Pinia store + provide/inject |
| Buffer 全局使用 | Rust 端 bytes::Bytes, 前端 Uint8Array |
| Options API data() | ref/reactive |
| $set/$delete | 直接赋值（Vue 3 响应式） |

### 8.3 功能优先级映射

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 连接 CRUD | 创建/编辑/删除/复制连接 |
| P0 | Key 列表 + SCAN | 流式加载 + 背压控制 |
| P0 | Key 树形视图 | 虚拟滚动 + 200K 保护 |
| P0 | Key 详情 | 7 种数据类型查看/编辑 |
| P0 | DB 选择器 | DB 列表 + Key 计数 |
| P0 | 多 Tab 管理 | 6 种 Tab 类型 |
| P1 | CLI 终端 | 命令执行 + 自动补全 |
| P1 | 命令日志 | 中间件拦截 + 日志面板 |
| P1 | 服务器状态 | INFO 解析 + 自动刷新 |
| P1 | 慢日志 | SLOWLOG GET + 排序 |
| P1 | 内存分析 | SCAN + MEMORY USAGE |
| P1 | 批量删除 | SCAN + DEL 批量 |
| P2 | 格式查看器 | 14 种格式自动检测 |
| P2 | 自定义格式化器 | 外部命令格式化 |
| P2 | SSH 隧道 | SSH2 连接代理 |
| P2 | Sentinel/Cluster | 特殊连接模式 |
| P2 | 主题/语言 | 暗色模式 + 13 种语言 |
| P2 | 连接导入/导出 | Base64 编码文件 |
| P3 | 自动更新 | electron-updater → Tauri updater |
| P3 | 快捷键系统 | 全局 + Tab 作用域 |
| P3 | 搜索历史 | 自动补全 + 持久化 |

---

> **文档版本**: v2.0 — 基于 56+ 源文件逐行深度阅读
> **最后更新**: 2026-05-16
> **分析文件数**: 70 (含构建配置)
