# AnotherRedisDesktopManager 深度分析文档

> 基于 2026-05-15 全量源码逐文件阅读，覆盖所有 65+ 源文件

---

## 一、项目概览

| 项目属性 | 值 |
|---------|---|
| 名称 | Another Redis Desktop Manager (ARDM) |
| 版本 | 1.7.1 |
| 技术栈 | Electron 12.2.3 + Vue 2.6.14 + Element UI 2.15.14 |
| Redis 客户端 | ioredis 5.3.2 |
| 构建工具 | Webpack 4 + Babel |
| 包大小 | ~1.5MB (pack 后) |
| 语言支持 | 13 种语言 (en/cn/tw/tr/ru/pt/de/fr/ua/it/es/ko/vi) |
| 源文件数 | 65+ (不含 node_modules/static) |

---

## 二、架构设计

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────┐
│                   Electron Main Process               │
│  ┌─────────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │electron-main│ │ update.js│ │ font-manager.js   │ │
│  │  (窗口管理)  │ │(自动更新) │ │  (系统字体列表)    │ │
│  └─────────────┘ └──────────┘ └───────────────────┘ │
│  ┌─────────────┐ ┌──────────────────────────────┐   │
│  │ win-state.js│ │     IPC Bridge               │   │
│  │ (窗口状态)   │ │ (ipcMain/ipcRenderer)         │   │
│  └─────────────┘ └──────────────────────────────┘   │
├──────────────────────────────────────────────────────┤
│                   Renderer Process                    │
│  ┌─────────────────────────────────────────────────┐ │
│  │                   main.js                        │ │
│  │  Vue.prototype.$bus / $util / $storage / $shortcut│ │
│  └───────────────┬─────────────────────────────────┘ │
│                  │                                    │
│  ┌───────────────▼─────────────────────────────────┐ │
│  │                  App.vue                         │ │
│  │  ┌──────────┐  ┌─────────────────────────────┐  │ │
│  │  │  Aside   │  │          Tabs                │  │ │
│  │  │ (左侧栏) │  │  (多标签页管理器)              │  │ │
│  │  └──────────┘  └─────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Global Services                     │ │
│  │  bus.js │ storage.js │ util.js │ shortcut.js     │ │
│  │  addon.js │ redisClient.js │ commands.js         │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 2.2 数据流架构

```
用户操作 → Vue 组件 → bus.$emit(事件) → 目标组件处理
                     ↓
              redisClient.js → ioredis → Redis Server
                     ↓
           monkey-patch sendCommand → commandLog 事件
```

### 2.3 核心设计模式

| 模式 | 实现 | 说明 |
|------|------|------|
| **全局事件总线** | `bus.js` (Vue 实例) | 20+ 事件名，跨组件通信 |
| **全局原型注入** | `Vue.prototype.$xxx` | $bus, $util, $storage, $shortcut |
| **Monkey Patch** | `redisClient.js` | 拦截 ioredis sendCommand 实现命令日志和只读模式 |
| **Stream 背压** | SCAN/HSCAN/SSCAN/ZSCAN 流 | pause/resume 控制内存 |
| **虚拟滚动** | vue-virtual-scroller + vue-easy-tree | 大数据量列表渲染 |
| **动态组件** | `<component :is="xxx">` | Tab 内容和 Key 内容编辑器 |
| **localStorage 持久化** | `storage.js` | 连接配置、设置、搜索历史、自定义格式化器 |
| **父子链访问** | `this.$parent.$parent.$parent` | 深层组件通信（反模式） |

---

## 三、模块设计

### 3.1 核心基础设施层

#### 3.1.1 `src/main.js` — 应用入口 (46 行)
- 创建 Vue 实例，挂载 App.vue
- 注入全局原型：`$bus`、`$util`、`$storage`、`$shortcut`
- 全局异常处理：`process.on('uncaughtException')`

#### 3.1.2 `src/bus.js` — 事件总线 (18 行)
```javascript
// Vue 实例作为事件中心
const bus = new Vue();
export default { $on, $emit, $off, $once };
```

**完整事件列表：**

| 事件名 | 发送者 | 接收者 | 用途 |
|--------|--------|--------|------|
| `clickedKey` | KeyList/KeyListVirtualTree/KeyListNormal | Tabs | 点击 Key 打开详情 |
| `openStatus` | ConnectionMenu | Tabs | 打开状态面板 |
| `openCli` | ConnectionMenu | Tabs | 打开 CLI |
| `openDelBatch` | KeyListVirtualTree | Tabs | 打开批量删除 |
| `memoryAnalysis` | ConnectionMenu | Tabs | 打开内存分析 |
| `slowLog` | ConnectionMenu | Tabs | 打开慢日志 |
| `removePreTab` | CliTab/DeleteBatch | Tabs | 关闭当前标签 |
| `removeAllTab` | — | Tabs | 关闭所有标签 |
| `closeConnection` | ConnectionMenu/Setting | ConnectionWrapper | 关闭连接 |
| `openConnection` | Connections | ConnectionWrapper | 打开连接 |
| `refreshConnections` | ConnectionMenu/Setting/NewConnectionDialog | Aside/Connections | 刷新连接列表 |
| `refreshKeyList` | CliTab/DeleteBatch/ConnectionMenu | KeyList | 刷新 Key 列表 |
| `changeDb` | CliTab/OperateItem | CliTab | 切换 DB |
| `changeMatchMode` | OperateItem | KeyList | 切换精确/模糊搜索 |
| `commandLog` | redisClient (monkey-patch) | CommandLog | 记录命令日志 |
| `reloadSettings` | Setting | App | 重新加载设置 |
| `update-check` | Setting/UpdateCheck | UpdateCheck | 检查更新 |
| `fontInited` | addon | CliContent/JsonEditor | 字体初始化完成 |
| `refreshViewers` | CustomFormatter | FormatViewer | 刷新查看器 |
| `addCustomFormatter` | — | CustomFormatter | 添加自定义格式化器 |
| `duplicateConnection` | ConnectionMenu | ConnectionMenu | 复制连接 |

#### 3.1.3 `src/storage.js` — 持久化存储 (193 行)
- 基于 localStorage 的封装
- 连接 CRUD：`getConnections()`, `addConnection()`, `deleteConnection()`, `updateConnection()`
- 连接排序：`getSortedConnections()` 支持 custom sort
- 设置管理：`getSetting()`, `saveSettings()`
- 搜索历史：`getSearchTips()`, `addSearchTips()`
- CLI 历史：`getStorageKeyByName('cli_tip', name)`
- 自定义 DB 名：`getCustomDBNames()`, `saveCustomDBNames()`
- 自定义格式化器：`getCustomFormatter()`, `saveCustomFormatters()`
- 字体：`getFontFamily()`, `saveFontFamily()`
- 侧边栏宽度：`getSidebarWidth()`, `saveSidebarWidth()`

#### 3.1.4 `src/util.js` — 工具库 (391 行)

**Buffer 处理：**
- `bufToString(buf)` — Buffer → 可显示字符串（不可见字节显示为 Hex）
- `bufToHex(buf)` — Buffer → Hex 字符串
- `bufToBinary(buf)` — Buffer → 二进制字符串
- `binaryStringToBuffer(str)` — 二进制字符串 → Buffer
- `xToBuffer(hexStr)` — Hex 字符串 → Buffer
- `bufToQuotation(buf)` — Buffer 带引号字符串
- `bufVisible(buf)` — 判断 Buffer 是否全部可见字符

**格式检测与转换：**
- `isJson(str)` — JSON 格式检测
- `isMsgpack(buf)` — Msgpack 格式检测
- `isPHPSerialize(buf)` — PHP 序列化检测
- `isJavaSerialize(buf)` — Java 序列化检测 (0xAC 0xED 开头)
- `isPickle(buf)` — Pickle 格式检测 (0x80 开头)
- `isBrotli(buf)` — Brotli 压缩检测
- `isGzip(buf)` — Gzip 压缩检测 (0x1F 0x8B)
- `isDeflate(buf)` — Deflate 压缩检测
- `isProtobuf(buf)` — Protobuf 检测
- `zippedToString(buf, type)` — 解压 (brotli/gzip/deflate/deflateRaw)

**Key 树构建：**
- `keysToTree(keys, separator)` — 将扁平 Key 数组转为树结构

**其他工具：**
- `debounce(fn, delay)` — 防抖
- `copyToClipboard(text)` — 剪贴板复制
- `createAndDownloadFile(filename, content)` — 文件下载
- `humanFileSize(bytes)` — 人类可读文件大小
- `base64Encode/Decode(str)` — Base64 编解码
- `cloneObjWithBuff(obj)` — 深克隆含 Buffer 的对象
- `cutString(str, max)` — 截断字符串

#### 3.1.5 `src/redisClient.js` — Redis 连接管理 (380 行)

**连接模式：**
1. **Standalone** — 直连单节点
2. **Cluster** — 集群模式 (`new Redis.Cluster`)
3. **Sentinel** — 哨兵模式 (`new Redis({sentinels, name, ...})`)
4. **SSH Tunnel** — SSH 隧道 (`ssh2-client`)
5. **SSL/TLS** — 加密连接

**核心机制：**
- **Monkey Patch**: 拦截 `Redis.prototype.sendCommand` 实现命令日志记录
- **Readonly 模式**: 拦截写命令，返回错误提示
- **HGETALL Transformer**: 自动将 `[k1,v1,k2,v2]` 转为 `{k1:v1, k2:v2}`
- **重试策略**: `retryStrategy(times)` 指数退避
- **SSH + Cluster NAT 映射**: `natMap` 处理 SSH 隧道下的集群节点地址转换
- **命令日志格式**: `{command: {name, args}, cost, time, connectionName}`

#### 3.1.6 `src/commands.js` — Redis 命令定义 (200 行)
- `adminCMD` — 管理命令 (INFO, CONFIG, CLIENT, SLOWLOG 等)
- `readCMD` — 读命令 (GET, HGET, LRANGE, SMEMBERS 等)
- `writeCMD` — 写命令 (SET, HSET, LPUSH, SADD, ZADD, DEL 等)
- `allCMD` — 全部命令（含子命令如 CONFIG SET/GET），用于 CLI 自动补全

#### 3.1.7 `src/shortcut.js` — 快捷键管理 (31 行)
- 基于 `keymaster` 库
- 支持 Scope 隔离（每个 Tab 独立快捷键作用域）
- `bind(key, scope, handler)` — 绑定快捷键
- `deleteScope(scope)` — 删除作用域
- `setScope(scope)` — 切换作用域

#### 3.1.8 `src/addon.js` — Electron 集成 (121 行)
- 字体初始化：通过 IPC 获取系统字体列表
- 页面缩放：`webFrame.setZoomFactor()`
- CLI 参数处理：`--new` 新窗口，`--href` 打开 Redis URL
- 暗黑主题：监听 OS 主题变化
- 窗口控制：最小化、最大化、隐藏

---

### 3.2 布局层

#### 3.2.1 `src/App.vue` — 根组件 (251 行)
- **两栏布局**: 可拖拽侧边栏 (Aside) + 主内容区 (Tabs)
- **侧边栏拖拽**: mousedown/mousemove/mouseup 实现，宽度 200-600px
- **暗黑模式**: `.dark-mode` CSS 类切换
- **vxe-table 暗黑**: CSS 变量覆盖
- **全局对话框**: Setting, CommandLog, HotKeys, CustomFormatter, NewConnectionDialog

#### 3.2.2 `src/Aside.vue` — 左侧边栏 (108 行)
- 新建连接按钮
- 设置/命令日志/快捷键/自定义格式化器对话框入口
- 连接列表 `<Connections />`

#### 3.2.3 `src/router/index.js` — 路由 (15 行)
- 单一路由 `/` → Tabs 组件
- 实际页面切换通过 Tab 组件内部管理，非 Vue Router

---

### 3.3 连接管理层

#### 3.3.1 `src/components/Connections.vue` — 连接列表 (119 行)
- 搜索过滤连接
- `sortablejs` 拖拽排序
- 展开/折叠连接 → 触发 `openConnection`/`closeConnection`

#### 3.3.2 `src/components/ConnectionWrapper.vue` — 连接生命周期 (262 行)
- 调用 `redisClient.js` 创建连接
- Ping 心跳保活 (30s 间隔)
- DB 选择与 Key 数量获取 (`INFO KEYSPACE`)
- 颜色标记
- 包含子组件：ConnectionMenu + OperateItem + KeyList

#### 3.3.3 `src/components/NewConnectionDialog.vue` — 连接表单 (342 行)
**表单字段：**
- 基础：Host, Port, Auth, Username, Name, Separator
- SSH：Host, Port, Username, Password, PrivateKey, Passphrase, Timeout
- SSL：Key, Cert, CA, SNI
- Sentinel：MasterName, NodePassword
- Cluster：复选框
- Readonly：复选框

**模式：** 新建 / 编辑（`editMode` prop）

#### 3.3.4 `src/components/ConnectionMenu.vue` — 连接菜单 (454 行)
**操作列表：**
- 状态页 / CLI / 刷新连接
- 关闭 / 编辑 / 删除 / 复制连接
- 颜色标记
- 内存分析 / 慢日志
- 导入 Key (RESTORE 命令，CSV 格式：hex_key,hex_content,ttl)
- 导入 CMD (splitargs 解析 + callBuffer 执行)
- Flush DB (需输入 'y' 确认)

---

### 3.4 Key 浏览层

#### 3.4.1 `src/components/KeyList.vue` — Key 扫描引擎 (349 行)
**SCAN 流程：**
```
SCAN → pause at pageSize → 用户点击"加载更多" → resume
```
- `scanBufferStream()` 流式扫描
- Cluster 并行扫描：`client.nodes('master')` 所有主节点
- 精确匹配模式：`GET` 确认 Key 存在
- 加载更多/加载全部
- 批量导出：`DUMP` + `PTTL` → CSV 文件

#### 3.4.2 `src/components/KeyListVirtualTree.vue` — 虚拟树浏览器 (622 行)
**核心特性：**
- `@qii404/vue-easy-tree` 虚拟滚动树
- 分隔符 (`:`) 分割构建树结构
- 文件夹/Key 图标 + Key 数量显示
- 右键菜单：复制/删除/多选/新标签打开/导出/加载文件夹/内存分析/删除文件夹
- Shift+Click 多选 + Checkbox 批量操作
- 200K 节点溢出限制
- 展开状态持久化

#### 3.4.3 `src/components/KeyListNormal.vue` — 扁平列表浏览器 (99 行)
- 简单 `<ul>` 列表 + RightClickMenu
- 点击/右键打开 Key

#### 3.4.4 `src/components/OperateItem.vue` — DB/搜索/新建面板 (471 行)
- DB 选择器：`INFO KEYSPACE` 获取 Key 数量
- 自定义 DB 名称（localStorage 存储）
- 搜索输入 + 自动补全历史
- 精确搜索复选框
- 新建 Key 对话框（7 种类型：string, hash, list, set, zset, stream, ReJSON）

---

### 3.5 Key 详情层

#### 3.5.1 `src/components/KeyDetail.vue` — Key 详情包装器 (158 行)
**类型→组件映射：**
```javascript
string    → KeyContentString
hash      → KeyContentHash
zset      → KeyContentZset
set       → KeyContentSet
list      → KeyContentList
stream    → KeyContentStream
ReJSON-RL → KeyContentReJson  // RedisJSON 模块
json      → KeyContentReJson  // TairJSON
tair-json → KeyContentReJson
```

#### 3.5.2 `src/components/KeyHeader.vue` — Key 头部操作 (307 行)
- Key 名称输入 + 重命名 (RENAME，需输入 'y' 确认)
- TTL 输入 + PERSIST/EXPIRE
- 删除按钮 (DEL)
- 自动刷新开关 (setInterval)
- Dump 命令按钮
- 快捷键：Ctrl+R 刷新，Ctrl+D 删除

---

### 3.6 数据类型编辑器

#### 3.6.1 `KeyContentString.vue` — String 编辑器 (103 行)
- `FormatViewer` 自动格式检测
- GET/SET 操作
- Ctrl+S 保存
- Dump 为 SET 命令

#### 3.6.2 `KeyContentHash.vue` — Hash 编辑器 (333 行)
- vxe-table 表格展示
- `HSCAN` 流式扫描 + pause/resume
- `HLEN` 总数
- `HTTL`/`HEXPIRE` (Redis >= 7.4) 字段级 TTL
- 编辑：HSET new + HDEL old
- 新增：HSET
- 删除：HDEL
- Dump 为 HSET 命令

#### 3.6.3 `KeyContentList.vue` — List 编辑器 (295 行)
- `LRANGE` 分页加载
- `LLEN` 总数
- 编辑：`LINSERT AFTER` + `LREM` (保持顺序)
- 新增：`RPUSH`
- 删除：`LREM`
- Dump 为 RPUSH 命令

#### 3.6.4 `KeyContentSet.vue` — Set 编辑器 (283 行)
- `SSCAN` 流式扫描
- `SCARD` 总数
- 编辑：`SADD` new + `SREM` old
- 删除：`SREM`
- Dump 为 SADD 命令

#### 3.6.5 `KeyContentZset.vue` — Zset 编辑器 (328 行)
- **双模式**: ZRANGE/ZREVRANGE (有序，默认) 或 ZSCAN (搜索模式)
- `ZCARD` 总数
- ASC/DESC 切换
- 编辑：`ZADD` new + `ZREM` old
- Dump 为 ZADD 命令

#### 3.6.6 `KeyContentStream.vue` — Stream 编辑器 (427 行)
- `XREVRANGE` 分页加载
- `XLEN` 总数
- Min/Max ID 过滤
- `XADD` 新增
- `XDEL` 删除
- Groups 信息：`XINFO GROUPS` + `XINFO CONSUMERS`
- Dump 为 XADD 命令

#### 3.6.7 `KeyContentReJson.vue` — ReJSON 编辑器 (102 行)
- `JSON.GET` / `JSON.SET`
- JSON 验证
- Ctrl+S 保存
- Dump 为 JSON.SET 命令

---

### 3.7 格式化查看器层

#### 3.7.1 `src/components/FormatViewer.vue` — 自动格式检测 (293 行)
**14 种内置查看器：**
1. ViewerText — 纯文本
2. ViewerHex — Hex 显示
3. ViewerJson — JSON (JSONbig 支持大整数)
4. ViewerBinary — 二进制显示
5. ViewerMsgpack — Msgpack (algo-msgpack-with-bigint)
6. ViewerPHPSerialize — PHP 序列化 (php-serialize)
7. ViewerJavaSerialize — Java 序列化 (java-object-serialization, 只读)
8. ViewerPickle — Python Pickle (pickleparser, 只读)
9. ViewerBrotli — Brotli 压缩 (zlib.brotliDecompressSync)
10. ViewerGzip — Gzip 压缩 (zlib.gunzipSync)
11. ViewerDeflate — Deflate 压缩 (zlib.inflateSync)
12. ViewerDeflateRaw — DeflateRaw 压缩 (zlib.inflateRawSync)
13. ViewerProtobuf — Protobuf (rawproto + protobufjs, 可选 .proto 文件)
14. ViewerOverSize — 超大文件 (>20MB, 只读截断)
15. ViewerCustom — 自定义格式化器 (shell exec)

**自动检测链：**
```
JSON → PHPSerialize → JavaSerialize → Pickle → Msgpack → Brotli → Gzip → Deflate → Protobuf → DeflateRaw → Hex → Text
```

#### 3.7.2 `src/components/JsonEditor.vue` — JSON 编辑器 (238 行)
- Monaco Editor 0.30
- JSONbig 支持大整数
- 折叠/展开全部
- JSON 验证
- 字体跟随全局设置

#### 3.7.3 `src/components/CliContent.vue` — CLI 内容显示 (165 行)
- Monaco Editor (只读模式)
- `vs-dark` 主题
- 自动滚动到底部
- 自定义滚动条样式

---

### 3.8 多标签页层

#### 3.8.1 `src/components/Tabs.vue` — 标签页管理器 (447 行)
**6 种标签类型：**

| 类型 | 组件 | 命名规则 |
|------|------|---------|
| Status | Status | `status_{name}` |
| CliTab | CliTab | `cli_{name}_{random}` |
| DeleteBatch | DeleteBatch | `del_batch_{name}` |
| MemoryAnalysis | MemoryAnalysis | `memory_{name}` |
| SlowLog | SlowLog | `slow_log_{name}` |
| KeyDetail | KeyDetail | `{keyStr} \| {name} \| DB{db}` |

**标签策略：**
- Key 标签：替换当前 Key 标签 OR 新标签 (Ctrl+Click)
- 非 Key 标签：始终新开
- 右键菜单：关闭/关闭其他/关闭右侧/关闭左侧
- 鼠标滚轮切换标签
- 每个标签独立快捷键 Scope

---

### 3.9 CLI 层

#### 3.9.1 `src/components/CliTab.vue` — 命令行界面 (466 行)
**功能：**
- `client.duplicate()` 独立连接
- 命令自动补全（allCMD + 历史命令）
- MULTI/EXEC 事务队列
- SUBSCRIBE/PSUBSCRIBE 订阅模式 + 停止按钮
- MONITOR 监控模式 + 停止按钮
- UP/DOWN 历史导航
- Ctrl+L 清屏
- 递归结果格式化（处理嵌套数组/pipeline 结果）
- 写命令执行后自动刷新 Key 列表
- 历史命令持久化（localStorage，最多 200 条）

---

### 3.10 工具层

#### 3.10.1 `src/components/Status.vue` — 服务器状态 (423 行)
- 自动刷新 (2s 间隔)
- 3 张卡片：Server (version/OS/PID), Memory (used/peak/lua), Stats (clients/connections/commands)
- Key 统计表：DB/Keys/Expires/Avg TTL
- Cluster 节点并行 INFO KEYSPACE
- 全量 INFO 搜索表

#### 3.10.2 `src/components/MemoryAnalysis.vue` — 内存分析 (330 行)
- SCAN + MEMORY USAGE 并行
- RecycleScroller 虚拟滚动
- 暂停/继续扫描
- 大小排序 (ASC/DESC)
- 最小大小过滤
- 200K 扫描上限
- 点击跳转 Key 详情

#### 3.10.3 `src/components/SlowLog.vue` — 慢日志 (234 行)
- `SLOWLOG GET` 获取慢日志
- `CONFIG GET slowlog-log-slower-than/max-len` 获取配置
- 耗时排序 (ASC/DESC)
- RecycleScroller 虚拟滚动

#### 3.10.4 `src/components/DeleteBatch.vue` — 批量删除 (256 行)
- 支持指定 Key 列表 + Pattern 扫描
- SCAN 流式扫描 + 暂停/继续
- Standalone: 批量 DEL (5000 一批)
- Cluster: 逐个 DEL
- RecycleScroller 虚拟滚动

#### 3.10.5 `src/components/CommandLog.vue` — 命令日志 (120 行)
- vxe-table 展示
- 最大 5000 条记录
- 过滤：关键词 + 仅写命令
- 隐藏 ping 命令
- Auth 命令参数脱敏 (`***`)

#### 3.10.6 `src/components/Setting.vue` — 设置对话框 (356 行)
- UI 设置：主题 (system/light/dark)、语言、缩放、字体
- 通用设置：KeysPageSize (10-20000)
- 连接导入/导出 (Base64 编码的 JSON)
- 版本信息、清除缓存、检查更新

#### 3.10.7 `src/components/CustomFormatter.vue` — 自定义格式化器 (176 行)
- 管理自定义格式化器列表
- 每个格式化器：Name + Command + Params
- 模板变量：`{KEY}`, `{VALUE}`, `{FIELD}`, `{SCORE}`, `{MEMBER}`, `{HEX}`, `{HEX_FILE}`
- 长内容 (>8000) 自动写入临时文件

---

### 3.11 辅助组件

| 组件 | 行数 | 功能 |
|------|------|------|
| `RightClickMenu.vue` | 105 | 通用右键菜单 |
| `ScrollToTop.vue` | 130 | 回到顶部按钮 (requestAnimationFrame 动画) |
| `HotKeys.vue` | 56 | 快捷键提示表格 |
| `UpdateCheck.vue` | 155 | 自动更新检查 (electron-updater) |
| `LanguageSelector.vue` | 45 | 语言选择器 (13 种语言) |
| `InputBinary.vue` | 46 | 二进制输入 (自动 Hex/可见字符切换) |
| `InputPassword.vue` | ~50 | 密码输入 (显示/隐藏切换) |
| `FileInput.vue` | ~40 | 文件路径输入 (Electron dialog) |
| `PaginationTable.vue` | ~40 | 分页表格 |

---

### 3.12 Electron 主进程层

#### 3.12.1 `pack/electron/electron-main.js` (226 行)
- BrowserWindow 创建 + 窗口状态恢复
- `nodeIntegration: true`, `contextIsolation: false` (安全性较低)
- IPC：hideWindow, minimizeWindow, toggleMaximize, getMainArgs, changeTheme, getTempPath
- OS 主题变化通知
- macOS 菜单栏配置
- URL 参数传递：version, dark

#### 3.12.2 `pack/electron/update.js` (54 行)
- electron-updater 自动更新
- 禁用自动下载，用户确认后手动下载
- 进度通知

#### 3.12.3 `pack/electron/win-state.js` (115 行)
- 窗口位置/大小持久化 (JSON 文件)
- 主显示器检测，外部显示器位置重置
- 最小窗口尺寸保护 (250x250)

#### 3.12.4 `pack/electron/font-manager.js` (19 行)
- IPC 处理获取系统字体列表 (font-list 库)

---

### 3.13 国际化层

#### 3.13.1 `src/i18n/i18n.js` (97 行)
- vue-i18n 8.x (Vue 2 模式)
- Element UI locale 集成
- 13 种语言：en, cn, tw, tr, ru, pt, de, fr, ua, it, es, ko, vi

---

## 四、功能设计

### 4.1 功能矩阵

| 功能模块 | 子功能 | 实现方式 |
|---------|--------|---------|
| **连接管理** | 新建/编辑/删除/复制连接 | storage.js CRUD |
| | SSH 隧道 | ssh2-client |
| | SSL/TLS | ioredis tls 选项 |
| | Sentinel | ioredis sentinel 选项 |
| | Cluster | ioredis Cluster |
| | Readonly 模式 | sendCommand 拦截 |
| | 连接排序 | sortablejs |
| | 颜色标记 | el-color-picker |
| **Key 浏览** | SCAN 流式扫描 | scanBufferStream |
| | 虚拟树视图 | vue-easy-tree |
| | 扁平列表视图 | ul + RightClickMenu |
| | 精确搜索 | GET 确认 |
| | 模糊搜索 | SCAN MATCH |
| | Cluster 并行扫描 | nodes('master') |
| | Key 导出 | DUMP + PTTL → CSV |
| | Key 导入 | RESTORE from CSV |
| | 批量删除 | DEL (standalone: 5000/batch) |
| **数据编辑** | String (GET/SET) | FormatViewer + 保存 |
| | Hash (HSCAN/HSET/HDEL) | vxe-table + inline edit |
| | List (LRANGE/RPUSH/LREM) | vxe-table + pagination |
| | Set (SSCAN/SADD/SREM) | vxe-table + streaming |
| | Zset (ZRANGE/ZADD/ZREM) | vxe-table + dual mode |
| | Stream (XREVRANGE/XADD/XDEL) | vxe-table + groups |
| | ReJSON (JSON.GET/JSON.SET) | FormatViewer + save |
| **格式查看** | 14 种自动检测 | util.js isXxx() |
| | 自定义格式化器 | shell exec + template |
| | Protobuf (.proto 文件) | rawproto + protobufjs |
| **CLI** | 命令自动补全 | allCMD + history |
| | MULTI/EXEC | multi queue |
| | SUBSCRIBE/MONITOR | duplicate client |
| | 历史导航 | UP/DOWN keys |
| **服务器工具** | 状态面板 | INFO + auto refresh |
| | 内存分析 | MEMORY USAGE |
| | 慢日志 | SLOWLOG GET |
| | 命令日志 | sendCommand monkey-patch |
| | Flush DB | FLUSHDB (y 确认) |
| **UI 功能** | 多标签页 | 6 种 Tab 类型 |
| | 暗黑模式 | CSS class 切换 |
| | 13 种语言 | vue-i18n |
| | 字体选择 | font-list + monaco |
| | 页面缩放 | webFrame.setZoomFactor |
| | 自动更新 | electron-updater |

### 4.2 数据流详解

#### 4.2.1 连接打开流程
```
Connections.vue (click)
  → bus.$emit('openConnection', config)
    → ConnectionWrapper.vue
      → redisClient.js (createClient)
        → ioredis new Redis / new Redis.Cluster
          → SSH tunnel (if needed)
          → Sentinel resolution (if needed)
      → ping interval start
      → INFO KEYSPACE → DB key counts
```

#### 4.2.2 Key 扫描流程
```
OperateItem.vue (search input)
  → KeyList.vue initShow()
    → scanBufferStream({match, count})
      → stream.on('data', keys => ...)
        → pause at pageSize
        → user clicks "load more"
          → resume stream
    → cluster: nodes('master').map(node => node.scanBufferStream())
```

#### 4.2.3 Key 编辑流程 (以 Hash 为例)
```
KeyContentHash.vue
  → HSCAN streaming → lineData[]
  → User clicks edit
    → FormatViewer auto-detect format
    → User modifies value
    → Save: HSET key field newValue + HDEL key oldField
  → User clicks add
    → HSET key field value
  → User clicks delete
    → HDEL key field
```

---

## 五、设计规范

### 5.1 代码风格

| 规范 | 实际做法 |
|------|---------|
| 组件风格 | Vue 2 Options API (data/methods/computed/watch/mounted) |
| 模板语法 | `<template>` + `<script>` + `<style>` SFC |
| CSS 作用域 | 全局 CSS + `.dark-mode` 前缀 |
| 状态管理 | 无 Vuex/Pinia，纯 data + localStorage + bus |
| 类型系统 | 无 TypeScript，纯 JavaScript |
| 异步处理 | Promise.then/catch (无 async/await) |
| 组件通信 | bus.$emit/$on + $parent 链 + props/$emit |

### 5.2 CSS 规范

- 全局 CSS，无 scoped
- 暗黑模式：`.dark-mode` 前缀选择器
- 命名：BEM-like 但不严格 (`connection-menu-title`, `keys-body`, `del-batch-card`)
- 高度计算：`calc(100vh - Npx)` 精确像素计算
- 颜色硬编码：`#263238`, `#324148`, `#f7f7f7` 等

### 5.3 组件设计模式

```
组件结构:
├── template (HTML 模板)
├── script (Options API)
│   ├── data() — 响应式状态
│   ├── props — 输入
│   ├── computed — 派生状态
│   ├── watch — 侦听器
│   ├── methods — 方法
│   ├── created — 创建钩子 (bus.$on)
│   ├── mounted — 挂载钩子 (initShow, initShortcut)
│   └── beforeDestroy — 销毁钩子 (cleanup)
└── style (全局 CSS)
```

### 5.4 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 组件文件 | PascalCase.vue | `KeyDetail.vue`, `CliTab.vue` |
| 组件目录 | kebab-case | `contents/`, `viewers/` |
| data 属性 | camelCase | `lineData`, `scanStreams` |
| 方法 | camelCase | `initShow`, `execSave` |
| 事件名 | camelCase | `clickedKey`, `openStatus` |
| CSS 类 | kebab-case | `connection-menu-title` |
| localStorage key | 描述性 | `ardm_connections`, `theme`, `lang` |

### 5.5 错误处理模式

```javascript
// Promise catch 链
this.client.call('CMD', args).then(reply => {
  // 成功处理
}).catch(e => {
  this.$message.error(e.message);
});

// 确认对话框
this.$confirm('确认删除?', { type: 'warning' })
  .then(() => { /* 执行 */ })
  .catch(() => {}); // 取消静默
```

---

## 六、依赖分析

### 6.1 核心依赖

| 依赖 | 版本 | 用途 | 迁移替代 |
|------|------|------|---------|
| `vue` | 2.6.14 | UI 框架 | Vue 3.5 |
| `element-ui` | 2.15.14 | UI 组件库 | Element Plus |
| `ioredis` | 5.3.2 | Redis 客户端 | Rust redis 0.27 |
| `electron` | 12.2.3 | 桌面框架 | Tauri 2 |
| `vxe-table` | 3.9.x | 数据表格 | @visactor/vtable |
| `monaco-editor` | 0.30.1 | 代码编辑器 | Monaco (保留) |
| `vue-virtual-scroller` | 2.x | 虚拟滚动 | @visactor/vtable |
| `@qii404/vue-easy-tree` | — | 虚拟树 | @visactor/vtable |
| `keymaster` | 1.6.2 | 快捷键 | 自定义 composable |
| `sortablejs` | 1.15.0 | 拖拽排序 | vuedraggable-next |
| `ssh2-client` | — | SSH 隧道 | Rust russh |
| `@qii404/redis-splitargs` | — | 命令解析 | Rust 实现 |
| `@qii404/json-bigint` | — | 大整数 JSON | 自定义解析 |
| `algo-msgpack-with-bigint` | — | Msgpack | Rust 库 |
| `php-serialize` | — | PHP 序列化 | Rust 库 |
| `java-object-serialization` | — | Java 序列化 | Rust 库 |
| `pickleparser` | — | Python Pickle | Rust 库 |
| `rawproto` | — | Protobuf 解析 | Rust protobuf |
| `protobufjs` | — | Protobuf 编解码 | Rust protobuf |
| `font-list` | 1.4.5 | 系统字体列表 | Tauri API |
| `electron-updater` | 4.6.5 | 自动更新 | Tauri updater |

### 6.2 依赖关系图

```
App.vue
├── Aside.vue
│   ├── Connections.vue (sortablejs)
│   ├── NewConnectionDialog.vue
│   ├── Setting.vue (LanguageSelector)
│   ├── CommandLog.vue (vxe-table)
│   ├── HotKeys.vue
│   └── CustomFormatter.vue (FileInput)
└── Tabs.vue
    ├── Status.vue (ScrollToTop)
    ├── CliTab.vue (CliContent → monaco-editor)
    ├── DeleteBatch.vue (RecycleScroller)
    ├── MemoryAnalysis.vue (RecycleScroller)
    ├── SlowLog.vue (RecycleScroller)
    └── KeyDetail.vue
        ├── KeyHeader.vue
        ├── KeyContentString.vue (FormatViewer)
        ├── KeyContentHash.vue (vxe-table, FormatViewer)
        ├── KeyContentList.vue (vxe-table)
        ├── KeyContentSet.vue (vxe-table)
        ├── KeyContentZset.vue (vxe-table)
        ├── KeyContentStream.vue (vxe-table)
        └── KeyContentReJson.vue (FormatViewer)

FormatViewer.vue
├── ViewerText.vue
├── ViewerHex.vue
├── ViewerJson.vue (JsonEditor → monaco-editor)
├── ViewerBinary.vue
├── ViewerMsgpack.vue (JsonEditor)
├── ViewerPHPSerialize.vue (JsonEditor)
├── ViewerJavaSerialize.vue (JsonEditor)
├── ViewerPickle.vue (JsonEditor)
├── ViewerBrotli.vue (JsonEditor)
├── ViewerGzip.vue (JsonEditor)
├── ViewerDeflate.vue (JsonEditor)
├── ViewerProtobuf.vue (JsonEditor)
├── ViewerOverSize.vue
└── ViewerCustom.vue (JsonEditor, shell exec)
```

---

## 七、迁移要点

### 7.1 架构级变更

| 原架构 | 新架构 | 影响 |
|--------|--------|------|
| Electron Main/Renderer | Tauri Rust/Frontend | 全部主进程代码重写 |
| Vue 2 Options API | Vue 3 Composition API + TSX | 全部组件重写 |
| Element UI | Element Plus | API 差异，部分组件行为变化 |
| ioredis (Node.js) | redis (Rust) | 连接管理完全重写 |
| localStorage | tauri-plugin-store | 存储层替换 |
| bus.js (Vue 事件) | mitt + Pinia | 状态管理升级 |
| vxe-table | @visactor/vtable | 表格 API 完全不同 |
| vue-easy-tree | @visactor/vtable | 树组件替换 |
| keymaster | 自定义 composable | 快捷键系统重写 |

### 7.2 功能迁移优先级

**Phase 1 — 核心功能 (MVP):**
1. 连接管理 (CRUD + SSH/SSL/Cluster/Sentinel)
2. Key 扫描与浏览 (SCAN + 虚拟树)
3. Key 详情 (7 种数据类型编辑)
4. 多标签页
5. DB 选择器

**Phase 2 — 高级功能:**
1. CLI 命令行
2. 格式化查看器 (14 种)
3. 命令日志
4. 自定义格式化器

**Phase 3 — 工具功能:**
1. 服务器状态
2. 内存分析
3. 慢日志
4. 批量删除
5. Key 导入/导出

**Phase 4 — UI 增强:**
1. 暗黑模式
2. 多语言 (13 种)
3. 快捷键系统
4. 字体选择
5. 自动更新

### 7.3 关键技术挑战

1. **SCAN 流式传输**: Rust redis 库不支持 SCAN stream，需自行实现分页 SCAN
2. **SSH 隧道**: russh 库异步 API，需与 redis 连接集成
3. **Cluster NAT 映射**: SSH + Cluster 场景下的节点地址转换
4. **格式检测链**: 14 种格式的检测逻辑需在 Rust 或前端重新实现
5. **虚拟树 + 虚拟列表**: @visactor/vtable 的 API 与 vue-easy-tree 完全不同
6. **Monaco Editor**: 在 Tauri 中使用需确认兼容性
7. **自定义格式化器**: Shell exec 在 Tauri 中需通过 Rust Command 实现
8. **Protobuf**: .proto 文件加载和编解码需 Rust protobuf 库

---

## 八、文件索引

### 8.1 源文件清单

| 文件路径 | 行数 | 职责 |
|---------|------|------|
| `src/main.js` | 46 | 应用入口 |
| `src/App.vue` | 251 | 根组件布局 |
| `src/Aside.vue` | 108 | 左侧边栏 |
| `src/bus.js` | 18 | 事件总线 |
| `src/shortcut.js` | 31 | 快捷键管理 |
| `src/storage.js` | 193 | 持久化存储 |
| `src/addon.js` | 121 | Electron 集成 |
| `src/redisClient.js` | 380 | Redis 连接管理 |
| `src/util.js` | 391 | 工具函数库 |
| `src/commands.js` | 200 | Redis 命令定义 |
| `src/router/index.js` | 15 | 路由配置 |
| `src/components/Tabs.vue` | 447 | 多标签页管理 |
| `src/components/Connections.vue` | 119 | 连接列表 |
| `src/components/ConnectionWrapper.vue` | 262 | 连接生命周期 |
| `src/components/ConnectionMenu.vue` | 454 | 连接菜单 |
| `src/components/NewConnectionDialog.vue` | 342 | 连接表单 |
| `src/components/KeyList.vue` | 349 | Key 扫描引擎 |
| `src/components/KeyListVirtualTree.vue` | 622 | 虚拟树浏览器 |
| `src/components/KeyListNormal.vue` | 99 | 扁平列表浏览器 |
| `src/components/OperateItem.vue` | 471 | DB/搜索/新建面板 |
| `src/components/KeyDetail.vue` | 158 | Key 详情包装器 |
| `src/components/KeyHeader.vue` | 307 | Key 头部操作 |
| `src/components/FormatViewer.vue` | 293 | 自动格式检测 |
| `src/components/JsonEditor.vue` | 238 | JSON 编辑器 |
| `src/components/CliContent.vue` | 165 | CLI 内容显示 |
| `src/components/CliTab.vue` | 466 | CLI 命令行 |
| `src/components/Status.vue` | 423 | 服务器状态 |
| `src/components/MemoryAnalysis.vue` | 330 | 内存分析 |
| `src/components/SlowLog.vue` | 234 | 慢日志 |
| `src/components/DeleteBatch.vue` | 256 | 批量删除 |
| `src/components/CommandLog.vue` | 120 | 命令日志 |
| `src/components/Setting.vue` | 356 | 设置对话框 |
| `src/components/CustomFormatter.vue` | 176 | 自定义格式化器 |
| `src/components/ScrollToTop.vue` | 130 | 回到顶部 |
| `src/components/RightClickMenu.vue` | 105 | 右键菜单 |
| `src/components/HotKeys.vue` | 56 | 快捷键提示 |
| `src/components/UpdateCheck.vue` | 155 | 更新检查 |
| `src/components/LanguageSelector.vue` | 45 | 语言选择器 |
| `src/components/InputBinary.vue` | 46 | 二进制输入 |
| `src/components/contents/KeyContentString.vue` | 103 | String 编辑器 |
| `src/components/contents/KeyContentHash.vue` | 333 | Hash 编辑器 |
| `src/components/contents/KeyContentList.vue` | 295 | List 编辑器 |
| `src/components/contents/KeyContentSet.vue` | 283 | Set 编辑器 |
| `src/components/contents/KeyContentZset.vue` | 328 | Zset 编辑器 |
| `src/components/contents/KeyContentStream.vue` | 427 | Stream 编辑器 |
| `src/components/contents/KeyContentReJson.vue` | 102 | ReJSON 编辑器 |
| `src/components/viewers/ViewerText.vue` | 57 | 文本查看器 |
| `src/components/viewers/ViewerHex.vue` | 31 | Hex 查看器 |
| `src/components/viewers/ViewerJson.vue` | 46 | JSON 查看器 |
| `src/components/viewers/ViewerBinary.vue` | 31 | 二进制查看器 |
| `src/components/viewers/ViewerMsgpack.vue` | 52 | Msgpack 查看器 |
| `src/components/viewers/ViewerPHPSerialize.vue` | 56 | PHP 序列化查看器 |
| `src/components/viewers/ViewerJavaSerialize.vue` | 39 | Java 序列化查看器 |
| `src/components/viewers/ViewerPickle.vue` | 31 | Pickle 查看器 |
| `src/components/viewers/ViewerBrotli.vue` | 42 | Brotli 查看器 |
| `src/components/viewers/ViewerGzip.vue` | 42 | Gzip 查看器 |
| `src/components/viewers/ViewerDeflate.vue` | 42 | Deflate 查看器 |
| `src/components/viewers/ViewerDeflateRaw.vue` | 42 | DeflateRaw 查看器 |
| `src/components/viewers/ViewerProtobuf.vue` | 153 | Protobuf 查看器 |
| `src/components/viewers/ViewerOverSize.vue` | 43 | 超大文件查看器 |
| `src/components/viewers/ViewerCustom.vue` | 178 | 自定义查看器 |
| `src/i18n/i18n.js` | 97 | i18n 配置 |
| `src/i18n/langs/*.js` | ~13 文件 | 13 种语言翻译 |
| `pack/electron/electron-main.js` | 226 | Electron 主进程 |
| `pack/electron/update.js` | 54 | 自动更新 |
| `pack/electron/win-state.js` | 115 | 窗口状态 |
| `pack/electron/font-manager.js` | 19 | 字体管理 |
| `pack/electron/package.json` | 71 | Electron 构建配置 |

---

> **文档生成时间**: 2026-05-15  
> **分析文件数**: 65+  
> **总代码行数**: ~12,000 行 (不含 node_modules/static/i18n 详细翻译)
