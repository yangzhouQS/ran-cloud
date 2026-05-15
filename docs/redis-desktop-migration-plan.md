# Redis Desktop Manager — 完整迁移计划

> **项目目标**：将 AnotherRedisDesktopManager (Electron 12 + Vue 2) 的全部功能迁移至 Tauri 2 + Vue 3 + Rust 技术栈，消除历史包袱，大胆采用新技术，实现更小体积、更高性能、更好体验的 Redis 桌面客户端。

---

## 〇、VTable 可行性调研与替换方案

> **调研结论**：VTable 可以替换 ARDM 中的全部表格和树形组件（vxe-table + vue-virtual-scroller + vue-easy-tree），统一为单一高性能组件库。

### 0.1 VTable 核心能力

| 能力 | 说明 | 对标 ARDM 组件 |
|---|---|---|
| **Canvas 高性能渲染** | 基于 VRender 引擎的 Canvas 渲染，支持百万级数据流畅显示 | 替代 vxe-table 虚拟滚动 |
| **ListTable 树形模式** | `tree: true` 列配置，内置展开/折叠，HierarchyState 管理 | 替代 @qii404/vue-easy-tree |
| **虚拟滚动** | 内置虚拟滚动引擎，仅渲染可视区域单元格 | 替代 vue-virtual-scroller |
| **自定义单元格渲染** | `customRender` / `customLayout` 支持完全自定义单元格内容 | 替代 vxe-table slot |
| **内联编辑** | `@visactor/vtable-editors` 提供文本/选择/日期等编辑器 | 替代 vxe-table + el-input 编辑 |
| **列排序** | 内置列排序功能 | 替代 vxe-table sortable |
| **列宽拖拽调整** | 内置列宽调整 | 替代 vxe-table resizable |
| **Vue 3 官方封装** | `@visactor/vue-vtable` 提供声明式 Vue 3 组件 | 原生 Vue 3 集成 |
| **冻结列/行** | 内置冻结区域支持 | 新增能力 |
| **主题系统** | 内置主题系统，支持暗黑模式 | 统一主题管理 |

### 0.2 ARDM 组件替换映射

| ARDM 原组件 | 使用位置 | VTable 替换方案 | 可行性 |
|---|---|---|---|
| **vxe-table + vxe-column** | Hash/ZSet/List/Set/Stream 数据表 | `ListTable` + `columns` 配置 + `customRender` | ✅ 完全可行 |
| **vue-virtual-scroller (RecycleScroller)** | MemoryAnalysis / SlowLog / DeleteBatch | `ListTable` 虚拟滚动模式 | ✅ 完全可行 |
| **@qii404/vue-easy-tree** | Key 树形视图 | `ListTable` 树形模式 (`tree: true`) | ✅ 完全可行 |
| **el-table (Status 页)** | 服务器状态/DB 统计 | 保持 Element Plus `el-table`（数据量小） | ✅ 无需替换 |

### 0.3 VTable 替换带来的优势

| 维度 | 原方案（多组件） | VTable 统一方案 |
|---|---|---|
| **依赖数量** | vxe-table + vue-virtual-scroller + vue-easy-tree = 3 个 | @visactor/vtable + @visactor/vue-vtable = 2 个 |
| **性能上限** | vxe-table: 万级；vue-virtual-scroller: 十万级 | 百万级数据流畅渲染 |
| **树形组件** | 需要自研或使用第三方虚拟树 | 内置树形模式，开箱即用 |
| **一致性** | 3 套不同 API 风格 | 统一 API，统一主题 |
| **维护成本** | 多个库版本升级风险 | 单一库，字节跳动团队维护 |

### 0.4 VTable 注意事项与风险

| 风险项 | 影响 | 应对策略 |
|---|---|---|
| Canvas 渲染无 DOM 元素 | 单元格内无法直接嵌入 Element Plus 组件 | 使用 VTable 的 `customRender` 自定义渲染；操作按钮使用 VTable 编辑器或事件回调 |
| 键盘导航存在边缘 case | 部分快捷键可能不生效 | 桌面应用场景影响较小；必要时补充自定义键盘处理 |
| 自定义渲染学习曲线 | 需要学习 VTable 渲染 API | 文档完善，社区活跃；投入 1-2 天学习即可 |
| 包体积可能较大 | @visactor/vtable 完整版约 2-3MB | 使用 `ListTable-Simple`（仅文本类型）减小体积；按需加载 |
| 暗黑模式需要适配 | VTable 有自己的主题系统 | 通过 VTable 主题 API 统一配置，与 Element Plus 暗黑模式并行 |

### 0.5 VTable 技术选型结论

**✅ 推荐使用 VTable 替换全部表格和树形组件**

理由：
1. **统一技术栈**：一个库解决所有表格/树/虚拟列表需求
2. **极致性能**：Canvas 渲染 + 虚拟滚动，百万级数据无压力
3. **内置树形**：Key 树形视图无需自研虚拟树组件，节省 2-3 周开发时间
4. **Vue 3 原生支持**：`@visactor/vue-vtable` 官方封装
5. **活跃维护**：字节跳动 VisActor 团队持续维护，GitHub 4k+ stars

---

## 一、技术栈替换对照表

### 1.1 框架层替换

| 原技术栈 (Node.js 生态) | 新技术栈 (Rust 生态) | 说明 |
|---|---|---|
| **Electron 12** | **Tauri 2** | 安装包从 ~80MB 降至 ~8MB，内存从 ~300MB 降至 ~50MB |
| **Vue 2.6 + Options API** | **Vue 3.5 + Composition API + TSX** | 更好的类型推导、响应式性能 |
| **Element UI 2.x** | **Element Plus 2.x** | Vue 3 兼容的 UI 库 |
| **Webpack 4** | **Rsbuild** | 基于 Rspack 的极速构建 |
| **vue-i18n 8.x** | **vue-i18n 9.x** | Vue 3 兼容的国际化 |
| **localStorage** | **Tauri Store Plugin** | 原生存储，支持 JSON 持久化 |
| **Electron IPC (ipcRenderer)** | **Tauri invoke** | Rust ↔ 前端通信 |
| **Electron clipboard** | **Tauri clipboard plugin** | 系统剪贴板 |
| **Electron shell** | **Tauri shell plugin** | 打开外部链接 |
| **Electron dialog** | **Tauri dialog plugin** | 原生文件选择对话框 |
| **Electron webFrame** | **Tauri window API** | 页面缩放控制 |

### 1.2 核心依赖替换

| 原依赖 (npm) | 新依赖 (Rust crate / npm) | 功能 | 迁移难度 |
|---|---|---|---|
| **ioredis 5.x** | **redis-rs (tokio)** | Redis 连接/命令/Cluster/Sentinel | ⭐⭐⭐⭐⭐ |
| **tunnel-ssh 5.x** | **ssh2 + tokio** | SSH 隧道 | ⭐⭐⭐⭐⭐ |
| **monaco-editor 0.30** | **monaco-editor-vue3** | JSON/代码编辑器（Vue 3 原生封装） | ⭐⭐ |
| **vxe-table 3.x** | **@visactor/vtable (ListTable)** | 高性能 Canvas 数据表格 | ⭐⭐ |
| **vue-virtual-scroller** | **@visactor/vtable (ListTable)** | 高性能虚拟滚动列表 | ⭐⭐ |
| **@qii404/vue-easy-tree** | **@visactor/vtable (ListTable tree mode)** | 高性能虚拟滚动 Key 树 | ⭐⭐ |
| **protobufjs** | **prost** (Rust) + 前端保留 protobufjs | Protobuf 编解码 | ⭐⭐⭐ |
| **rawproto** | **prost** (Rust) | Protobuf 原始解析 | ⭐⭐⭐ |
| **php-serialize** | **Rust 自实现** 或 **php-serde** | PHP 反序列化 | ⭐⭐⭐ |
| **java-object-serialization** | **Rust 自实现** | Java 对象反序列化 | ⭐⭐⭐⭐ |
| **pickleparser** | **Rust 自实现** 或 **serde-pickle** | Python Pickle 解析 | ⭐⭐⭐ |
| **algo-msgpack-with-bigint** | **rmp-serde** (Rust) | MessagePack 编解码 | ⭐⭐ |
| **@qii404/redis-splitargs** | **Rust 自实现** | Redis 命令参数分割 | ⭐⭐ |
| **@qii404/json-bigint** | **serde_json** (Rust, 原生支持大数) | JSON BigInt 处理 | ⭐ |
| **sortablejs** | **vuedraggable@next** 或 **@vueuse/integrations** | 拖拽排序 | ⭐⭐ |
| **keymaster** | **@vueuse/core (useMagicKeys)** | 快捷键绑定 | ⭐ |
| **font-awesome 4.x** | **@element-plus/icons-vue** | 图标库 | ⭐ |
| **getopts** | **clap** (Rust) | CLI 参数解析 | ⭐⭐ |
| **node-version-compare** | **Rust semver crate** | 版本号比较 | ⭐ |
| **zlib (Node 内置)** | **flate2** (Rust) | gzip/deflate/brotli 解压 | ⭐⭐ |

### 1.3 数据流架构变更

```
原架构 (Electron):
  Renderer (Vue 2) → ipcRenderer → Electron Main → ioredis (Node.js) → Redis
  Renderer (Vue 2) → ipcRenderer → Electron Main → tunnel-ssh (Node.js) → SSH Server → Redis

新架构 (Tauri 2):
  Renderer (Vue 3) → Tauri invoke → Rust Backend → redis-rs (tokio) → Redis
  Renderer (Vue 3) → Tauri invoke → Rust Backend → ssh2 (tokio) → SSH Server → Redis
  Renderer (Vue 3) → Tauri Events → Rust Backend → Stream 数据 → 前端
```

---

## 二、完整功能清单与迁移映射

### 2.1 连接管理

| # | 功能 | 原文件 | 新实现位置 | 优先级 |
|---|---|---|---|---|
| C-01 | 新建连接（Host/Port/Auth/Username） | `NewConnectionDialog.vue` | 前端 `connection-dialog.tsx` + Rust `redis_service.rs` | P0 |
| C-02 | 编辑连接 | `NewConnectionDialog.vue` | 同上 | P0 |
| C-03 | 删除连接 | `ConnectionMenu.vue` | 前端 + Rust `storage_service.rs` | P0 |
| C-04 | 连接列表（拖拽排序） | `Connections.vue` + `sortablejs` | 前端 `connection-list.tsx` + `vuedraggable` | P0 |
| C-05 | Standalone 连接 | `redisClient.js::createConnection` | Rust `redis_service.rs::connect_standalone` | P0 |
| C-06 | Cluster 连接（NAT 映射） | `redisClient.js::createConnection(cluster)` | Rust `redis_service.rs::connect_cluster` | P1 |
| C-07 | Sentinel 连接 | `redisClient.js::createConnection(sentinel)` | Rust `redis_service.rs::connect_sentinel` | P1 |
| C-08 | SSH 隧道连接 | `redisClient.js::createSSHConnection` | Rust `ssh_service.rs::create_ssh_tunnel` | P1 |
| C-09 | SSH + Cluster 组合 | `redisClient.js::createSSHConnection(cluster)` | Rust `ssh_service.rs` + `redis_service.rs` 协作 | P2 |
| C-10 | SSH + Sentinel 组合 | `redisClient.js::createSSHConnection(sentinel)` | Rust `ssh_service.rs` + `redis_service.rs` 协作 | P2 |
| C-11 | SSL/TLS 连接 | `redisClient.js::getTLSOptions` | Rust `redis_service.rs::connect_tls` (native-tls) | P1 |
| C-12 | ACL 用户名认证 | `redisClient.js::getRedisOptions(username)` | Rust `redis-rs` 原生支持 | P0 |
| C-13 | 只读模式 | `redisClient.js::connectionReadOnly` | Rust 命令拦截层 | P2 |
| C-14 | 数据库选择 | `KeyList.vue::setDb` | Rust `redis_service.rs::select_db` | P0 |
| C-15 | 连接重试策略 | `redisClient.js::retryStragety` | Rust `redis-rs` reconnect | P1 |
| C-16 | 连接导出/导入 | `Setting.vue` | Rust `storage_service.rs` + Tauri dialog | P1 |
| C-17 | CLI 参数启动连接 | `addon.js::bindCliArgs` | Rust `clap` CLI 解析 | P2 |

### 2.2 Key 管理

| # | 功能 | 原文件 | 新实现位置 | 优先级 |
|---|---|---|---|---|
| K-01 | Key 列表（SCAN 流式加载） | `KeyList.vue` | Rust `redis_service.rs::scan_keys` + Tauri Events | P0 |
| K-02 | Key 树形视图（分隔符分组） | `KeyListVirtualTree.vue` + `util.js::keysToTree` | 前端虚拟树组件 | P0 |
| K-03 | Key 平铺列表视图 | `KeyListNormal.vue` | 前端列表组件 | P1 |
| K-04 | Key 搜索（模糊/精确） | `OperateItem.vue` | 前端搜索组件 | P0 |
| K-05 | Key 加载更多/加载全部 | `KeyList.vue` | Rust SCAN 分页 | P0 |
| K-06 | Key 详情查看 | `KeyDetail.vue` | 前端 `key-detail.tsx` | P0 |
| K-07 | Key 重命名 | `KeyHeader.vue::renameKey` | Rust `RENAME` 命令 | P0 |
| K-08 | Key 删除 | `KeyHeader.vue::deleteKey` | Rust `DEL` 命令 | P0 |
| K-09 | Key TTL 查看/修改 | `KeyHeader.vue::ttlKey` | Rust `TTL`/`EXPIRE` 命令 | P0 |
| K-10 | Key Persist（移除过期） | `KeyHeader.vue::persistKey` | Rust `PERSIST` 命令 | P0 |
| K-11 | Key 自动刷新 | `KeyHeader.vue::autoRefresh` | 前端定时器 | P1 |
| K-12 | Key DUMP 命令导出 | `KeyHeader.vue::dumpCommand` | Rust `DUMP` 命令 | P2 |
| K-13 | 批量删除 Key | `DeleteBatch.vue` | Rust 批量 `DEL` | P1 |
| K-14 | 批量导出 Key | `KeyList.vue::exportBatch` | Rust `DUMP`+`PTTL` 批量 + CSV 导出 | P2 |

### 2.3 数据类型编辑器

| # | 功能 | 原文件 | 新实现位置 | 优先级 |
|---|---|---|---|---|
| D-01 | String 查看/编辑 | `KeyContentString.vue` | 前端 `content-string.tsx` | P0 |
| D-02 | Hash 查看/编辑/新增/删除 | `KeyContentHash.vue` | 前端 `content-hash.tsx` + Rust `HSET`/`HDEL`/`HSCAN` | P0 |
| D-03 | List 查看/编辑 | `KeyContentList.vue` | 前端 `content-list.tsx` + Rust `LRANGE`/`LSET` | P0 |
| D-04 | Set 查看/编辑 | `KeyContentSet.vue` | 前端 `content-set.tsx` + Rust `SSCAN`/`SREM` | P0 |
| D-05 | ZSet 查看/编辑（排序切换） | `KeyContentZset.vue` | 前端 `content-zset.tsx` + Rust `ZRANGE`/`ZSCAN` | P0 |
| D-06 | Stream 查看/编辑/新增 | `KeyContentStream.vue` | 前端 `content-stream.tsx` + Rust `XRANGE`/`XADD`/`XDEL` | P1 |
| D-07 | ReJSON 查看/编辑 | `KeyContentReJson.vue` | 前端 `content-rejson.tsx` + Rust `JSON.GET`/`JSON.SET` | P2 |
| D-08 | Hash TTL 支持（Redis 7.4+） | `KeyContentHash.vue::initTTL` | Rust `HTTL`/`HEXPIRE` | P2 |

### 2.4 数据查看器

| # | 功能 | 原文件 | 新实现位置 | 优先级 |
|---|---|---|---|---|
| V-01 | Text 文本查看器 | `ViewerText.vue` | 前端 `viewer-text.tsx` | P0 |
| V-02 | Hex 十六进制查看器 | `ViewerHex.vue` | 前端 `viewer-hex.tsx` | P0 |
| V-03 | JSON 查看器（格式化/折叠） | `ViewerJson.vue` + `JsonEditor.vue` | 前端 `monaco-editor-vue3` | P0 |
| V-04 | Binary 二进制查看器 | `ViewerBinary.vue` | 前端 `viewer-binary.tsx` | P1 |
| V-05 | Msgpack 查看器 | `ViewerMsgpack.vue` | Rust `rmp-serde` 解码 → 前端展示 | P2 |
| V-06 | PHPSerialize 查看器 | `ViewerPHPSerialize.vue` | Rust `php-serde` 解码 → 前端展示 | P2 |
| V-07 | JavaSerialize 查看器 | `ViewerJavaSerialize.vue` | Rust 自实现解析 → 前端展示 | P2 |
| V-08 | Pickle 查看器 | `ViewerPickle.vue` | Rust `serde-pickle` 解码 → 前端展示 | P2 |
| V-09 | Gzip 解压查看器 | `ViewerGzip.vue` | Rust `flate2::GzDecoder` | P2 |
| V-10 | Brotli 解压查看器 | `ViewerBrotli.vue` | Rust `brotli` crate | P2 |
| V-11 | Deflate 解压查看器 | `ViewerDeflate.vue` | Rust `flate2::Decompress` | P2 |
| V-12 | DeflateRaw 解压查看器 | `ViewerDeflateRaw.vue` | Rust `flate2::Decompress` | P2 |
| V-13 | Protobuf 查看器（.proto 文件加载） | `ViewerProtobuf.vue` | Rust `prost` + 前端 proto 文件选择 | P2 |
| V-14 | OverSize 大文件查看器 | `ViewerOverSize.vue` | 前端分片加载展示 | P2 |
| V-15 | 自定义格式化器 | `ViewerCustom.vue` + `CustomFormatter.vue` | 前端 JS 执行引擎 | P3 |
| V-16 | 自动格式检测 | `FormatViewer.vue::autoFormat` | Rust 后端检测 → 返回格式类型 | P1 |

### 2.5 工具功能

| # | 功能 | 原文件 | 新实现位置 | 优先级 |
|---|---|---|---|---|
| T-01 | CLI 命令行（自动补全） | `CliTab.vue` + `CliContent.vue` | 前端 `cli-tab.tsx` + Rust 命令执行 | P0 |
| T-02 | 命令历史记录 | `CliTab.vue::initHistoryTips` | Tauri Store 持久化 | P0 |
| T-03 | MULTI/EXEC 事务支持 | `CliTab.vue::multiQueue` | Rust `redis-rs` pipeline | P1 |
| T-04 | SUBSCRIBE/PSUBSCRIBE | `CliTab.vue::subscribeMode` | Rust `redis-rs` Pub/Sub + Tauri Events | P1 |
| T-05 | MONITOR 实时监控 | `CliTab.vue::monitorMode` | Rust `redis-rs` monitor + Tauri Events | P1 |
| T-06 | 命令日志 | `CommandLog.vue` | Rust 命令拦截 + Tauri Events → 前端展示 | P1 |
| T-07 | 服务器状态（INFO 解析） | `Status.vue` | Rust `INFO` 命令 → 前端展示 | P0 |
| T-08 | 自动刷新状态 | `Status.vue::autoRefresh` | 前端定时器 + Rust 查询 | P1 |
| T-09 | DB Key 统计 | `Status.vue::initDbKeys` | Rust `INFO KEYSPACE` 解析 | P0 |
| T-10 | Cluster 节点统计 | `Status.vue::initClusterKeys` | Rust 遍历 master 节点 | P1 |
| T-11 | 慢查询日志 | `SlowLog.vue` | Rust `SLOWLOG GET` → 前端虚拟列表 | P1 |
| T-12 | 内存分析 | `MemoryAnalysis.vue` | Rust `SCAN` + `MEMORY USAGE` → 前端虚拟列表 | P2 |
| T-13 | 右键菜单 | `RightClickMenu.vue` | 前端自定义右键菜单 | P1 |
| T-14 | 快捷键系统 | `shortcut.js` + `HotKeys.vue` | `@vueuse/core::useMagicKeys` | P1 |
| T-15 | 多标签页管理 | `Tabs.vue` | 前端 `tabs-manager.tsx` | P0 |
| T-16 | 更新检查 | `UpdateCheck.vue` | Tauri updater plugin | P2 |
| T-17 | 回到顶部 | `ScrollToTop.vue` | 前端组件 | P2 |

### 2.6 设置与个性化

| # | 功能 | 原文件 | 新实现位置 | 优先级 |
|---|---|---|---|---|
| S-01 | 主题切换（Light/Dark/System） | `Setting.vue` + CSS 变量 | Element Plus 暗黑模式 + CSS 变量 | P0 |
| S-02 | 语言切换（13 种语言） | `LanguageSelector.vue` + `i18n/` | vue-i18n 9.x | P0 |
| S-03 | 页面缩放 | `Setting.vue::changeZoom` | Tauri window API | P1 |
| S-04 | 字体选择 | `Setting.vue::getAllFonts` | Tauri 系统字体 API | P2 |
| S-05 | 每页加载数量 | `Setting.vue::keysPageSize` | Tauri Store | P1 |
| S-06 | 侧边栏宽度拖拽 | `App.vue::bindSideBarDrag` | 前端拖拽实现 | P1 |
| S-07 | 清除缓存 | `Setting.vue::clearCache` | Tauri Store 清理 | P2 |
| S-08 | 分隔符自定义 | `NewConnectionDialog.vue` | 连接配置存储 | P1 |

---

## 三、分阶段迁移计划

### Phase 0：基础架构搭建（2 周）

**目标**：建立 Rust 后端服务框架 + 前端项目结构调整

| 任务 | 预计工时 | 负责人 | 依赖 | 状态 |
|---|---|---|---|---|
| 0-1 Rust 项目结构设计（模块划分） | 4h | 后端 | 无 | [ ] |
| 0-2 定义 Tauri Command 接口（前后端协议） | 8h | 全栈 | 0-1 | [ ] |
| 0-3 Rust 错误处理框架（thiserror + anyhow） | 4h | 后端 | 0-1 | [ ] |
| 0-4 Tauri Store 存储服务（连接配置管理） | 8h | 后端 | 0-2 | [ ] |
| 0-5 前端路由系统（Vue Router + 多页面） | 8h | 前端 | 无 | [ ] |
| 0-6 前端布局框架（三栏布局 + 侧边栏） | 8h | 前端 | 0-5 | [ ] |
| 0-7 Element Plus 暗黑主题集成 | 4h | 前端 | 0-6 | [ ] |
| 0-8 vue-i18n 9.x 国际化框架搭建 | 8h | 前端 | 0-5 | [ ] |

**里程碑**：✅ 空壳应用可运行，三栏布局正常，暗黑模式切换正常

---

### Phase 1：核心连接 + Key 浏览（3 周）

**目标**：实现 Standalone Redis 连接 + Key 列表/树 + Key 详情

| 任务 | 预计工时 | 负责人 | 依赖 | 状态 |
|---|---|---|---|---|
| 1-1 Rust redis-rs 连接池管理 | 16h | 后端 | Phase 0 | [ ] |
| 1-2 Rust SCAN 命令流式输出（Tauri Events） | 12h | 后端 | 1-1 | [ ] |
| 1-3 Rust Key 操作命令（TYPE/TTL/DEL/RENAME） | 8h | 后端 | 1-1 | [ ] |
| 1-4 前端连接管理（新建/编辑/删除/列表） | 16h | 前端 | 0-4 | [ ] |
| 1-5 前端连接表单（Host/Port/Auth/Username） | 12h | 前端 | 1-4 | [ ] |
| 1-6 前端 Key 列表组件（SCAN 分页加载） | 16h | 前端 | 1-2 | [ ] |
| 1-7 前端 Key 树形视图（VTable ListTable tree mode） | 12h | 前端 | 1-6 | [ ] |
| 1-8 前端 Key 搜索（模糊/精确匹配） | 8h | 前端 | 1-6 | [ ] |
| 1-9 前端 Key 详情页（Header + TTL + 操作） | 12h | 前端 | 1-3 | [ ] |
| 1-10 前端 DB 选择器 | 4h | 前端 | 1-1 | [ ] |
| 1-11 集成测试：Standalone 连接全流程 | 8h | 全栈 | 1-5~1-10 | [ ] |

**里程碑**：✅ 可连接 Standalone Redis，浏览 Key 列表/树，查看 Key 详情

---

### Phase 2：数据类型编辑器（3 周）

**目标**：实现 7 种 Redis 数据类型的查看和编辑

| 任务 | 预计工时 | 负责人 | 依赖 | 状态 |
|---|---|---|---|---|
| 2-1 Rust Hash 操作命令（HSET/HDEL/HSCAN/HLEN） | 8h | 后端 | 1-1 | [ ] |
| 2-2 Rust List 操作命令（LRANGE/LSET/LPUSH/RPUSH） | 8h | 后端 | 1-1 | [ ] |
| 2-3 Rust Set 操作命令（SSCAN/SREM/SADD） | 8h | 后端 | 1-1 | [ ] |
| 2-4 Rust ZSet 操作命令（ZRANGE/ZSCAN/ZADD/ZREM） | 8h | 后端 | 1-1 | [ ] |
| 2-5 Rust Stream 操作命令（XRANGE/XADD/XDEL/XLEN） | 8h | 后端 | 1-1 | [ ] |
| 2-6 Rust String 操作命令（GET/SET） | 4h | 后端 | 1-1 | [ ] |
| 2-7 前端 String 编辑器 | 8h | 前端 | 2-6 | [ ] |
| 2-8 前端 Hash 编辑器（VTable ListTable + customRender） | 12h | 前端 | 2-1 | [ ] |
| 2-9 前端 List 编辑器（VTable ListTable + customRender） | 8h | 前端 | 2-2 | [ ] |
| 2-10 前端 Set 编辑器（VTable ListTable + customRender） | 8h | 前端 | 2-3 | [ ] |
| 2-11 前端 ZSet 编辑器（VTable ListTable + 排序切换） | 8h | 前端 | 2-4 | [ ] |
| 2-12 前端 Stream 编辑器（VTable ListTable + customRender） | 12h | 前端 | 2-5 | [ ] |
| 2-13 前端 FormatViewer（自动格式检测） | 12h | 前端 | 2-7~2-12 | [ ] |
| 2-14 前端 Text/Hex/JSON 查看器 | 12h | 前端 | 2-13 | [ ] |
| 2-15 集成测试：所有数据类型 CRUD | 8h | 全栈 | 2-7~2-14 | [ ] |

**里程碑**：✅ 可查看和编辑 String/Hash/List/Set/ZSet/Stream 类型数据

---

### Phase 3：高级连接模式（2 周）

**目标**：实现 Cluster、Sentinel、SSH 隧道、SSL/TLS 连接

| 任务 | 预计工时 | 负责人 | 依赖 | 状态 |
|---|---|---|---|---|
| 3-1 Rust Cluster 连接（redis-rs cluster 模式） | 16h | 后端 | 1-1 | [ ] |
| 3-2 Rust Cluster NAT 映射处理 | 8h | 后端 | 3-1 | [ ] |
| 3-3 Rust Sentinel 连接 | 12h | 后端 | 1-1 | [ ] |
| 3-4 Rust SSH 隧道（ssh2 crate） | 16h | 后端 | 0-1 | [ ] |
| 3-5 Rust SSH + Standalone 组合 | 8h | 后端 | 3-4 | [ ] |
| 3-6 Rust SSH + Cluster 组合（多隧道） | 12h | 后端 | 3-1, 3-4 | [ ] |
| 3-7 Rust SSH + Sentinel 组合 | 8h | 后端 | 3-3, 3-4 | [ ] |
| 3-8 Rust SSL/TLS 连接（native-tls） | 8h | 后端 | 1-1 | [ ] |
| 3-9 前端连接表单扩展（SSH/SSL/Sentinel/Cluster） | 16h | 前端 | 1-5 | [ ] |
| 3-10 前端文件选择器（SSH Key/SSL 证书） | 8h | 前端 | 3-9 | [ ] |
| 3-11 集成测试：所有连接模式 | 16h | 全栈 | 3-1~3-10 | [ ] |

**里程碑**：✅ 支持 Standalone/Cluster/Sentinel/SSH/SSL 全部连接模式

---

### Phase 4：工具与高级功能（2 周）

**目标**：实现 CLI、命令日志、状态监控、慢日志等工具

| 任务 | 预计工时 | 负责人 | 依赖 | 状态 |
|---|---|---|---|---|
| 4-1 Rust 命令执行引擎（任意 Redis 命令） | 12h | 后端 | 1-1 | [ ] |
| 4-2 Rust 命令日志拦截（Tauri Events） | 8h | 后端 | 4-1 | [ ] |
| 4-3 Rust Pub/Sub 支持（Tauri Events 流式推送） | 8h | 后端 | 1-1 | [ ] |
| 4-4 Rust MONITOR 支持（Tauri Events 流式推送） | 8h | 后端 | 1-1 | [ ] |
| 4-5 Rust INFO 命令解析 | 4h | 后端 | 1-1 | [ ] |
| 4-6 Rust SLOWLOG 命令 | 4h | 后端 | 1-1 | [ ] |
| 4-7 Rust MEMORY USAGE 批量分析 | 8h | 后端 | 1-1 | [ ] |
| 4-8 前端 CLI 组件（命令输入 + 自动补全） | 16h | 前端 | 4-1 | [ ] |
| 4-9 前端命令日志面板 | 8h | 前端 | 4-2 | [ ] |
| 4-10 前端状态监控面板 | 12h | 前端 | 4-5 | [ ] |
| 4-11 前端慢日志面板（VTable ListTable） | 6h | 前端 | 4-6 | [ ] |
| 4-12 前端内存分析面板（VTable ListTable） | 8h | 前端 | 4-7 | [ ] |
| 4-13 前端多标签页管理 | 16h | 前端 | Phase 2 | [ ] |
| 4-14 前端快捷键系统 | 8h | 前端 | 4-13 | [ ] |
| 4-15 前端批量删除 | 8h | 前端 | 4-1 | [ ] |

**里程碑**：✅ CLI 可用，命令日志/状态/慢日志/内存分析全部可用

---

### Phase 5：数据查看器 + 个性化（2 周）

**目标**：实现全部数据查看器、主题/语言/设置

| 任务 | 预计工时 | 负责人 | 依赖 | 状态 |
|---|---|---|---|---|
| 5-1 Rust 解压引擎（gzip/deflate/brotli） | 8h | 后端 | 0-1 | [ ] |
| 5-2 Rust 序列化解析（MsgPack/Pickle/PHPSerialize） | 16h | 后端 | 0-1 | [ ] |
| 5-3 Rust Protobuf 解析（prost） | 8h | 后端 | 0-1 | [ ] |
| 5-4 Rust Java 序列化解析 | 12h | 后端 | 0-1 | [ ] |
| 5-5 前端解压查看器（Gzip/Brotli/Deflate） | 8h | 前端 | 5-1 | [ ] |
| 5-6 前端序列化查看器（MsgPack/Pickle/PHP/Java） | 12h | 前端 | 5-2~5-4 | [ ] |
| 5-7 前端 Protobuf 查看器（.proto 文件加载） | 12h | 前端 | 5-3 | [ ] |
| 5-8 前端 Binary 查看器 | 4h | 前端 | 无 | [ ] |
| 5-9 前端 OverSize 查看器 | 4h | 前端 | 无 | [ ] |
| 5-10 前端自定义格式化器 | 8h | 前端 | 无 | [ ] |
| 5-11 前端设置页面（主题/语言/缩放/字体） | 12h | 前端 | Phase 0 | [ ] |
| 5-12 前端连接导入/导出 | 8h | 前端 | 5-11 | [ ] |
| 5-13 前端 ReJSON 编辑器 | 8h | 前端 | 2-7 | [ ] |
| 5-14 前端侧边栏拖拽调整宽度 | 4h | 前端 | 0-6 | [ ] |

**里程碑**：✅ 全部 15 种数据查看器可用，设置功能完整

---

### Phase 6：优化与发布（2 周）

**目标**：性能优化、测试覆盖、打包发布

| 任务 | 预计工时 | 负责人 | 依赖 | 状态 |
|---|---|---|---|---|
| 6-1 Rust 连接池优化 | 8h | 后端 | Phase 3 | [ ] |
| 6-2 Rust 大 Key 流式读取优化 | 8h | 后端 | Phase 2 | [ ] |
| 6-3 前端 VTable 大数据量渲染优化 | 4h | 前端 | Phase 2 | [ ] |
| 6-4 前端 VTable 主题与 Element Plus 暗黑模式统一 | 4h | 前端 | Phase 4 | [ ] |
| 6-5 全功能回归测试 | 16h | 全栈 | Phase 5 | [ ] |
| 6-6 Windows/macOS/Linux 打包配置 | 8h | 全栈 | 6-5 | [ ] |
| 6-7 自动更新（Tauri updater） | 8h | 全栈 | 6-6 | [ ] |
| 6-8 CLI 参数启动支持 | 4h | 后端 | 6-6 | [ ] |
| 6-9 文档编写 | 8h | 全栈 | 6-5 | [ ] |

**里程碑**：✅ 产品可发布

---

## 四、Rust 后端模块设计

```
src-tauri/src/
├── main.rs                    # 入口
├── lib.rs                     # Tauri 命令注册
├── commands/
│   ├── mod.rs
│   ├── connection.rs          # 连接管理命令
│   ├── key.rs                 # Key 操作命令
│   ├── data.rs                # 数据类型操作命令
│   ├── cli.rs                 # CLI 命令执行
│   ├── tool.rs                # 工具命令（INFO/SLOWLOG/MEMORY）
│   └── viewer.rs              # 数据查看器命令（解压/反序列化）
├── services/
│   ├── mod.rs
│   ├── redis_service.rs       # Redis 连接/命令封装
│   ├── ssh_service.rs         # SSH 隧道管理
│   ├── storage_service.rs     # 连接配置持久化
│   └── viewer_service.rs      # 数据格式解析
├── models/
│   ├── mod.rs
│   ├── connection.rs          # 连接配置模型
│   ├── redis_key.rs           # Key 数据模型
│   └── command.rs             # 命令日志模型
└── errors.rs                  # 统一错误处理
```

---

## 五、前端组件架构

> **模块化架构**：Redis Desktop Manager 的所有组件位于 `src/modules/redis-desktop-manager/` 下，`modules/` 目录可放置多个独立工具模块。

```
src/
├── main.ts                    # 入口（多页面路由）
├── app.tsx                    # 主应用
├── assets/styles/
│   └── index.css              # 全局样式
│
├── modules/                   # ====== 功能模块目录 ======
│   └── redis-desktop-manager/ # Redis Desktop Manager 模块
│       ├── index.ts           # 模块入口
│       ├── types/             # 模块类型定义
│       │   ├── connection.ts
│       │   ├── redis-key.ts
│       │   ├── redis-data.ts
│       │   └── ipc.ts
│       ├── services/          # 模块 IPC 服务层
│       │   ├── connection-service.ts
│       │   ├── key-service.ts
│       │   ├── data-service.ts
│       │   ├── cli-service.ts
│       │   ├── tool-service.ts
│       │   ├── viewer-service.ts
│       │   └── event-service.ts
│       ├── composables/       # 模块组合式函数
│       │   ├── use-connection.ts
│       │   ├── use-key-scanner.ts
│       │   ├── use-data-editor.ts
│       │   ├── use-vtable.ts
│       │   └── index.ts
│       └── components/        # 模块 UI 组件
│           ├── connection/
│           │   ├── connection-list.tsx
│           │   ├── connection-dialog.tsx
│           │   └── connection-form/
│           │       ├── basic-form.tsx
│           │       ├── ssh-form.tsx
│           │       ├── ssl-form.tsx
│           │       └── sentinel-form.tsx
│           ├── key/
│           │   ├── key-panel.tsx
│           │   ├── key-list.tsx      # VTable ListTable
│           │   ├── key-tree.tsx      # VTable ListTable tree mode
│           │   ├── key-detail.tsx
│           │   ├── key-header.tsx
│           │   └── key-search.tsx
│           ├── content/
│           │   ├── content-router.tsx
│           │   ├── content-string.tsx
│           │   ├── content-hash.tsx   # VTable ListTable + customRender
│           │   ├── content-list.tsx   # VTable ListTable + customRender
│           │   ├── content-set.tsx    # VTable ListTable + customRender
│           │   ├── content-zset.tsx   # VTable ListTable + 排序切换
│           │   ├── content-stream.tsx # VTable ListTable + customRender
│           │   └── content-rejson.tsx
│           ├── viewer/
│           │   ├── format-viewer.tsx
│           │   ├── viewer-text.tsx
│           │   ├── viewer-hex.tsx
│           │   ├── viewer-json.tsx    # monaco-editor-vue3
│           │   └── ...                # 其他查看器
│           ├── tool/
│           │   ├── cli-tab.tsx
│           │   ├── command-log.tsx
│           │   ├── status-panel.tsx
│           │   ├── slow-log.tsx       # VTable ListTable
│           │   ├── memory-analysis.tsx # VTable ListTable
│           │   └── delete-batch.tsx
│           └── common/
│               ├── vtable-wrapper.tsx  # VTable 通用封装
│               └── redis-context.tsx   # Redis 连接上下文
│
├── components/                # ====== 全局公共组件 ======
│   ├── layout/
│   │   ├── app-layout.tsx     # 三栏布局
│   │   └── sidebar.tsx        # 侧边栏
│   ├── tabs/
│   │   ├── tab-bar.tsx
│   │   └── tab-item.tsx
│   └── common/
│       ├── context-menu.tsx
│       └── file-input.tsx
│
├── pages/
│   ├── settings-page.tsx      # 设置页（独立窗口）
│   └── about-page.tsx         # 关于页（独立窗口）
│
├── services/
│   ├── tauri.ts               # Tauri 环境检测
│   └── storage.ts             # 全局存储服务
│
├── composables/
│   ├── use-shortcut.ts         # 快捷键 Hook
│   └── use-theme.ts            # 主题切换 Hook
│
└── i18n/
    ├── index.ts               # i18n 配置
    └── langs/
        ├── cn.ts
        ├── en.ts
        └── ...
```

---

## 六、风险分析与应对策略

### 6.1 高风险项

| 风险 | 影响程度 | 概率 | 应对策略 |
|---|---|---|---|
| **redis-rs Cluster NAT 映射不完善** | 🔴 高 | 中 | 提前在 Phase 3 进行 POC 验证；备选方案：自行实现 NAT 映射层 |
| **SSH 隧道多连接管理** | 🔴 高 | 中 | ssh2 crate 成熟度高；需要仔细管理连接生命周期；使用 tokio 异步 |
| **VTable Canvas 渲染限制** | 🟡 中 | 低 | 单元格内无法直接嵌入 Element Plus 组件；使用 customRender + 事件回调替代 |
| **Java 序列化解析** | 🟡 中 | 低 | 使用频率低；可简化为只读展示；备选：调用 Java 工具 |
| **Protobuf 动态解析** | 🟡 中 | 中 | prost 需要编译时类型；使用 protobuf crate 的动态解析能力 |
| **Tauri 2 稳定性** | 🟢 低 | 低 | Tauri 2 已正式发布；社区活跃；问题可快速修复 |

### 6.2 技术风险应对

| 风险类别 | 具体描述 | 应对方案 |
|---|---|---|
| **redis-rs 功能限制** | redis-rs 对 Cluster/Sentinel 支持可能不如 ioredis 完善 | Phase 3 开始前进行 POC；必要时直接使用底层 connection 实现 |
| **SSH 隧道稳定性** | 长时间连接可能断开 | 实现心跳保活 + 自动重连机制 |
| **大数据量渲染** | 百万级 Key 的树/列表渲染 | VTable Canvas 渲染 + 内置虚拟滚动 + 分片加载 |
| **二进制数据处理** | Buffer 在前端不如 Node.js 方便 | 二进制操作全部放在 Rust 后端；前端只处理字符串/JSON |
| **跨平台兼容** | Windows/macOS/Linux 差异 | Tauri 原生跨平台；注意文件路径处理差异 |
| **SSL 证书加载** | 不同平台证书格式差异 | 使用 native-tls 统一处理 |

### 6.3 进度风险应对

| 风险 | 应对策略 |
|---|---|
| Redis Cluster 支持超预期 | Phase 3 预留 buffer；可先发布 Standalone 版本 |
| VTable 学习曲线 | 提前投入 1-2 天学习 VTable API；参考官方示例和文档 |
| 数据查看器种类多 | 按优先级分批实现；P3 功能可延后 |
| 国际化工作量 | 先支持中英文；其他语言后续补充 |

---

## 七、进度监控机制

### 7.1 进度跟踪表

> 以下表格在迁移过程中持续更新，每个任务完成后标记 `[x]` 并记录完成日期

**总体进度统计**：
- Phase 0: [ ] 0/8 (0%)
- Phase 1: [ ] 0/11 (0%)
- Phase 2: [ ] 0/15 (0%)
- Phase 3: [ ] 0/11 (0%)
- Phase 4: [ ] 0/15 (0%)
- Phase 5: [ ] 0/14 (0%)
- Phase 6: [ ] 0/9 (0%)
- **总计**: [ ] 0/83 (0%)

### 7.2 里程碑检查点

| 里程碑 | 验收标准 | 目标日期 | 实际日期 | 状态 |
|---|---|---|---|---|
| M0: 基础框架 | 三栏布局可运行，暗黑模式切换 | Week 2 | - | [ ] |
| M1: 核心连接 | 可连接 Standalone Redis，浏览 Key | Week 5 | - | [ ] |
| M2: 数据编辑 | 6 种数据类型可查看/编辑 | Week 8 | - | [ ] |
| M3: 高级连接 | Cluster/Sentinel/SSH/SSL 全部可用 | Week 10 | - | [ ] |
| M4: 工具功能 | CLI/日志/状态/慢日志/内存分析 | Week 12 | - | [ ] |
| M5: 查看器 | 全部 15 种数据查看器可用 | Week 14 | - | [ ] |
| M6: 发布 | 打包/测试/发布 | Week 16 | - | [ ] |

### 7.3 质量检查点

| 检查项 | 频率 | 标准 |
|---|---|---|
| Rust 编译警告 | 每次提交 | 零警告 |
| TypeScript 类型检查 | 每次提交 | 零错误 |
| 功能测试 | 每个 Phase 结束 | 所有 P0/P1 功能通过 |
| 性能测试 | Phase 2/4/6 | Key 列表加载 < 1s（10 万 Key） |
| 内存测试 | Phase 6 | 常驻内存 < 100MB |
| 包体积测试 | Phase 6 | Windows 安装包 < 15MB |

---

## 八、技术决策记录

| 决策 | 选择 | 理由 | 日期 |
|---|---|---|---|
| Redis 客户端 | redis-rs (tokio) | Rust 生态最成熟的 Redis 客户端，支持 Cluster | - |
| SSH 库 | ssh2 (Rust) | 成熟的 SSH2 协议实现，支持隧道 | - |
| 表格/树/虚拟列表 | @visactor/vtable (ListTable) | Canvas 渲染百万级数据；内置树形模式；统一 API 替代 vxe-table + vue-virtual-scroller + vue-easy-tree | - |
| JSON 编辑器 | monaco-editor-vue3 | VSCode 同款编辑器的 Vue 3 原生封装，无需引入 React 生态 | - |
| 序列化解析 | Rust 后端统一处理 | 避免前端处理二进制数据的复杂性 | - |
| 前端状态管理 | Vue 3 reactive + provide/inject | 项目规模适中，不需要 Pinia | - |
| 构建工具 | Rsbuild | 基于 Rspack，构建速度极快 | - |

---

## 九、与 ARDM 的功能对比保证

### 9.1 必须保持一致的功能（P0/P1）

- [x] Standalone Redis 连接
- [x] Cluster Redis 连接（含 NAT 映射）
- [x] Sentinel Redis 连接
- [x] SSH 隧道连接（Standalone/Cluster/Sentinel）
- [x] SSL/TLS 连接
- [x] ACL 用户名认证
- [x] Key 列表/树形浏览
- [x] Key 搜索（模糊/精确）
- [x] Key CRUD（查看/重命名/删除/TTL）
- [x] 6 种数据类型编辑器（String/Hash/List/Set/ZSet/Stream）
- [x] CLI 命令行（自动补全/历史/MULTI/SUBSCRIBE/MONITOR）
- [x] 服务器状态监控
- [x] DB Key 统计
- [x] 命令日志
- [x] 慢查询日志
- [x] 批量删除
- [x] 多标签页
- [x] 主题切换（Light/Dark/System）
- [x] 多语言支持
- [x] 连接导入/导出

### 9.2 新增/增强功能（超越 ARDM）

| 功能 | 说明 |
|---|---|
| 🔥 **原生性能** | Rust 后端，内存占用降低 60%+ |
| 🔥 **极小体积** | 安装包 < 15MB（ARDM ~80MB） |
| 🔥 **更快的启动** | Tauri 2 原生窗口，秒开 |
| 🔥 **更好的安全性** | Rust 内存安全，无 Node.js 依赖漏洞 |
| 🔥 **原生文件对话框** | Tauri 原生 API，体验更好 |
| 🔥 **独立设置窗口** | OS 级独立窗口（已实现） |
| 🔥 **TSX 组件开发** | 类型安全的组件开发 |
| 🔥 **Composition API** | 更好的逻辑复用和代码组织 |

---

## 十、总结

本迁移计划将 ARDM 的 **83 项具体任务** 分为 **6 个阶段**，预计 **16 周**（约 4 个月）完成。核心风险集中在 Redis Cluster/Sentinel 支持和 SSH 隧道实现，建议在 Phase 3 开始前进行 POC 验证。

整体策略是 **先核心后外围**：先实现 Standalone 连接 + Key 管理 + 数据编辑，再扩展高级连接模式，最后补充工具和查看器。每个 Phase 结束都有明确的里程碑验收标准，确保进度可控。
