# Redis Desktop Manager — 完整迁移计划（v2.0）

> **项目目标**：将 AnotherRedisDesktopManager (Electron 12 + Vue 2) 的全部功能迁移至 Tauri 2 + Vue 3 + Rust 技术栈，消除历史包袱，大胆采用新技术，实现更小体积、更高性能、更好体验的 Redis 桌面客户端。
>
> **文档版本**：v2.0 — 基于 [`redis-desktop-migration-plan-review.md`](redis-desktop-migration-plan-review.md) 评审建议全面修订
>
> **配套文档**：
> - 架构设计：[`redis-desktop-module-architecture.md`](redis-desktop-module-architecture.md)
> - 可行性分析：[`another-redis-desktop-manager-migration-analysis.md`](another-redis-desktop-manager-migration-analysis.md)
> - 架构评审：[`redis-desktop-backend-architecture-review.md`](redis-desktop-backend-architecture-review.md)
> - 迁移评审：[`redis-desktop-migration-plan-review.md`](redis-desktop-migration-plan-review.md)

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

### 0.3 VTable 注意事项与风险

| 风险项 | 影响 | 应对策略 |
|---|---|---|
| Canvas 渲染无 DOM 元素 | 单元格内无法直接嵌入 Element Plus 组件 | 使用 VTable 的 `customRender` 自定义渲染；操作按钮使用 VTable 编辑器或事件回调 |
| 键盘导航存在边缘 case | 部分快捷键可能不生效 | 桌面应用场景影响较小；必要时补充自定义键盘处理 |
| 自定义渲染学习曲线 | 需要学习 VTable 渲染 API | 文档完善，社区活跃；投入 1-2 天学习即可 |
| 包体积可能较大 | @visactor/vtable 完整版约 2-3MB | 使用 `ListTable-Simple`（仅文本类型）减小体积；按需加载 |
| 暗黑模式需要适配 | VTable 有自己的主题系统 | 通过 VTable 主题 API 统一配置，与 Element Plus 暗黑模式并行 |

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
| **localStorage** | **Tauri Store Plugin + 加密存储** | 原生存储，敏感信息加密 |
| **Electron IPC (ipcRenderer)** | **Tauri invoke / Tauri Plugin** | Rust ↔ 前端通信，Plugin 化模块注册 |
| **Electron clipboard** | **Tauri clipboard plugin** | 系统剪贴板 |
| **Electron shell** | **Tauri shell plugin** | 打开外部链接、执行外部命令 |
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
| **protobufjs** | **protobuf crate (Rust 动态解析)** | Protobuf 运行时编解码 | ⭐⭐⭐ |
| **php-serialize** | **Rust 自实现** | PHP 反序列化（协议简单） | ⭐⭐⭐ |
| **java-object-serialization** | **Rust 自实现（只读）** | Java 对象反序列化（有限类型） | ⭐⭐⭐⭐ |
| **pickleparser** | **serde-pickle (Rust)** | Python Pickle 解析 | ⭐⭐⭐ |
| **algo-msgpack-with-bigint** | **rmp-serde (Rust)** | MessagePack 编解码 | ⭐⭐ |
| **@qii404/redis-splitargs** | **Rust 自实现** | Redis 命令参数分割 | ⭐⭐ |
| **@qii404/json-bigint** | **serde_json (Rust, 原生支持大数)** | JSON BigInt 处理 | ⭐ |
| **sortablejs** | **vuedraggable@next** | 拖拽排序 | ⭐⭐ |
| **keymaster** | **@vueuse/core (useMagicKeys)** | 快捷键绑定 | ⭐ |
| **font-awesome 4.x** | **@element-plus/icons-vue** | 图标库 | ⭐ |
| **zlib (Node 内置)** | **flate2 + brotli (Rust)** | gzip/deflate/brotli 解压 | ⭐⭐ |

### 1.3 数据流架构变更

```
原架构 (Electron):
  Renderer (Vue 2) → ipcRenderer → Electron Main → ioredis (Node.js) → Redis
  Renderer (Vue 2) → ipcRenderer → Electron Main → tunnel-ssh (Node.js) → SSH Server → Redis

新架构 (Tauri 2 + Plugin):
  Renderer (Vue 3) → Tauri invoke → redis-desktop Plugin → redis-rs (tokio) → Redis
  Renderer (Vue 3) → Tauri invoke → redis-desktop Plugin → ssh2 (tokio) → SSH Server → Redis
  Renderer (Vue 3) ← Tauri Events ← redis-desktop Plugin → Stream 数据 → 前端
  Renderer (Vue 3) → Tauri invoke → telepresence Plugin → telepresence CLI → K8s
```

---

## 二、完整功能清单与迁移映射

> **状态标记**：`[ ]` 未开始 | `[-]` 进行中 | `[x]` 已完成 | `[~]` 已跳过

### 2.1 连接管理

| # | 功能 | 原文件 | 新实现位置 | 优先级 | 状态 |
|---|---|---|---|---|---|
| C-01 | 新建连接（Host/Port/Auth/Username） | `NewConnectionDialog.vue` | 前端 `connection-dialog.tsx` + Rust `connection/service.rs` | P0 | [x] |
| C-02 | 编辑连接 | `NewConnectionDialog.vue` | 同 C-01 | P0 | [x] |
| C-03 | 删除连接 | `ConnectionMenu.vue` | 前端 + Rust `storage/service.rs` | P0 | [x] |
| C-04 | 连接列表（拖拽排序） | `Connections.vue` + `sortablejs` | 前端 `connection-list.tsx` + `vuedraggable` | P0 | [x] |
| C-05 | Standalone 连接 | `redisClient.js::createConnection` | Rust `connection/service.rs::connect_standalone` | P0 | [x] |
| C-06 | Cluster 连接（NAT 映射） | `redisClient.js::createConnection(cluster)` | Rust `connection/service.rs::connect_cluster` | P1 | [x] |
| C-07 | Sentinel 连接 | `redisClient.js::createConnection(sentinel)` | Rust `connection/service.rs::connect_sentinel` | P1 | [x] |
| C-08 | SSH 隧道连接 | `redisClient.js::createSSHConnection` | Rust `tunnel/service.rs::create_ssh_tunnel` | P1 | [x] |
| C-09 | SSH + Cluster 组合 | `redisClient.js` | Rust `tunnel/service.rs` + `connection/service.rs` | P2 | [x] |
| C-10 | SSH + Sentinel 组合 | `redisClient.js` | Rust `tunnel/service.rs` + `connection/service.rs` | P2 | [x] |
| C-11 | SSL/TLS 连接 | `redisClient.js::getTLSOptions` | Rust `connection/service.rs::connect_tls` (native-tls) | P1 | [ ] |
| C-12 | ACL 用户名认证 | `redisClient.js::getRedisOptions(username)` | Rust `redis-rs` 原生支持 | P0 | [x] |
| C-13 | 只读模式（命令拦截中间件） | `redisClient.js::sendCommand` 猴子补丁 | Rust `shared/redis_client.rs` 命令拦截层 | P2 | [ ] |
| C-14 | 数据库选择 | `KeyList.vue::setDb` | Rust `connection/commands.rs::select_db` | P0 | [x] |
| C-15 | 连接重试策略 | `redisClient.js::retryStragety` | Rust `redis-rs` reconnect 配置 | P1 | [ ] |
| C-16 | 连接导出/导入 | `Setting.vue` | Rust `storage/service.rs` + Tauri dialog | P1 | [ ] |
| C-17 | CLI 参数启动连接 | `addon.js::bindCliArgs` | Rust `clap` CLI 解析 | P2 | [ ] |
| C-18 | 连接颜色标记（7 种颜色） | `ConnectionMenu.vue::markColor` | 前端 `connection-list.tsx` + Tauri Store | P1 | [ ] |
| C-19 | 连接复制 | `ConnectionMenu.vue::duplicateConnection` | 前端 + Rust `storage/service.rs` | P1 | [ ] |
| C-20 | 密码加密存储 | `storage.js`（明文） | Rust `storage/service.rs` + `keyring` crate 或 AES 加密 | P1 | [ ] |

### 2.2 Key 管理

| # | 功能 | 原文件 | 新实现位置 | 优先级 | 状态 |
|---|---|---|---|---|---|
| K-01 | Key 列表（SCAN 流式加载 + 暂停/恢复） | `KeyList.vue` | Rust `key/service.rs::scan_keys` + Tauri Events | P0 | [x] |
| K-02 | Key 树形视图（分隔符分组 + 200K 溢出保护） | `KeyListVirtualTree.vue` + `util.js::keysToTree` | 前端 `key-tree.tsx`（VTable ListTable tree mode） | P0 | [x] |
| K-03 | Key 平铺列表视图 | `KeyListNormal.vue` | 前端 `key-list.tsx`（VTable ListTable） | P1 | [x] |
| K-04 | Key 搜索（模糊/精确） | `OperateItem.vue` | 前端 `key-search.tsx` | P0 | [x] |
| K-05 | Key 加载更多/加载全部 | `KeyList.vue` | Rust SCAN 分页 | P0 | [x] |
| K-06 | Key 详情查看 | `KeyDetail.vue` | 前端 `key-detail.tsx` | P0 | [x] |
| K-07 | Key 重命名 | `KeyHeader.vue::renameKey` | Rust `key/service.rs::rename_key` | P0 | [x] |
| K-08 | Key 删除 | `KeyHeader.vue::deleteKey` | Rust `key/service.rs::delete_keys` | P0 | [x] |
| K-09 | Key TTL 查看/修改 | `KeyHeader.vue::ttlKey` | Rust `key/service.rs::ttl/expire` | P0 | [x] |
| K-10 | Key Persist（移除过期） | `KeyHeader.vue::persistKey` | Rust `key/service.rs::persist` | P0 | [x] |
| K-11 | Key 自动刷新 | `KeyHeader.vue::autoRefresh` | 前端定时器 | P1 | [ ] |
| K-12 | Key DUMP 命令导出 | `KeyHeader.vue::dumpCommand` | Rust `key/service.rs::dump` | P2 | [ ] |
| K-13 | 批量删除 Key | `DeleteBatch.vue` | Rust 批量 `DEL` | P1 | [ ] |
| K-14 | 批量导出 Key | `KeyList.vue::exportBatch` | Rust `DUMP`+`PTTL` 批量 + CSV 导出 | P2 | [ ] |
| K-15 | Cluster 并行 SCAN（所有 master 节点） | `KeyList.vue` cluster 模式 | Rust `key/service.rs::scan_cluster` | P1 | [ ] |
| K-16 | Key 导入（RESTORE 命令） | `ConnectionMenu.vue::importKeys` | Rust `key/service.rs::restore` + Tauri dialog | P1 | [ ] |
| K-17 | 自定义 DB 名称 | `storage.js` + `OperateItem.vue` | 前端 + Tauri Store | P2 | [ ] |

### 2.3 数据类型编辑器

| # | 功能 | 原文件 | 新实现位置 | 优先级 | 状态 |
|---|---|---|---|---|---|
| D-01 | String 查看/编辑 | `KeyContentString.vue` | 前端 `content-string.tsx` | P0 | [x] |
| D-02 | Hash 查看/编辑/新增/删除 | `KeyContentHash.vue` | 前端 `content-hash.tsx` + Rust `data/hash_service.rs` | P0 | [x] |
| D-03 | List 查看/编辑 | `KeyContentList.vue` | 前端 `content-list.tsx` + Rust `data/list_service.rs` | P0 | [x] |
| D-04 | Set 查看/编辑 | `KeyContentSet.vue` | 前端 `content-set.tsx` + Rust `data/set_service.rs` | P0 | [x] |
| D-05 | ZSet 查看/编辑（排序切换） | `KeyContentZset.vue` | 前端 `content-zset.tsx` + Rust `data/zset_service.rs` | P0 | [x] |
| D-06 | Stream 查看/编辑/新增 | `KeyContentStream.vue` | 前端 `content-stream.tsx` + Rust `data/stream_service.rs` | P0 | [x] |
| D-07 | ReJSON 查看/编辑 | `KeyContentReJson.vue` | 前端 `content-rejson.tsx` + Rust `data/string_service.rs` | P2 | [ ] |
| D-08 | Hash TTL 支持（Redis 7.4+） | `KeyContentHash.vue::initTTL` | Rust `data/hash_service.rs::httl` | P2 | [ ] |

### 2.4 数据查看器

| # | 功能 | 原文件 | 新实现位置 | 优先级 | 状态 |
|---|---|---|---|---|---|
| V-01 | Text 文本查看器 | `ViewerText.vue` | 前端 `viewer-text.tsx` | P0 | [ ] |
| V-02 | Hex 十六进制查看器 | `ViewerHex.vue` | 前端 `viewer-hex.tsx` | P0 | [ ] |
| V-03 | JSON 查看器（格式化/折叠） | `ViewerJson.vue` + `JsonEditor.vue` | 前端 `viewer-json.tsx`（monaco-editor-vue3） | P0 | [ ] |
| V-04 | Binary 二进制查看器 | `ViewerBinary.vue` | 前端 `viewer-binary.tsx` | P1 | [ ] |
| V-05 | Msgpack 查看器 | `ViewerMsgpack.vue` | Rust `viewer/deserialize.rs` (rmp-serde) → 前端展示 | P2 | [ ] |
| V-06 | PHPSerialize 查看器 | `ViewerPHPSerialize.vue` | Rust `viewer/deserialize.rs` (自实现) → 前端展示 | P2 | [ ] |
| V-07 | JavaSerialize 查看器（只读） | `ViewerJavaSerialize.vue` | Rust `viewer/deserialize.rs` (自实现) → 前端展示 | P2 | [ ] |
| V-08 | Pickle 查看器 | `ViewerPickle.vue` | Rust `viewer/deserialize.rs` (serde-pickle) → 前端展示 | P2 | [ ] |
| V-09 | Gzip 解压查看器 | `ViewerGzip.vue` | Rust `viewer/decompress.rs` (flate2::GzDecoder) | P2 | [ ] |
| V-10 | Brotli 解压查看器 | `ViewerBrotli.vue` | Rust `viewer/decompress.rs` (brotli crate) | P2 | [ ] |
| V-11 | Deflate 解压查看器 | `ViewerDeflate.vue` | Rust `viewer/decompress.rs` (flate2) | P2 | [ ] |
| V-12 | DeflateRaw 解压查看器 | `ViewerDeflateRaw.vue` | Rust `viewer/decompress.rs` (flate2) | P2 | [ ] |
| V-13 | Protobuf 查看器（.proto 动态加载） | `ViewerProtobuf.vue` | Rust `viewer/protobuf.rs` (protobuf crate 动态解析) | P2 | [ ] |
| V-14 | OverSize 大文件查看器（>20MB 截断） | `ViewerOverSize.vue` | 前端 `viewer-oversize.tsx`（分片加载） | P2 | [ ] |
| V-15 | 自定义格式化器（模板变量 + Shell 执行） | `ViewerCustom.vue` + `CustomFormatter.vue` | 前端模板引擎 + Tauri Shell Plugin 执行 | P3 | [ ] |
| V-16 | 自动格式检测 | `FormatViewer.vue::autoFormat` | Rust `viewer/format_detector.rs` → 返回格式类型 | P1 | [ ] |

### 2.5 工具功能

| # | 功能 | 原文件 | 新实现位置 | 优先级 | 状态 |
|---|---|---|---|---|---|
| T-01 | CLI 命令行（自动补全） | `CliTab.vue` + `CliContent.vue` | 前端 `cli-terminal.tsx` + Rust `cli/service.rs` | P0 | [x] |
| T-02 | 命令历史记录 | `CliTab.vue::initHistoryTips` | Tauri Store 持久化 | P0 | [x] |
| T-03 | MULTI/EXEC 事务支持 | `CliTab.vue::multiQueue` | Rust `cli/service.rs` (redis-rs pipeline) | P1 | [ ] |
| T-04 | SUBSCRIBE/PSUBSCRIBE | `CliTab.vue::subscribeMode` | Rust `cli/service.rs` Pub/Sub + Tauri Events | P1 | [ ] |
| T-05 | MONITOR 实时监控 | `CliTab.vue::monitorMode` | Rust `tool/monitor_service.rs` + Tauri Events | P1 | [ ] |
| T-06 | 命令日志（横切中间件） | `CommandLog.vue` + bus 事件 | Rust `shared/redis_client.rs` 拦截 + Tauri Events | P0 | [x] |
| T-07 | 服务器状态（INFO 解析） | `Status.vue` | Rust `tool/info_service.rs` → 前端展示 | P0 | [x] |
| T-08 | 自动刷新状态 | `Status.vue::autoRefresh` | 前端定时器 + Rust 查询 | P1 | [x] |
| T-09 | DB Key 统计 | `Status.vue::initDbKeys` | Rust `tool/info_service.rs` INFO KEYSPACE 解析 | P0 | [x] |
| T-10 | Cluster 节点统计 | `Status.vue::initClusterKeys` | Rust `tool/info_service.rs` 遍历 master 节点 | P1 | [ ] |
| T-11 | 慢查询日志 | `SlowLog.vue` | Rust `tool/slowlog_service.rs` → 前端 VTable | P1 | [x] |
| T-12 | 内存分析 | `MemoryAnalysis.vue` | Rust `tool/memory_service.rs` SCAN + MEMORY USAGE | P2 | [x] |
| T-13 | 右键菜单 | `RightClickMenu.vue` | 前端自定义右键菜单组件 | P1 | [ ] |
| T-14 | 快捷键系统 | `shortcut.js` + `HotKeys.vue` | `@vueuse/core::useMagicKeys` | P1 | [ ] |
| T-15 | 多标签页管理（替换/追加/Ctrl+Click/右键菜单） | `Tabs.vue` | 前端 `components/tab-bar.tsx` | P0 | [x] |
| T-16 | 更新检查 | `UpdateCheck.vue` | Tauri updater plugin | P2 | [ ] |
| T-17 | 回到顶部 | `ScrollToTop.vue` | 前端组件 | P2 | [ ] |
| T-18 | FLUSHDB 清空数据库（二次确认） | `ConnectionMenu.vue::flushDB` | Rust `tool/commands.rs::flush_db` | P1 | [x] |
| T-19 | 命令文件导入执行 | `ConnectionMenu.vue::importCommands` | Rust `cli/service.rs` + Tauri dialog | P2 | [ ] |

### 2.6 设置与个性化

| # | 功能 | 原文件 | 新实现位置 | 优先级 | 状态 |
|---|---|---|---|---|---|
| S-01 | 主题切换（Light/Dark/System） | `Setting.vue` + CSS 变量 | Element Plus 暗黑模式 + CSS 变量 + VTable 主题 | P0 | [ ] |
| S-02 | 语言切换（13 种语言） | `LanguageSelector.vue` + `i18n/` | vue-i18n 9.x | P0 | [ ] |
| S-03 | 页面缩放 | `Setting.vue::changeZoom` | Tauri window API | P1 | [ ] |
| S-04 | 字体选择 | `Setting.vue::getAllFonts` | Rust 系统字体 API | P2 | [ ] |
| S-05 | 每页加载数量 | `Setting.vue::keysPageSize` | Tauri Store | P1 | [ ] |
| S-06 | 侧边栏宽度拖拽 | `App.vue::bindSideBarDrag` | 前端拖拽实现 | P1 | [ ] |
| S-07 | 清除缓存 | `Setting.vue::clearCache` | Tauri Store 清理 | P2 | [ ] |
| S-08 | 分隔符自定义 | `NewConnectionDialog.vue` | 连接配置存储 | P1 | [ ] |
| S-09 | 连接状态持久化（侧边栏宽度/最后 DB） | `storage.js` | Tauri Store | P2 | [ ] |

---

## 三、分阶段迁移计划

> **进度跟踪说明**：
> - 每个任务有唯一编号（如 `0-1`），对应 Phase + 序号
> - 状态列：`[ ]` 未开始 | `[-]` 进行中 | `[x]` 已完成 | `[~]` 已跳过
> - 完成日期：任务完成后填写实际完成日期
> - 验收标准：每个 Phase 有明确的里程碑验收标准

---

### Phase 0：基础架构搭建（2.5 周）

**目标**：建立 Tauri Plugin 化后端框架 + 前端模块化结构 + 基础 UI 框架

| 编号 | 任务 | 预计工时 | 负责人 | 依赖 | 状态 | 完成日期 |
|---|---|---|---|---|---|---|
| 0-1 | Rust 域驱动模块结构搭建（`modules/redis_desktop/` + `modules/telepresence/` + `shared/`） | 4h | 后端 | 无 | [x] | 2026-05-15 |
| 0-2 | Tauri Plugin 注册机制搭建（`modules/redis_desktop/mod.rs::plugin()` + `lib.rs` 注册） | 4h | 后端 | 0-1 | [x] | 2026-05-15 |
| 0-3 | `ConnectionManager<C>` trait 定义（`shared/connection.rs`） | 4h | 后端 | 0-1 | [x] | 2026-05-15 |
| 0-4 | 全局错误处理框架（`shared/error.rs` + `shared/result.rs`，thiserror + anyhow） | 4h | 后端 | 0-1 | [x] | 2026-05-15 |
| 0-5 | 事件命名空间工具（`shared/event.rs` + `redis_event!` 宏） | 2h | 后端 | 0-1 | [x] | 2026-05-15 |
| 0-6 | Tauri Store 存储服务（`modules/redis_desktop/storage/` Plugin） | 8h | 后端 | 0-2, 0-4 | [x] | 2026-05-15 |
| 0-7 | 定义 Tauri Command 接口（前后端 IPC 协议骨架，48 个 command） | 8h | 全栈 | 0-2, 0-5 | [x] | 2026-05-15 |
| 0-8 | 前端模块自包含结构搭建（`modules/redis-desktop-manager/` + services/types/composables 骨架） | 4h | 前端 | 无 | [x] | 2026-05-15 |
| 0-9 | 前端跨模块通信总线（`modules/_shared/use-module-bus.ts`，mitt + typed events） | 4h | 前端 | 0-8 | [x] | 2026-05-15 |
| 0-10 | 前端路由系统（Vue Router 5.x hash 模式 + 4 页面懒加载） | 8h | 前端 | 0-8 | [x] | 2026-05-15 |
| 0-11 | 前端布局框架（三栏布局 + 侧边栏 + 分类面板） | 8h | 前端 | 0-10 | [x] | 2026-05-15 |
| 0-12 | Element Plus 暗黑主题集成（useTheme composable + dark-theme.css CSS 变量） | 4h | 前端 | 0-11 | [x] | 2026-05-15 |
| 0-13 | vue-i18n 11.x 国际化框架搭建（中英文 Composition API 模式） | 8h | 前端 | 0-10 | [x] | 2026-05-15 |

**里程碑 M0**：✅ 空壳应用可运行，三栏布局正常，暗黑模式切换正常，Plugin 注册机制就绪，Rsbuild 构建零错误

**总工时**：70h

---

### Phase 1：核心连接 + Key 浏览 + 多标签页（3.5 周）

**目标**：实现 Standalone Redis 连接 + Key 列表/树 + Key 详情 + 多标签页管理 + 命令日志基础

| 编号 | 任务 | 预计工时 | 负责人 | 依赖 | 状态 | 完成日期 |
|---|---|---|---|---|---|---|
| 1-1 | Rust `RedisConnectionManager` 实现（`ConnectionManager<ConnectionConfig>` trait） | 16h | 后端 | Phase 0 | [x] | 2026-05-15 |
| 1-2 | Rust SCAN 命令流式输出（`key/service.rs` + Tauri Events `redis:key:scan:progress`） | 12h | 后端 | 1-1 | [x] | 2026-05-15 |
| 1-3 | Rust Key 操作命令（TYPE/TTL/DEL/RENAME/PERSIST） | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 1-4 | Rust 命令日志中间件（`shared/redis_client.rs` 拦截 + Tauri Events `redis:tool:command-log`） | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 1-5 | 前端连接管理 UI（新建/编辑/删除/列表/拖拽排序） | 16h | 前端 | 0-6, 0-7 | [x] | 2026-05-15 |
| 1-6 | 前端连接表单（Host/Port/Auth/Username/DB） | 12h | 前端 | 1-5 | [x] | 2026-05-15 |
| 1-7 | 前端 Key 列表组件（VTable ListTable + SCAN 分页加载 + 暂停/恢复） | 16h | 前端 | 1-2 | [x] | 2026-05-15 |
| 1-8 | 前端 Key 树形视图（VTable ListTable tree mode + 200K 溢出保护） | 12h | 前端 | 1-7 | [x] | 2026-05-15 |
| 1-9 | 前端 Key 搜索（模糊/精确匹配） | 8h | 前端 | 1-7 | [x] | 2026-05-15 |
| 1-10 | 前端 Key 详情页（Header + TTL + 操作栏） | 12h | 前端 | 1-3 | [x] | 2026-05-15 |
| 1-11 | 前端 DB 选择器 | 4h | 前端 | 1-1 | [x] | 2026-05-15 |
| 1-12 | 前端多标签页管理（替换/追加策略 + Ctrl+Click + 右键菜单） | 16h | 前端 | 0-11 | [x] | 2026-05-15 |
| 1-13 | 前端命令日志面板（监听 `redis:tool:command-log` 事件） | 8h | 前端 | 1-4 | [x] | 2026-05-15 |
| 1-14 | 集成测试：Standalone 连接全流程 | 8h | 全栈 | 1-5~1-13 | [x] | 2026-05-15 |

**里程碑 M1**：✅ 可连接 Standalone Redis，浏览 Key 列表/树，查看 Key 详情，多标签页管理可用，命令日志记录正常

**总工时**：148h

---

### Phase 2：数据类型编辑器（3 周）

**目标**：实现 7 种 Redis 数据类型的查看和编辑 + 基础数据查看器

| 编号 | 任务 | 预计工时 | 负责人 | 依赖 | 状态 | 完成日期 |
|---|---|---|---|---|---|---|
| 2-1 | Rust DataService 统一实现（Hash/List/Set/ZSet/Stream/String 全部 CRUD） | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 2-2 | Rust RedisClient 补充缺失方法（LSET/LPUSH/ZSCORE/XADD 等） | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 2-3 | Rust data/commands.rs 连接 DataService（17 个 Tauri command） | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 2-4 | Rust 编译验证（0 errors, 39 warnings） | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 2-5 | 前端数据类型编辑器组件（content-string/hash/list/set/zset/stream.tsx） | 12h | 前端 | 2-1 | [x] | 2026-05-15 |
| 2-6 | 前端 key-detail.tsx 集成数据类型编辑器（替换占位符） | 12h | 前端 | 2-5 | [x] | 2026-05-15 |
| 2-7 | 前端 FormatViewer（自动格式检测 + V-16 格式检测 Rust API） | 12h | 前端 | 2-6 | [~] | 延后至 Phase 5 |
| 2-8 | 前端 Text/Hex/JSON 查看器 | 12h | 前端 | 2-7 | [~] | 延后至 Phase 5 |
| 2-9 | 前端 String 编辑器 | 8h | 前端 | 2-6 | [x] | 2026-05-15 |
| 2-10 | 前端 Hash 编辑器（el-table + HSCAN 搜索 + 行内编辑） | 12h | 前端 | 2-1 | [x] | 2026-05-15 |
| 2-11 | 前端 List 编辑器（el-table + LPUSH/RPUSH + LSET 编辑） | 8h | 前端 | 2-2 | [x] | 2026-05-15 |
| 2-12 | 前端 Set 编辑器（el-table + SSCAN + SADD/SREM） | 8h | 前端 | 2-3 | [x] | 2026-05-15 |
| 2-13 | 前端 ZSet 编辑器（el-table + 排序切换 + ZADD/ZREM） | 8h | 前端 | 2-4 | [x] | 2026-05-15 |
| 2-14 | 前端 Stream 编辑器（el-table + XADD/XDEL + 消费者组信息） | 12h | 前端 | 2-5 | [x] | 2026-05-15 |
| 2-15 | 前端构建验证（0 errors） | 8h | 全栈 | 2-9~2-14 | [x] | 2026-05-15 |

**里程碑 M2**：✅ 可查看和编辑 String/Hash/List/Set/ZSet/Stream 类型数据，基础查看器（Text/Hex/JSON）可用

**总工时**：124h

---

### Phase 3：高级连接模式（3 周）

**目标**：实现 Cluster、Sentinel、SSH 隧道、SSL/TLS 连接

> ⚠️ **POC 前置要求**：Phase 3 开始前需完成 redis-rs Cluster/Sentinel 和 ssh2 隧道的 POC 验证

| 编号 | 任务 | 预计工时 | 负责人 | 依赖 | 状态 | 完成日期 |
|---|---|---|---|---|---|---|
| 3-0 | POC：redis-rs Cluster 连接验证 + NAT 映射可行性 | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 3-1 | Rust Cluster 连接（redis-rs cluster 模式） | 16h | 后端 | 3-0 | [x] | 2026-05-15 |
| 3-2 | Rust Cluster NAT 映射处理 | 8h | 后端 | 3-1 | [x] | 2026-05-16 |
| 3-3 | Rust Sentinel 连接 | 12h | 后端 | 1-1 | [x] | 2026-05-15 |
| 3-4 | POC：ssh2 crate SSH 隧道验证 | 4h | 后端 | 0-3 | [x] | 2026-05-15 |
| 3-5 | Rust SSH 隧道（`tunnel/service.rs`，ssh2 crate + tokio） | 16h | 后端 | 3-4 | [x] | 2026-05-15 |
| 3-6 | Rust SSH + Standalone 组合 | 8h | 后端 | 3-5 | [x] | 2026-05-15 |
| 3-7 | Rust SSH + Cluster 组合（多隧道并发管理） | 12h | 后端 | 3-1, 3-5 | [x] | 2026-05-16 |
| 3-8 | Rust SSH + Sentinel 组合 | 8h | 后端 | 3-3, 3-5 | [x] | 2026-05-16 |
| 3-9 | Rust SSL/TLS 连接（native-tls 或 rustls） | 8h | 后端 | 1-1 | [~] | 延后（需 tokio-rustls） |
| 3-10 | 前端连接表单扩展（SSH/SSL/Sentinel/Cluster 配置） | 16h | 前端 | 1-6 | [x] | 2026-05-15 |
| 3-11 | 前端文件选择器（SSH Key/SSL 证书，Tauri dialog plugin） | 8h | 前端 | 3-10 | [ ] | |
| 3-12 | 集成测试：所有连接模式 | 16h | 全栈 | 3-1~3-11 | [ ] | |

**里程碑 M3**：✅ 支持 Standalone/Cluster/Sentinel/SSH/SSL 全部连接模式

**总工时**：120h

---

### Phase 4：工具与高级功能（2 周）

**目标**：实现 CLI、状态监控、慢日志、批量操作等工具功能

| 编号 | 任务 | 预计工时 | 负责人 | 依赖 | 状态 | 完成日期 |
|---|---|---|---|---|---|---|
| 4-1 | Rust 命令执行引擎（`cli/service.rs`，任意 Redis 命令解析 + 执行） | 12h | 后端 | 1-1 | [x] | 2026-05-15 |
| 4-2 | Rust 命令参数解析器（`cli/parser.rs`） | 4h | 后端 | 4-1 | [x] | 2026-05-15 |
| 4-3 | Rust 命令自动补全（`cli/autocomplete.rs`，150+ 命令 15 分组） | 4h | 后端 | 4-1 | [x] | 2026-05-15 |
| 4-4 | Rust Pub/Sub 支持（`cli/service.rs` + Tauri Events `redis:cli:subscribe`） | 8h | 后端 | 1-1 | [ ] | |
| 4-5 | Rust MONITOR 支持（`tool/monitor_service.rs` + Tauri Events `redis:cli:monitor`） | 8h | 后端 | 1-1 | [ ] | |
| 4-6 | Rust INFO 命令解析（`tool/service.rs` InfoService） | 4h | 后端 | 1-1 | [x] | 2026-05-15 |
| 4-7 | Rust SLOWLOG 命令（`tool/service.rs` SlowLogService） | 4h | 后端 | 1-1 | [x] | 2026-05-15 |
| 4-8 | Rust MEMORY USAGE 批量分析（`tool/service.rs` MemoryAnalysisService + Tauri Events 进度推送） | 8h | 后端 | 1-1 | [x] | 2026-05-15 |
| 4-9 | Rust FLUSHDB 命令（`tool/service.rs` FlushDbService + FlushAllService） | 2h | 后端 | 1-1 | [x] | 2026-05-15 |
| 4-10 | 前端 CLI 终端组件（`cli-terminal.tsx`，命令输入 + 自动补全 + 历史导航 + 语法提示） | 16h | 前端 | 4-1, 4-2, 4-3 | [x] | 2026-05-15 |
| 4-11 | 前端状态监控面板（`status-panel.tsx`，INFO 解析展示 + DB 统计 + 自动刷新） | 12h | 前端 | 4-6 | [x] | 2026-05-15 |
| 4-12 | 前端慢日志面板（`slow-log-panel.tsx`，列表 + 按耗时排序） | 6h | 前端 | 4-7 | [x] | 2026-05-15 |
| 4-13 | 前端内存分析面板（`memory-analysis-panel.tsx`，表格 + 进度条 + 排序） | 8h | 前端 | 4-8 | [x] | 2026-05-15 |
| 4-14 | 前端批量删除面板（VTable ListTable） | 8h | 前端 | 1-3 | [ ] | |
| 4-15 | 前端快捷键系统（useMagicKeys + scope 管理） | 8h | 前端 | 1-12 | [ ] | |
| 4-16 | 前端右键菜单组件 | 4h | 前端 | 0-11 | [ ] | |
| 4-17 | 前端 Key 导入（RESTORE + Tauri dialog 文件选择） | 8h | 前端 | 4-1 | [ ] | |

**里程碑 M4**：✅ CLI 可用，命令日志/状态/慢日志/内存分析/批量删除全部可用

**总工时**：124h

---

### Phase 5：数据查看器 + 个性化（2 周）

**目标**：实现全部数据查看器、主题/语言/设置

| 编号 | 任务 | 预计工时 | 负责人 | 依赖 | 状态 | 完成日期 |
|---|---|---|---|---|---|---|
| 5-1 | Rust 解压引擎（`viewer/decompress.rs`，gzip/deflate/brotli/deflate-raw） | 8h | 后端 | 0-4 | [ ] | |
| 5-2 | Rust 序列化解析（`viewer/deserialize.rs`，MsgPack/Pickle/PHPSerialize） | 16h | 后端 | 0-4 | [ ] | |
| 5-3 | Rust Java 序列化解析（`viewer/deserialize.rs`，只读基础类型） | 12h | 后端 | 0-4 | [ ] | |
| 5-4 | Rust Protobuf 动态解析（`viewer/protobuf.rs`，protobuf crate 运行时加载 .proto） | 8h | 后端 | 0-4 | [ ] | |
| 5-5 | 前端解压查看器（Gzip/Brotli/Deflate/DeflateRaw） | 8h | 前端 | 5-1 | [ ] | |
| 5-6 | 前端序列化查看器（MsgPack/Pickle/PHP/Java） | 12h | 前端 | 5-2, 5-3 | [ ] | |
| 5-7 | 前端 Protobuf 查看器（.proto 文件选择 + 动态解析） | 12h | 前端 | 5-4 | [ ] | |
| 5-8 | 前端 Binary 查看器 | 4h | 前端 | 无 | [ ] | |
| 5-9 | 前端 OverSize 查看器（>20MB 截断 + 分片加载） | 4h | 前端 | 无 | [ ] | |
| 5-10 | 前端自定义格式化器（模板变量 + Tauri Shell Plugin 执行） | 8h | 前端 | 无 | [ ] | |
| 5-11 | 前端设置页面（主题/语言/缩放/字体/每页数量/分隔符） | 12h | 前端 | Phase 0 | [ ] | |
| 5-12 | 前端连接导入/导出 + 密码加密 | 8h | 前端 | 5-11 | [ ] | |
| 5-13 | 前端 ReJSON 编辑器（monaco-editor-vue3） | 8h | 前端 | 2-9 | [ ] | |
| 5-14 | 前端侧边栏拖拽调整宽度 | 4h | 前端 | 0-11 | [ ] | |
| 5-15 | 前端连接颜色标记 | 4h | 前端 | 1-5 | [ ] | |
| 5-16 | 前端连接复制功能 | 2h | 前端 | 1-5 | [ ] | |

**里程碑 M5**：✅ 全部 15 种数据查看器可用，设置功能完整，连接管理功能完善

**总工时**：130h

---

### Phase 6：优化与发布（2 周）

**目标**：性能优化、测试覆盖、打包发布

| 编号 | 任务 | 预计工时 | 负责人 | 依赖 | 状态 | 完成日期 |
|---|---|---|---|---|---|---|
| 6-1 | Rust 连接池优化（连接复用 + 超时控制） | 8h | 后端 | Phase 3 | [ ] | |
| 6-2 | Rust 大 Key 流式读取优化（分片传输） | 8h | 后端 | Phase 2 | [ ] | |
| 6-3 | 前端 VTable 大数据量渲染优化 | 4h | 前端 | Phase 2 | [ ] | |
| 6-4 | 前端 VTable 主题与 Element Plus 暗黑模式统一 | 4h | 前端 | Phase 4 | [ ] | |
| 6-5 | 前端只读模式 UI 集成（命令拦截提示） | 4h | 前端 | C-13 | [ ] | |
| 6-6 | 全功能回归测试 | 16h | 全栈 | Phase 5 | [ ] | |
| 6-7 | Windows/macOS/Linux 打包配置 | 8h | 全栈 | 6-6 | [ ] | |
| 6-8 | 自动更新（Tauri updater plugin） | 8h | 全栈 | 6-7 | [ ] | |
| 6-9 | CLI 参数启动支持 | 4h | 后端 | 6-7 | [ ] | |
| 6-10 | 文档编写（用户手册 + 开发文档） | 8h | 全栈 | 6-6 | [ ] | |

**里程碑 M6**：✅ 产品可发布

**总工时**：72h

---

## 四、后端模块架构

> 详细架构设计见 [`redis-desktop-module-architecture.md`](redis-desktop-module-architecture.md)，此处仅列出目录结构概览。

```
src-tauri/src/
├── main.rs                          # 应用入口
├── lib.rs                           # Tauri Plugin 注册中心
│
├── modules/                         # ====== 业务模块（Tauri Plugin 化）======
│   ├── redis-desktop/               # 🔴 Redis Desktop Manager 模块域
│   │   ├── mod.rs                   # Plugin 注册入口
│   │   ├── connection/              # 连接管理（commands + service + manager + models）
│   │   ├── key/                     # Key 操作
│   │   ├── data/                    # 数据类型操作（hash/list/set/zset/stream/string）
│   │   ├── cli/                     # CLI 命令执行（parser + autocomplete）
│   │   ├── tool/                    # 工具服务（info/slowlog/memory/monitor）
│   │   ├── viewer/                  # 数据查看器（format_detector + decompress + deserialize + protobuf）
│   │   ├── tunnel/                  # SSH 隧道
│   │   └── shared/                  # Redis 模块域私有（redis_client + error + event）
│   ├── telepresence/                # 🔵 Telepresence 模块域
│   ├── storage/                     # 🟢 全局存储模块
│   └── ...（未来模块）
│
├── shared/                          # ====== 全局共享基础设施 ======
│   ├── connection.rs                # ConnectionManager<C> trait
│   ├── error.rs                     # 全局错误处理
│   ├── result.rs                    # 全局 Result 类型
│   ├── event.rs                     # 事件命名空间工具
│   └── constants.rs                 # 全局常量
│
└── test/                            # ====== 集成测试 ======
    ├── redis-desktop/
    └── telepresence/
```

---

## 五、前端模块架构

> 详细架构设计见 [`redis-desktop-module-architecture.md`](redis-desktop-module-architecture.md) 第二章。

```
src/
├── main.ts                          # 应用入口
├── app.tsx                          # 主应用壳
│
├── modules/                         # ====== 功能模块目录 ======
│   ├── redis-desktop-manager/       # 🔴 Redis Desktop Manager（完全自包含）
│   │   ├── index.tsx                # 模块入口
│   │   ├── index.less               # 模块样式
│   │   ├── types/                   # 模块私有类型
│   │   ├── services/                # 模块私有 IPC 服务
│   │   ├── composables/             # 模块私有组合式函数
│   │   └── components/              # 模块私有组件
│   │       ├── connection/
│   │       ├── key/
│   │       ├── content/
│   │       ├── viewer/
│   │       ├── tool/
│   │       └── common/
│   ├── telepresence-manager/        # 🔵 Telepresence Manager（完全自包含）
│   └── _shared/                     # ⚠️ 模块间共享（谨慎使用）
│
├── components/                      # ====== 全局公共组件 ======
│   ├── layout/                      # 布局组件
│   ├── tabs/                        # 标签页组件
│   └── common/                      # 通用组件
│
├── pages/                           # ====== 独立页面 ======
├── services/                        # ====== 全局服务 ======
├── composables/                     # ====== 全局组合式函数 ======
└── i18n/                            # ====== 国际化 ======
```

---

## 六、风险分析与应对策略

### 6.1 高风险项

| 风险 | 影响程度 | 概率 | 应对策略 |
|---|---|---|---|
| **redis-rs Cluster NAT 映射不完善** | 🔴 高 | 中 | Phase 3 前进行 POC（任务 3-0）；备选：自行实现 NAT 映射层 |
| **SSH 隧道多连接管理** | 🔴 高 | 中 | Phase 3 前进行 POC（任务 3-4）；ssh2 crate 成熟度高；使用 tokio 异步 |
| **VTable Canvas 渲染限制** | 🟡 中 | 低 | 单元格内无法直接嵌入 Element Plus 组件；使用 customRender + 事件回调替代 |
| **Java 序列化解析** | 🟡 中 | 低 | 使用频率低；简化为只读基础类型展示 |
| **Protobuf 动态解析** | 🟡 中 | 中 | 使用 `protobuf` crate（非 `prost`）的动态解析能力 |
| **密码加密存储** | 🟡 中 | 低 | 使用 `keyring` crate 或 AES 加密；优先级 P1 |

### 6.2 进度风险应对

| 风险 | 应对策略 |
|---|---|
| Redis Cluster 支持超预期 | Phase 3 已预留 POC 任务；可先发布 Standalone 版本 |
| VTable 学习曲线 | 提前投入 1-2 天学习 VTable API；参考官方示例 |
| 数据查看器种类多 | 按优先级分批实现；P3 功能可延后 |
| 国际化工作量 | 先支持中英文；其他语言后续补充 |

---

## 七、进度监控

### 7.1 总体进度统计

> 以下数据在迁移过程中持续更新

| Phase | 任务数 | 已完成 | 已跳过 | 未开始 | 完成率 | 预计工期 |
|---|---|---|---|---|---|---|
| Phase 0 | 13 | 13 | 0 | 0 | 100% | 2.5 周 |
| Phase 1 | 14 | 14 | 0 | 0 | 100% | 3.5 周 |
| Phase 2 | 15 | 13 | 2 | 0 | 87% | 3 周 |
| Phase 3 | 12 | 10 | 1 | 1 | 83% | 3 周 |
| Phase 4 | 17 | 11 | 0 | 6 | 65% | 2 周 |
| Phase 5 | 16 | 0 | 0 | 16 | 0% | 2 周 |
| Phase 6 | 10 | 0 | 0 | 10 | 0% | 2 周 |
| **总计** | **97** | **61** | **3** | **33** | **63%** | **18 周** |

### 7.2 里程碑检查点

| 里程碑 | 验收标准 | 目标日期 | 实际日期 | 状态 |
|---|---|---|---|---|
| M0: 基础框架 | 三栏布局可运行，暗黑模式切换，Plugin 注册就绪 | Week 2.5 | 2026-05-15 | [x] |
| M1: 核心连接 | 可连接 Standalone Redis，浏览 Key，多标签页可用 | Week 6 | 2026-05-15 | [x] |
| M2: 数据编辑 | 6 种数据类型可查看/编辑，基础查看器延后至 Phase 5 | Week 9 | 2026-05-15 | [x] |
| M3: 高级连接 | Cluster/Sentinel/SSH/SSL 全部可用 | Week 12 | - | [-] |
| M4: 工具功能 | CLI/日志/状态/慢日志/内存分析/批量操作 | Week 14 | - | [-] |
| M5: 查看器 | 全部 15 种数据查看器可用，设置功能完整 | Week 16 | - | [ ] |
| M6: 发布 | 打包/测试/发布 | Week 18 | - | [ ] |

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
| 表格/树/虚拟列表 | @visactor/vtable (ListTable) | Canvas 渲染百万级数据；内置树形模式；统一 API | - |
| JSON 编辑器 | monaco-editor-vue3 | VSCode 同款编辑器的 Vue 3 原生封装 | - |
| 序列化解析 | Rust 后端统一处理 | 避免前端处理二进制数据的复杂性 | - |
| 前端状态管理 | Pinia（全局） + provide/inject（模块内） | 40+ 组件 + 多模块场景需要全局状态管理 | v2.0 新增 |
| 构建工具 | Rsbuild | 基于 Rspack，构建速度极快 | - |
| 后端架构 | Tauri Plugin 域驱动模块 | 每个工具域注册为独立 Plugin，即插即用 | v2.0 新增 |
| 事件命名 | 模块前缀命名空间（`redis:xxx`） | 避免多模块事件名冲突 | v2.0 新增 |
| 密码存储 | 加密存储（keyring 或 AES） | 原方案明文存储不安全 | v2.0 新增 |
| Protobuf 解析 | protobuf crate（动态解析） | 需要运行时加载 .proto 文件，prost 不支持 | v2.0 修正 |
| 自定义格式化器 | Tauri Shell Plugin 执行 | Tauri 前端无法直接执行系统命令 | v2.0 修正 |

---

## 九、与 ARDM 的功能对比保证

### 9.1 必须保持一致的功能（P0/P1）

- [ ] Standalone Redis 连接
- [ ] Cluster Redis 连接（含 NAT 映射）
- [ ] Sentinel Redis 连接
- [ ] SSH 隧道连接（Standalone/Cluster/Sentinel）
- [ ] SSL/TLS 连接
- [ ] ACL 用户名认证
- [ ] Key 列表/树形浏览（SCAN 流式 + 暂停/恢复）
- [ ] Key 搜索（模糊/精确）
- [ ] Key CRUD（查看/重命名/删除/TTL/Persist）
- [ ] 6 种数据类型编辑器（String/Hash/List/Set/ZSet/Stream）
- [ ] CLI 命令行（自动补全/历史/MULTI/SUBSCRIBE/MONITOR）
- [ ] 命令日志（横切中间件）
- [ ] 服务器状态监控
- [ ] DB Key 统计
- [ ] 慢查询日志
- [ ] 批量删除
- [ ] 多标签页（替换/追加/Ctrl+Click/右键菜单）
- [ ] 主题切换（Light/Dark/System）
- [ ] 多语言支持
- [ ] 连接导入/导出
- [ ] 连接颜色标记
- [ ] 连接复制
- [ ] Key 导入（RESTORE）
- [ ] FLUSHDB（二次确认）

### 9.2 新增/增强功能（超越 ARDM）

| 功能 | 说明 |
|---|---|
| 🔥 **原生性能** | Rust 后端，内存占用降低 60%+ |
| 🔥 **极小体积** | 安装包 < 15MB（ARDM ~80MB） |
| 🔥 **更快启动** | Tauri 2 原生窗口，秒开 |
| 🔥 **更好安全性** | Rust 内存安全 + 密码加密存储 + Tauri 权限系统 |
| 🔥 **Plugin 化架构** | 多工具模块即插即用（Redis + Telepresence + ...） |
| 🔥 **TSX 组件开发** | 类型安全的组件开发 |
| 🔥 **Composition API** | 更好的逻辑复用和代码组织 |
| 🔥 **VTable 百万级渲染** | Canvas 渲染统一替代 3 个组件库 |
| 🔥 **事件命名空间** | 多模块事件隔离，无冲突 |
| 🔥 **独立设置窗口** | OS 级独立窗口 |

---

## 十、总结

本迁移计划（v2.0）将 ARDM 的 **97 项具体任务**（含补充的 15 项遗漏功能）分为 **6 个阶段**，预计 **18 周**（约 4.5 个月）完成。

**与 v1.0 的主要变化**：

| 维度 | v1.0 | v2.0 |
|---|---|---|
| 后端架构 | 扁平分层（commands/services/models） | 域驱动模块 + Tauri Plugin |
| 功能数量 | 83 项 | 97 项（+15 项遗漏功能 + POC 任务） |
| 总工期 | 16 周 | 18 周（+2 周） |
| Phase 0 | 8 任务 / 52h | 13 任务 / 70h（+Plugin + trait + 命名空间） |
| Phase 1 | 11 任务 / 124h | 14 任务 / 148h（+多标签页 + 命令日志） |
| Phase 3 | 2 周 | 3 周（+POC 验证） |
| 密码存储 | 明文 | 加密存储 |
| Protobuf | prost（编译时） | protobuf crate（运行时动态解析） |
| 状态管理 | 不需要 Pinia | Pinia（全局） + provide/inject（模块内） |
| 进度跟踪 | 基础状态标记 | 每任务状态 + 完成日期 + 统计表 |

核心策略仍是 **先核心后外围**：先建立 Plugin 化基础设施，再实现 Standalone 连接 + Key 管理 + 数据编辑，再扩展高级连接模式，最后补充工具和查看器。每个 Phase 结束都有明确的里程碑验收标准，确保进度可控。
