# Phase 6: Testing & Optimization Implementation Plan

## Context

ran-rs-desktop Phase 0-4 已全部完成（数据库驱动、前端、SSH/SSL、插件系统）。Phase 6 需要建立完整的测试体系，确保代码质量。由于本机 Docker 不可用，采用**单元测试 + mock 为主**的策略，利用 SQLite `:memory:` 进行真实数据库测试。

## Architecture

```
ran-rs-desktop/
├── src-tauri/
│   ├── Cargo.toml                    # 添加 [dev-dependencies] + [[bench]]
│   ├── tests/                        # 集成测试（新增）
│   │   ├── sqlite_driver_tests.rs
│   │   ├── storage_service_tests.rs
│   │   ├── plugin_store_tests.rs
│   │   ├── plugin_manager_tests.rs
│   │   ├── plugin_api_dispatcher_tests.rs
│   │   └── connection_models_serde_tests.rs
│   └── src/.../                      # 内联测试添加到 protocol.rs, models.rs
├── vitest.config.ts                   # 新增
├── package.json                       # 添加 test 脚本 + devDeps
└── src/modules/sql-studio/
    └── __tests__/                     # 前端测试（新增）
        ├── __mocks__/tauri.ts
        ├── types/api.test.ts
        ├── services/sql-commands.test.ts
        ├── services/plugin-commands.test.ts
        ├── stores/sql-store.test.ts
        ├── stores/plugin-store.test.ts
        └── plugin-message-router.test.ts
```

---

## Step 1: 测试基础设施搭建

### Rust: Cargo.toml 添加 dev-dependencies

```toml
[dev-dependencies]
tempfile = "3"
tokio-test = "0.4"

[[bench]]
name = "query_benchmark"
harness = false
```

### Frontend: 安装 Vitest + 配置

- `pnpm add -D vitest @vue/test-utils happy-dom @pinia/testing`
- 创建 `vitest.config.ts`（happy-dom 环境，别名对齐 rsbuild）
- 创建 `src/modules/sql-studio/__tests__/__mocks__/tauri.ts`（模拟 invoke）
- package.json 添加 `"test": "vitest run"`, `"test:watch": "vitest"`

### Mock 策略

- **Rust**: 不用 mockall，直接用真实 SQLite `:memory:` + tempfile 临时目录
- **Frontend**: `vi.mock('@tauri-apps/api/core')` 拦截 invoke，每个测试注册命令处理器

---

## Step 2: Tier 1 关键测试（安全 + IPC 序列化）

### 2.1 plugin_manager_tests.rs — 路径遍历防护（最高优先级）

11 个测试：正常文件解析、子目录解析、拒绝 `..` 遍历、拒绝 disabled 插件、plugin_entry_dir 前缀拼接、拒绝 plugin_entry_dir 中的 `..`

### 2.2 plugin_store_tests.rs — 数据完整性

10 个测试：CRUD 操作、覆盖更新、空 key 返回 None、per-plugin 隔离、复杂 JSON 值、并发安全

### 2.3 storage_service_tests.rs — 存储层

9 个测试：连接配置 CRUD、查询历史 CRUD、limit 过滤、cleanup 清理、JSON 往返完整性

### 2.4 connection_models_serde_tests.rs — IPC 序列化

19 个测试：所有 5 种 DatabaseType、SSL camelCase、SSH camelCase、ConnectionConfig 完整/最小往返、TableInfo/ColumnInfo camelCase、PluginManifest 全字段、PluginApiResponse skip_serializing_none

### 2.5 前端 api.test.ts — isRustApi 类型守卫

4 个测试：Rust API 方法返回 true、前端 API 方法返回 false、未知方法返回 false

---

## Step 3: Tier 2 核心业务逻辑测试

### 3.1 sqlite_driver_tests.rs — SQLite 驱动（:memory:）

20 个测试：connect/disconnect 生命周期、ping、空表列表、CREATE+list_tables、list_columns、SELECT/INSERT/UPDATE/DELETE、LIMIT 限制、NULL/BLOB/REAL 值处理、version、未连接操作报错

### 3.2 protocol.rs 内联测试 — MIME 类型映射

10 个测试：html/htm、js/mjs、css、json、图片格式、wasm、字体格式、未知后缀、大小写不敏感

### 3.3 plugin/models.rs 内联测试 — 清单解析

10 个测试：最小清单、完整清单、author 字符串/结构体、缺少必填字段、空 views、无效 JSON、序列化往返、skip_none 行为

### 3.4 plugin_api_dispatcher_tests.rs — API 路由

18 个测试：getTables/getColumns/runQuery 路由、SQL 只读限制（拒绝 INSERT/DROP，允许 WITH/EXPLAIN）、getData/setData 往返、getAppInfo/getConnectionInfo、缺失参数报错、未知方法报错、无活跃连接报错

### 3.5 前端 plugin-message-router.test.ts — 消息路由

12 个测试：iframe 注册/注销、postToIframe 调用验证、broadcast 同插件广播/跨插件隔离、前端 API 处理（getViewContext、openExternal 有效/无效 URL）、通知处理

### 3.6 前端 sql-store.test.ts — Pinia store

14 个测试：初始状态、refreshConnections 填充/错误处理、createConnection、connect 加载配置、disconnect 清除活跃、executeQuery 成功/失败、跳过空 SQL、computed 属性

### 3.7 前端 plugin-store.test.ts — 插件 store

7 个测试：初始状态、refreshPlugins、togglePlugin、enabled/disabled computed

---

## Step 4: Tier 3 健壮性测试

### 4.1 connection_manager_tests.rs — 连接管理

12 个测试：new_with_configs、save/get/delete config、list status、SQLite connect/disconnect 状态变化、get_connection holder 生命周期、不存在的 config 报错、default_port_for_db_type

### 4.2 pg_mysql_config_tests.rs — 配置构建

10 个测试：PG/MySQL/MariaDB/TiDB 配置 serde 往返、SSL 配置保留、create_driver 构造（不连接）

### 4.3 plugin_manager_discovery_tests.rs — 插件发现

13 个测试：空目录、单个/多个插件、跳过文件/无清单/无效清单、list/get 插件、enable/disable 持久化、版本兼容性检查

### 4.4 前端 sql-commands.test.ts — 命令包装器

10 个测试：每个函数调用正确的 invoke 命令名和参数格式

### 4.5 前端 plugin-commands.test.ts — 插件命令包装器

5 个测试：5 个 invoke 调用的命令名和参数验证

---

## Step 5: Tier 4 性能基准测试

### benches/query_benchmark.rs

8 个 benchmark：SQLite 简单查询、批量 INSERT、1000/10000 行 SELECT、manifest 解析、ConnectionConfig serde、plugin store set/get、asset 路径解析

---

## 总计测试数量

| 类别 | 文件数 | 测试数 |
|------|--------|--------|
| Rust Tier 1 | 4 | ~49 |
| Rust Tier 2 | 4 | ~58 |
| Rust Tier 3 | 3 | ~35 |
| Rust Benchmark | 1 | 8 benchmarks |
| Frontend Tier 1-3 | 7 | ~59 |
| **总计** | **19** | **~201 tests + 8 benchmarks** |

---

## 关键文件清单

**新增文件（Rust）:**
- `src-tauri/tests/sqlite_driver_tests.rs`
- `src-tauri/tests/storage_service_tests.rs`
- `src-tauri/tests/plugin_store_tests.rs`
- `src-tauri/tests/plugin_manager_tests.rs`
- `src-tauri/tests/plugin_api_dispatcher_tests.rs`
- `src-tauri/tests/connection_models_serde_tests.rs`
- `src-tauri/tests/connection_manager_tests.rs`
- `src-tauri/tests/pg_mysql_config_tests.rs`
- `src-tauri/benches/query_benchmark.rs`

**新增文件（前端）:**
- `vitest.config.ts`
- `src/modules/sql-studio/__tests__/__mocks__/tauri.ts`
- `src/modules/sql-studio/__tests__/types/api.test.ts`
- `src/modules/sql-studio/__tests__/services/sql-commands.test.ts`
- `src/modules/sql-studio/__tests__/services/plugin-commands.test.ts`
- `src/modules/sql-studio/__tests__/stores/sql-store.test.ts`
- `src/modules/sql-studio/__tests__/stores/plugin-store.test.ts`
- `src/modules/sql-studio/__tests__/plugin-message-router.test.ts`

**修改文件:**
- `src-tauri/Cargo.toml` — 添加 `[dev-dependencies]` + `[[bench]]`
- `package.json` — 添加 devDependencies + test 脚本
- `src-tauri/src/modules/sql_studio/plugin/protocol.rs` — 添加内联 tests mod
- `src-tauri/src/modules/sql_studio/plugin/models.rs` — 添加内联 tests mod

---

## 验证方式

1. `cd src-tauri && cargo test` — 所有 Rust 测试通过（0 failures）
2. `cd ran-rs-desktop && npx vitest run` — 所有前端测试通过
3. `cd src-tauri && cargo bench` — benchmark 运行并输出基准数据
