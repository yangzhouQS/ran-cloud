# AnotherRedisDesktopManager 项目深度理解文档

> **文档目标**：全面深入理解 ARDM 项目的模块设计、架构设计、功能设计和设计规范
> 
> **项目版本**：1.1.1 | **作者**：qii404
> 
> **技术栈**：Electron 12 + Vue 2.6 (Options API) + Element UI 2.x + ioredis 5.3 + Webpack 4

---

## 一、项目概览

### 1.1 项目定位

AnotherRedisDesktopManager（以下简称 ARDM）是一个跨平台（Windows/macOS/Linux）的 Redis 桌面管理客户端，主打"更快、更好、更稳定"。核心特点：

- **轻量级**：相比 RedisDesktopManager 等同类工具更轻
- **全功能**：支持 Standalone/Cluster/Sentinel/SSH/SSL 全部连接模式
- **多格式**：内置 14 种数据格式查看器（JSON/Hex/MsgPack/Protobuf 等）
- **国际化**：支持 13 种语言

### 1.2 项目规模

| 维度 | 数量 |
|---|---|
| 源码文件（`.vue/.js`） | 65+ |
| 核心组件 | 35 个 `.vue` 文件 |
| 工具/服务模块 | 8 个 `.js` 文件 |
| 国际化语言 | 13 种 |
| npm 依赖 | 19 个运行时 + 30 个开发时 |
| 代码行数（估算） | ~15,000 行 |

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 主进程 (Main Process)             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ electron-main│  │   update.js  │  │   win-state.js    │  │
│  │  窗口管理     │  │   自动更新    │  │   窗口状态持久化   │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ font-manager │  │  notarize.js │                         │
│  │  系统字体     │  │  macOS 公证  │                         │
│  └──────────────┘  └──────────────┘                         │
├─────────────────────────────────────────────────────────────┤
│                    Electron 渲染进程 (Renderer)               │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Vue 2 应用                          │   │
│  │                                                        │   │
│  │  ┌──────────┐  ┌──────────────────────────────────┐  │   │
│  │  │ 全局原型  │  │          组件层                    │  │   │
│  │  │ $bus     │  │  App.vue → Aside.vue + Tabs.vue  │  │   │
│  │  │ $util    │  │  └── 35 个子组件                   │  │   │
│  │  │ $storage │  │                                    │  │   │
│  │  │ $shortcut│  │                                    │  │   │
│  │  └──────────┘  └──────────────────────────────────┘  │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │              服务层 (Service Layer)            │    │   │
│  │  │  redisClient.js  storage.js  commands.js      │    │   │
│  │  │  util.js  addon.js  shortcut.js  bus.js       │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │              基础设施层                        │    │   │
│  │  │  ioredis  tunnel-ssh  Element UI  vue-i18n    │    │   │
│  │  │  vxe-table  monaco-editor  sortablejs         │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 架构特征分析

#### 2.2.1 无状态管理库

ARDM **不使用 Vuex/Pinia**，而是采用以下三种方式管理状态：

1. **全局事件总线** ([`bus.js`](AnotherRedisDesktopManager/src/bus.js))：基于 `new Vue()` 的 `$on/$off/$emit/$once`，是整个应用的核心通信机制
2. **localStorage 直读直写** ([`storage.js`](AnotherRedisDesktopManager/src/storage.js))：连接列表、设置、CLI 历史等全部存储在 `localStorage`
3. **Vue 原型挂载** ([`main.js`](AnotherRedisDesktopManager/src/main.js):16-19)：`$bus`、`$util`、`$storage`、`$shortcut` 挂载到 `Vue.prototype`

#### 2.2.2 事件驱动架构

应用内所有模块间通信通过事件总线完成。关键事件流：

```
用户操作 → 组件方法 → $bus.$emit('event') → 其他组件 $bus.$on('event')
                                                    ↓
                                              redisClient.js 操作
                                                    ↓
                                              ioredis → Redis Server
```

核心事件列表：

| 事件名 | 发布者 | 订阅者 | 用途 |
|---|---|---|---|
| `openConnection` | Connections.vue | ConnectionWrapper.vue | 打开连接 |
| `closeConnection` | 多处 | ConnectionWrapper.vue | 关闭连接 |
| `commandLog` | redisClient.js (猴子补丁) | CommandLog.vue | 命令日志记录 |
| `refreshConnections` | addon.js | Connections.vue | 刷新连接列表 |
| `reloadSettings` | Setting.vue | App.vue → addon.js | 重载设置 |
| `update-check` | App.vue | UpdateCheck.vue | 检查更新 |
| `switchKey` | KeyList.vue | KeyDetail.vue | 切换选中 Key |

#### 2.2.3 ioredis 猴子补丁

[`redisClient.js`](AnotherRedisDesktopManager/src/redisClient.js:12-38) 对 `Redis.prototype.sendCommand` 进行猴子补丁（Monkey Patch），实现两个横切关注点：

1. **命令日志**：拦截每次 Redis 命令，记录时间、连接名、命令、耗时，通过 `$bus.$emit('commandLog')` 广播
2. **只读模式**：检查 `connectionReadOnly` 标志，拦截 `writeCMD` 中的写命令

```javascript
// 猴子补丁结构
const { sendCommand } = Redis.prototype;  // 保存原始方法
Redis.prototype.sendCommand = function (...options) {
    // 1. 只读模式检查
    // 2. 无日志标记检查 (withoutLogging)
    // 3. 执行原始命令 + 记录耗时
    // 4. 广播命令日志
};
```

#### 2.2.4 连接工厂模式

[`redisClient.js`](AnotherRedisDesktopManager/src/redisClient.js) 实现了完整的连接工厂，支持 5 种连接模式：

```
createConnection()          → Standalone / Sentinel / Cluster
createSSHConnection()       → SSH + Standalone / SSH + Cluster / SSH + Sentinel
```

连接路由逻辑：

```
createSSHConnection()
  ├── config.sentinelOptions?  → SSH + Sentinel
  │     ├── SSH 隧道 → Sentinel 连接
  │     ├── SENTINEL GET-MASTER-ADDR-BY-NAME
  │     ├── 为 Master 创建 SSH 隧道
  │     └── 连接 Master
  ├── config.cluster?          → SSH + Cluster
  │     ├── SSH 隧道 → Standalone 连接
  │     ├── CLUSTER NODES → 解析 Master 节点
  │     ├── 为每个 Master 创建 SSH 隧道
  │     ├── 构建 NAT Map
  │     └── 创建 Cluster 连接
  └── else                     → SSH + Standalone
        └── SSH 隧道 → Standalone 连接
```

---

## 三、模块设计

### 3.1 文件组织结构

```
src/
├── main.js                 # 应用入口（Vue 实例化 + 全局原型挂载）
├── App.vue                 # 根组件（三栏布局 + 侧边栏拖拽）
├── Aside.vue               # 侧边栏容器（按钮 + 连接列表）
├── bus.js                  # 事件总线（Vue 实例封装）
├── redisClient.js          # Redis 连接工厂（ioredis 封装）
├── storage.js              # 持久化服务（localStorage CRUD）
├── commands.js             # Redis 命令分类（admin/read/write）
├── util.js                 # 工具函数集（Buffer/格式检测/树构建）
├── addon.js                # 附加功能（CLI 参数/字体/缩放/Href）
├── shortcut.js             # 快捷键（keymaster 封装）
│
├── components/             # ====== UI 组件层 ======
│   │
│   ├── ├── 连接管理
│   │   ├── Connections.vue          # 连接列表（拖拽排序 + 分组）
│   │   ├── ConnectionMenu.vue       # 连接右键菜单（14 个操作）
│   │   ├── ConnectionWrapper.vue    # 连接包装器（生命周期管理 + PING 保活）
│   │   └── NewConnectionDialog.vue  # 新建/编辑连接对话框
│   │
│   ├── ├── Key 管理
│   │   ├── KeyList.vue              # Key 列表（SCAN 流式加载）
│   │   ├── KeyListNormal.vue        # Key 平铺列表视图
│   │   ├── KeyListVirtualTree.vue   # Key 虚拟树视图（200K 溢出保护）
│   │   ├── KeyDetail.vue            # Key 详情页（动态组件分发）
│   │   ├── KeyHeader.vue            # Key 操作栏（TTL/重命名/删除）
│   │   └── OperateItem.vue          # 搜索/刷新/视图切换控件
│   │
│   ├── ├── 数据类型编辑器
│   │   ├── contents/
│   │   │   ├── KeyContentString.vue  # String 查看/编辑
│   │   │   ├── KeyContentHash.vue    # Hash 查看/编辑（HSCAN + 行内编辑）
│   │   │   ├── KeyContentList.vue    # List 查看/编辑（LPUSH/RPUSH/LSET）
│   │   │   ├── KeyContentSet.vue     # Set 查看/编辑（SSCAN + SADD/SREM）
│   │   │   ├── KeyContentZset.vue    # ZSet 查看/编辑（排序切换 + ZADD/ZREM）
│   │   │   ├── KeyContentStream.vue  # Stream 查看/编辑（XADD/XDEL + 消费者组）
│   │   │   └── KeyContentReJson.vue  # ReJSON 查看/编辑
│   │   └── JsonEditor.vue           # JSON 编辑器（monaco-editor）
│   │
│   ├── ├── 数据查看器
│   │   ├── viewers/
│   │   │   ├── ViewerText.vue        # 文本查看器
│   │   │   ├── ViewerHex.vue         # 十六进制查看器
│   │   │   ├── ViewerJson.vue        # JSON 查看器
│   │   │   ├── ViewerBinary.vue      # 二进制查看器
│   │   │   ├── ViewerMsgpack.vue     # MsgPack 查看器
│   │   │   ├── ViewerPHPSerialize.vue # PHP 序列化查看器
│   │   │   ├── ViewerJavaSerialize.vue # Java 序列化查看器
│   │   │   ├── ViewerPickle.vue      # Python Pickle 查看器
│   │   │   ├── ViewerGzip.vue        # Gzip 解压查看器
│   │   │   ├── ViewerBrotli.vue      # Brotli 解压查看器
│   │   │   ├── ViewerDeflate.vue     # Deflate 解压查看器
│   │   │   ├── ViewerDeflateRaw.vue  # DeflateRaw 解压查看器
│   │   │   ├── ViewerProtobuf.vue    # Protobuf 查看器（.proto 加载）
│   │   │   └── ViewerOverSize.vue    # 大文件查看器（>20MB 截断）
│   │   ├── FormatViewer.vue          # 格式查看器容器（自动检测 + 切换）
│   │   └── CustomFormatter.vue       # 自定义格式化器管理
│   │
│   ├── ├── 工具组件
│   │   ├── CliTab.vue                # CLI 标签页（命令执行 + 订阅 + MONITOR）
│   │   ├── CliContent.vue            # CLI 内容区（monaco-editor）
│   │   ├── Status.vue                # 服务器状态（INFO 解析 + DB 统计）
│   │   ├── SlowLog.vue               # 慢查询日志
│   │   ├── MemoryAnalysis.vue        # 内存分析（MEMORY USAGE 批量）
│   │   ├── DeleteBatch.vue           # 批量删除
│   │   ├── CommandLog.vue            # 命令日志面板
│   │   └── Tabs.vue                  # 多标签页管理器
│   │
│   └── ├── 辅助组件
│       ├── Setting.vue               # 设置页面
│       ├── HotKeys.vue               # 快捷键提示
│       ├── UpdateCheck.vue           # 更新检查
│       ├── LanguageSelector.vue      # 语言选择器
│       ├── RightClickMenu.vue        # 右键菜单
│       ├── ScrollToTop.vue           # 回到顶部
│       ├── PaginationTable.vue       # 分页表格
│       ├── FileInput.vue             # 文件输入
│       ├── InputPassword.vue         # 密码输入
│       └── InputBinary.vue           # 二进制输入
│
├── i18n/                    # ====== 国际化 ======
│   ├── i18n.js              # vue-i18n 配置
│   └── langs/
│       ├── cn.js            # 简体中文
│       ├── tw.js            # 繁体中文
│       ├── en.js            # 英语
│       ├── de.js            # 德语
│       ├── es.js            # 西班牙语
│       ├── fr.js            # 法语
│       ├── it.js            # 意大利语
│       ├── ko.js            # 韩语
│       ├── pt.js            # 葡萄牙语
│       ├── ru.js            # 俄语
│       ├── tr.js            # 土耳其语
│       ├── ua.js            # 乌克兰语
│       └── vi.js            # 越南语
│
└── router/
    └── index.js             # 路由配置（单路由 → Tabs）
```

### 3.2 模块依赖关系

```
main.js
  ├── App.vue
  │     ├── Aside.vue
  │     │     ├── NewConnectionDialog.vue → redisClient.js
  │     │     ├── Connections.vue → storage.js, sortablejs
  │     │     ├── ConnectionMenu.vue → redisClient.js, storage.js
  │     │     ├── Setting.vue → storage.js
  │     │     ├── CommandLog.vue → bus.js
  │     │     ├── HotKeys.vue
  │     │     └── CustomFormatter.vue → storage.js
  │     ├── Tabs.vue
  │     │     ├── ConnectionWrapper.vue → redisClient.js, bus.js
  │     │     ├── KeyList.vue → redisClient.js, util.js
  │     │     │     ├── KeyListNormal.vue
  │     │     │     ├── KeyListVirtualTree.vue → vue-easy-tree
  │     │     │     └── OperateItem.vue
  │     │     ├── KeyDetail.vue → redisClient.js, util.js
  │     │     │     ├── KeyHeader.vue
  │     │     │     ├── KeyContentString.vue
  │     │     │     ├── KeyContentHash.vue → vxe-table
  │     │     │     ├── KeyContentList.vue → vxe-table
  │     │     │     ├── KeyContentSet.vue → vxe-table
  │     │     │     ├── KeyContentZset.vue → vxe-table
  │     │     │     ├── KeyContentStream.vue → vxe-table
  │     │     │     ├── KeyContentReJson.vue → monaco-editor
  │     │     │     └── FormatViewer.vue → util.js
  │     │     │           └── viewers/Viewer*.vue (14 个)
  │     │     ├── CliTab.vue → redisClient.js
  │     │     │     └── CliContent.vue → monaco-editor
  │     │     ├── Status.vue → redisClient.js
  │     │     ├── SlowLog.vue → redisClient.js
  │     │     ├── MemoryAnalysis.vue → redisClient.js
  │     │     └── DeleteBatch.vue → redisClient.js
  │     └── UpdateCheck.vue → electron updater
  │
  ├── bus.js (全局事件总线)
  ├── util.js (工具函数)
  ├── storage.js (持久化)
  ├── shortcut.js (快捷键)
  ├── addon.js (附加功能)
  └── i18n/i18n.js (国际化)
```

---

## 四、功能设计

### 4.1 连接管理功能

#### 4.1.1 连接配置模型

```javascript
// 连接配置结构（从 NewConnectionDialog.vue 和 storage.js 推断）
{
  key: "timestamp_randomString",    // 唯一标识
  name: "连接名称",
  host: "127.0.0.1",
  port: 6379,
  auth: "密码",
  username: "ACL用户名",
  db: 0,                            // 默认数据库
  
  // 连接选项
  connectionName: "",                // CLIENT SETNAME
  connectionReadOnly: false,         // 只读模式
  separator: ":",                    // Key 分隔符
  
  // Cluster 配置
  cluster: false,
  natMap: {},                        // NAT 地址映射
  
  // Sentinel 配置
  sentinelOptions: {
    masterName: "",
    nodePassword: "",
  },
  
  // SSH 隧道配置
  sshOptions: {
    host: "",
    port: 22,
    username: "",
    password: "",
    privatekey: "",                  // SSH 私钥文件路径
    privatekeybookmark: "",          // macOS 沙盒书签
    passphrase: "",
    timeout: 30,
  },
  
  // SSL/TLS 配置
  sslOptions: {
    ca: "",
    key: "",
    cert: "",
    servername: "",
  },
  
  // UI 状态
  order: 0,                          // 排序序号
  markColor: "",                     // 颜色标记
}
```

#### 4.1.2 连接生命周期

```
1. 用户点击连接 → Connections.vue
2. $bus.$emit('openConnection', name)
3. ConnectionWrapper.vue 接收事件
4. 调用 redisClient.createConnection() 或 createSSHConnection()
5. 连接成功 → $bus.$emit('connected', client)
6. 启动 PING 保活（每 10 秒）
7. 加载 DB 列表 → 初始化 Key 列表
8. 用户关闭 → $bus.$emit('closeConnection')
9. client.quit() → 清理状态
```

#### 4.1.3 SSH 隧道流程

```
SSH + Standalone:
  tunnel-ssh → localPort → ioredis(localHost, localPort)

SSH + Cluster:
  tunnel-ssh → localPort → ioredis(localHost, localPort)
  → CLUSTER NODES → 解析 Master 列表
  → 为每个 Master 创建 tunnel-ssh
  → 构建 NAT Map: { "internalHost:port": { host: "localHost", port: localPort } }
  → new Redis.Cluster([firstTunnel], { natMap })

SSH + Sentinel:
  tunnel-ssh → localPort → ioredis(localHost, localPort) [连接 Sentinel]
  → SENTINEL GET-MASTER-ADDR-BY-NAME masterName
  → 为 Master 创建 tunnel-ssh
  → ioredis(masterTunnel.localHost, masterTunnel.localPort) [连接 Master]
```

### 4.2 Key 管理功能

#### 4.2.1 SCAN 流式加载

[`KeyList.vue`](AnotherRedisDesktopManager/src/components/KeyList.vue) 使用 ioredis 的 `scanStream` 实现：

```javascript
// SCAN 流式加载核心逻辑
const stream = client.scanStream({ match, count: 500 });
stream.on('data', (keys) => {
    // 暂停/恢复机制
    if (this.scanPaused) stream.pause();
    // 累积 keys
    this.keys = this.keys.concat(keys);
});
stream.on('end', () => { /* 加载完成 */ });
```

#### 4.2.2 Key 树构建算法

[`util.js`](AnotherRedisDesktopManager/src/util.js:240-300) 的 `keysToTree()` 方法：

```javascript
// 输入: ['user:1:name', 'user:1:age', 'user:2:name', 'post:1:title']
// 分隔符: ':'
// 输出:
// {
//   user: {
//     1: {
//       'name': { keyNode: true },
//       'age': { keyNode: true },
//     },
//     2: {
//       'name': { keyNode: true },
//     },
//   },
//   post: {
//     1: {
//       'title': { keyNode: true },
//     },
//   },
// }
```

关键设计：
- 文件夹节点 key 以 `F` 前缀 + 全路径名标识
- Key 节点以原始 key 名标识
- `keyCount` 递归统计子节点数量
- `forceCut = 20000` 限制展开节点数（200K 溢出保护）
- 文件夹在前、Key 在后排序

#### 4.2.3 虚拟树组件

[`KeyListVirtualTree.vue`](AnotherRedisDesktopManager/src/components/KeyListVirtualTree.vue) 使用 `@qii404/vue-easy-tree` 实现虚拟滚动：

- 仅渲染可视区域 DOM
- 200K 节点限制（超出截断）
- 支持展开/折叠状态记忆
- 懒加载子节点

### 4.3 数据类型编辑器

#### 4.3.1 统一设计模式

所有 6 种数据类型编辑器遵循统一模式：

```
组件结构:
┌─────────────────────────────────────────┐
│  工具栏: [添加] [搜索] [刷新] [删除选中]  │
├─────────────────────────────────────────┤
│  vxe-table 虚拟滚动表格                  │
│  ┌──────┬──────────┬──────────┬──────┐  │
│  │ 选择 │ 字段1    │ 字段2    │ 操作 │  │
│  ├──────┼──────────┼──────────┼──────┤  │
│  │ ☐    │ 值       │ 值       │ 编辑 │  │
│  │ ☐    │ 值       │ 值       │ 编辑 │  │
│  └──────┴──────────┴──────────┴──────┘  │
├─────────────────────────────────────────┤
│  分页: [加载更多] [加载全部]              │
└─────────────────────────────────────────┘
```

#### 4.3.2 各类型特殊设计

| 类型 | 分页方式 | 搜索方式 | 编辑操作 | 特殊功能 |
|---|---|---|---|---|
| **String** | 无分页 | 无 | SET | DUMP 导出 |
| **Hash** | HSCAN 游标 | HSCAN MATCH | HSET/HDEL | Hash TTL (Redis 7.4+) |
| **List** | LRANGE 分页 | 无 | LSET/LPUSH/RPUSH/LREM | 索引编辑 |
| **Set** | SSCAN 游标 | SSCAN MATCH | SADD/SREM | 随机成员 |
| **ZSet** | ZSCAN 游标 | ZSCAN MATCH | ZADD/ZREM | 排序切换（正序/倒序） |
| **Stream** | XRANGE 分页 | 无 | XADD/XDEL | 消费者组信息（XINFO） |
| **ReJSON** | 无分页 | 无 | JSON.SET | JSON.GET with $ path |

#### 4.3.3 Hash TTL 支持

[`KeyContentHash.vue`](AnotherRedisDesktopManager/src/components/contents/KeyContentHash.vue) 通过 `node-version-compare` 检测 Redis 版本：

```javascript
// Redis ≥ 7.4 支持 Hash Field 级别 TTL
if (versionCompare(redisVersion, '7.4.0') >= 0) {
    // 使用 HTTL/HEXPIRE 命令
}
```

### 4.4 CLI 命令行

#### 4.4.1 架构设计

[`CliTab.vue`](AnotherRedisDesktopManager/src/components/CliTab.vue) 是最复杂的组件之一（13,390 字符），实现了：

1. **命令执行**：通过 `client.call()` 执行任意 Redis 命令
2. **命令历史**：localStorage 持久化，上下箭头导航
3. **MULTI/EXEC 事务**：维护 `multiQueue` 队列
4. **SUBSCRIBE/PSUBSCRIBE**：`client.duplicate()` 创建新连接进入订阅模式
5. **MONITOR**：`client.monitor()` 实时监控
6. **命令补全**：基于 `commands.js` 的命令列表

#### 4.4.2 命令解析

使用 `@qii404/redis-splitargs` 解析命令字符串，支持引号和转义。

### 4.5 多标签页系统

#### 4.5.1 标签页类型

[`Tabs.vue`](AnotherRedisDesktopManager/src/components/Tabs.vue) 管理 6 种标签页类型：

| 类型 | 组件 | 触发方式 |
|---|---|---|
| **Status** | Status.vue | 连接后自动打开 |
| **CLI** | CliTab.vue | 点击 CLI 按钮 |
| **Key** | KeyDetail.vue | 点击 Key |
| **DeleteBatch** | DeleteBatch.vue | 批量删除操作 |
| **Memory** | MemoryAnalysis.vue | 内存分析操作 |
| **SlowLog** | SlowLog.vue | 慢日志操作 |

#### 4.5.2 标签页策略

- **替换模式**：点击已打开的标签页直接切换
- **追加模式**：Ctrl+Click 打开新标签页
- **右键菜单**：关闭/关闭其他/关闭所有

### 4.6 数据查看器系统

#### 4.6.1 自动格式检测

[`util.js`](AnotherRedisDesktopManager/src/util.js) 实现了 9 种格式检测：

```javascript
// 检测顺序（从上到下优先级）
1. isJson()          → JSON.parse()
2. isPHPSerialize()  → php-serialize
3. isJavaSerialize() → java-object-serialization
4. isPickle()        → pickleparser
5. isMsgpack()       → algo-msgpack-with-bigint
6. isBrotli()        → zlib.brotliDecompressSync
7. isGzip()          → zlib.gunzipSync
8. isDeflate()       → zlib.inflateSync
9. isProtobuf()      → rawproto
```

#### 4.6.2 FormatViewer 容器

[`FormatViewer.vue`](AnotherRedisDesktopManager/src/components/FormatViewer.vue) 是查看器容器：

- 首次加载自动检测格式
- 用户可手动切换格式
- Tab 栏显示所有可用查看器
- 20MB 大文件截断（`ViewerOverSize.vue`）

#### 4.6.3 自定义格式化器

[`CustomFormatter.vue`](AnotherRedisDesktopManager/src/components/CustomFormatter.vue) 允许用户定义自定义格式化规则：

- 模板变量替换
- Shell 命令执行（通过 Node.js `child_process`）
- 存储在 `localStorage.customFormatters`

### 4.7 工具功能

#### 4.7.1 服务器状态

[`Status.vue`](AnotherRedisDesktopManager/src/components/Status.vue)：

- INFO 命令解析（Server/Clients/Memory/Stats/Replication/CPU/Keyspace）
- DB Key 统计（INFO KEYSPACE 解析）
- Cluster 节点统计
- 自动刷新（可配置间隔）

#### 4.7.2 慢查询日志

[`SlowLog.vue`](AnotherRedisDesktopManager/src/components/SlowLog.vue)：

- SLOWLOG GET 命令
- 按耗时排序
- 虚拟滚动列表

#### 4.7.3 内存分析

[`MemoryAnalysis.vue`](AnotherRedisDesktopManager/src/components/MemoryAnalysis.vue)：

- SCAN + MEMORY USAGE 批量分析
- 进度条显示
- 排序（按内存大小）

### 4.8 设置功能

[`Setting.vue`](AnotherRedisDesktopManager/src/components/Setting.vue) 管理：

| 设置项 | 存储键 | 类型 |
|---|---|---|
| 主题 | `localStorage.theme` | `light/dark/system` |
| 语言 | `localStorage.language` | 13 种语言代码 |
| 页面缩放 | `settings.zoomFactor` | 0.5-2.0 |
| 字体 | `settings.fontFamily` | 系统字体列表 |
| 每页数量 | `settings.keysPageSize` | 数字 |
| 分隔符 | 连接级 `separator` | 字符串 |
| 连接导出/导入 | JSON 文件 | 文件 |

---

## 五、设计规范

### 5.1 UI 设计规范

#### 5.1.1 布局结构

```
┌─────────────────────────────────────────────────────┐
│                  Application Window                  │
│                                                      │
│  ┌──────────┬───┬────────────────────────────────┐  │
│  │          │   │                                │  │
│  │  Aside   │ D │         Main Content           │  │
│  │          │ R │                                │  │
│  │ [新建]   │ A │  ┌──────────────────────────┐  │  │
│  │ [设置]   │ G │  │     Tab Bar              │  │  │
│  │ [日志]   │   │  ├──────────────────────────┤  │  │
│  │          │   │  │                          │  │  │
│  │ ───────  │   │  │     Tab Content          │  │  │
│  │ Connection│  │  │                          │  │  │
│  │  List    │   │  │                          │  │  │
│  │          │   │  │                          │  │  │
│  │          │   │  └──────────────────────────┘  │  │
│  └──────────┴───┴────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

Aside: 200-1500px 可拖拽 (默认 265px)
Drag: 10px 拖拽区域
```

#### 5.1.2 暗黑模式

通过 CSS 类 `.dark-mode` 切换：

```css
/* index.html 中动态添加/移除 */
document.body.classList.add('dark-mode');    // 暗黑
document.body.classList.remove('dark-mode'); // 亮色
```

主题文件：
- `static/theme/light/index.css` — Element UI 亮色主题（198KB）
- `static/theme/dark/index.css` — Element UI 暗色主题（232KB）

vxe-table 暗黑模式通过 CSS 变量覆盖：

```css
html .dark-mode {
  --vxe-ui-table-header-background-color: #273239 !important;
  --vxe-ui-font-color: #f3f3f4 !important;
  /* ... */
}
```

#### 5.1.3 Element UI 使用规范

- 全局 `size: 'small'`
- 使用 `el-container/el-aside/el-main` 布局
- 使用 `el-button/el-input/el-select/el-table` 等标准组件
- 使用 `el-dialog` 弹窗
- 使用 `el-message/el-notification` 提示
- 使用 `el-tooltip` 工具提示

### 5.2 代码规范

#### 5.2.1 Vue 组件规范

- **Options API**：全部使用 Vue 2 Options API（`data()/methods/computed/mounted`）
- **单文件组件**：`.vue` 文件包含 `<template>` + `<script>` + `<style>`
- **组件命名**：PascalCase（如 `KeyDetail.vue`、`NewConnectionDialog.vue`）
- **事件通信**：`$bus.$on` 在 `mounted` 注册，`$bus.$off` 在 `beforeDestroy` 清理

#### 5.2.2 JavaScript 规范

- **无 TypeScript**：纯 JavaScript，无类型注解
- **ESLint**：使用 `eslint-config-airbnb-base` 规范
- **模块系统**：CommonJS (`require`) + ES Modules (`import`) 混用
- **异步**：Promise 链式调用，不使用 async/await

#### 5.2.3 数据处理规范

- **Buffer 优先**：使用 `scanBufferStream` 而非 `scanStream`，保证二进制安全
- **BigInt 处理**：使用 `@qii404/json-bigint` 和 `stringNumbers: true`
- **HGETALL 转换**：自定义 `setReplyTransformer` 将扁平数组转为 `[[key, value]]`

### 5.3 Electron 规范

#### 5.3.1 主进程

[`electron-main.js`](AnotherRedisDesktopManager/pack/electron/electron-main.js) 负责：

- 窗口创建和管理（BrowserWindow）
- 系统主题监听（`nativeTheme.on('updated')`）
- IPC 通信处理（`ipcMain.handle`）
- 菜单管理
- 自动更新（`electron-updater`）

#### 5.3.2 IPC 接口

| 通道 | 方向 | 用途 |
|---|---|---|
| `changeTheme` | Renderer → Main | 切换主题 |
| `os-theme-updated` | Main → Renderer | 系统主题变更通知 |
| `getMainArgs` | Renderer → Main | 获取 CLI 启动参数 |
| `minimizeWindow` | Renderer → Main | 最小化窗口 |
| `toggleMaximize` | Renderer → Main | 切换最大化 |

#### 5.3.3 安全沙盒

- macOS App Store 版本使用 `startAccessingSecurityScopedResource` 访问文件
- SSL 证书跳过主机名验证（`checkServerIdentity: () => undefined`）
- `rejectUnauthorized: false`

### 5.4 构建规范

#### 5.4.1 构建工具链

```
Webpack 4 + Babel 7 + PostCSS
├── babel-preset-env         (ES2015+ 转译)
├── @vue/babel-preset-jsx    (JSX 支持)
├── babel-plugin-component   (Element UI 按需加载)
├── mini-css-extract-plugin  (CSS 提取)
├── monaco-editor-webpack-plugin (Monaco 编辑器)
└── electron-builder         (打包)
```

#### 5.4.2 打包配置

- **Windows**：NSIS 安装包（`pack:win`/`pack:win32`）
- **macOS**：DMG 安装包（`pack:mac`），支持 MAS（Mac App Store）
- **Linux**：AppImage/DEB/RPM（`pack:linux`）

---

## 六、核心设计模式总结

### 6.1 设计模式清单

| 模式 | 应用位置 | 说明 |
|---|---|---|
| **猴子补丁** | `redisClient.js` | 拦截 `sendCommand` 实现日志和只读 |
| **事件总线** | `bus.js` | 全局事件通信，替代 Vuex |
| **工厂方法** | `redisClient.js` | 根据配置创建不同类型连接 |
| **观察者模式** | `$bus.$on/$emit` | 组件间解耦通信 |
| **策略模式** | `commands.js` | 命令分类（admin/read/write） |
| **模板方法** | 数据类型编辑器 | 统一的 CRUD 操作模式 |
| **适配器模式** | `util.js` | Buffer ↔ String ↔ Hex 转换 |
| **单例模式** | `bus.js`、`storage.js` | 全局唯一实例 |
| **代理模式** | `ConnectionWrapper.vue` | 连接生命周期代理 |

### 6.2 关键技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 状态管理 | 无 Vuex，纯事件总线 | 项目规模适中，事件总线足够 |
| 持久化 | localStorage | 简单直接，无需数据库 |
| 表格组件 | vxe-table | 虚拟滚动 + 行内编辑 |
| 树组件 | @qii404/vue-easy-tree | 虚拟滚动树，支持大数据量 |
| 代码编辑器 | monaco-editor | VSCode 同款，功能强大 |
| 命令行解析 | @qii404/redis-splitargs | 支持引号和转义 |
| 大数处理 | stringNumbers + json-bigint | 避免 JavaScript 精度丢失 |

### 6.3 已知技术债务

1. **无类型系统**：纯 JavaScript，无编译时类型检查
2. **猴子补丁**：`Redis.prototype.sendCommand` 全局修改，有副作用风险
3. **localStorage 明文存储**：密码等敏感信息明文存储
4. **无单元测试**：项目无测试覆盖
5. **Electron 12 过旧**：Chromium 内核过旧，安全漏洞风险
6. **混用模块系统**：`require` 和 `import` 混用
7. **全局状态无追踪**：事件总线无法追踪数据流向

---

## 七、与迁移项目的映射关系

### 7.1 架构映射

| ARDM 概念 | 新项目对应 |
|---|---|
| `bus.js` 事件总线 | `mitt` + typed events (`use-module-bus.ts`) |
| `Vue.prototype.$xxx` | Pinia store + composables |
| `localStorage` | Tauri Store Plugin + Rust 存储服务 |
| `redisClient.js` | Rust `connection/service.rs` + `shared/redis_client.rs` |
| `commands.js` | Rust `cli/autocomplete.rs` (150+ 命令) |
| `util.js` 格式检测 | Rust `viewer/format_detector.rs` |
| `util.js` 树构建 | 前端 `key-tree.tsx` (VTable tree mode) |
| `storage.js` | Rust `storage/service.rs` (JSON 文件) |
| `shortcut.js` (keymaster) | `@vueuse/core::useMagicKeys` |
| `sortablejs` | `vuedraggable@next` |
| `vxe-table` | `@visactor/vtable` (ListTable) |
| `vue-easy-tree` | `@visactor/vtable` (ListTable tree mode) |
| `monaco-editor` | `monaco-editor-vue3` |
| Element UI 2.x | Element Plus 2.x |
| Electron IPC | Tauri invoke + Events |
| `.dark-mode` CSS 类 | Element Plus 暗黑模式 + CSS 变量 |

### 7.2 功能完整度对照

| 功能域 | ARDM 文件数 | 新项目状态 |
|---|---|---|
| 连接管理 | 4 | ✅ 后端+前端已完成 |
| SSH 隧道 | 1 | ✅ 后端已完成（含多隧道） |
| Key 管理 | 6 | ✅ 后端+前端已完成 |
| 数据类型编辑器 | 7 | ✅ 后端+前端已完成（6 种） |
| CLI 命令行 | 2 | ✅ 后端+前端已完成 |
| 工具（状态/日志/慢日志/内存） | 4 | ✅ 后端+前端已完成 |
| 数据查看器 | 16 | ⏳ Phase 5 待实现 |
| 设置/主题/国际化 | 3 | ⏳ Phase 5 待实现 |
| 批量操作 | 1 | ⏳ Phase 4 待实现 |
| SSL/TLS | 1 | ⏳ 延后（需 tokio-rustls） |

---

## 八、总结

ARDM 是一个功能完善的 Redis 桌面客户端，采用 **Vue 2 Options API + 事件总线 + localStorage** 的轻量架构。其核心设计特点：

1. **事件驱动**：无 Vuex，全部通过事件总线通信
2. **猴子补丁**：通过拦截 ioredis 实现横切关注点
3. **连接工厂**：支持 5 种连接模式的完整工厂方法
4. **虚拟滚动**：vxe-table + vue-easy-tree 处理大数据量
5. **多格式支持**：14 种数据格式查看器
6. **Buffer 安全**：全程 Buffer 处理，保证二进制安全

迁移到 Tauri 2 + Vue 3 + Rust 后，将消除上述技术债务，同时保持功能完整性。
