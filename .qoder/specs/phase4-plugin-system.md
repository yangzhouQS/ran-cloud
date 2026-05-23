# Phase 4: Plugin System Implementation Plan

## Context

ran-rs-desktop 正在从 Beekeeper Studio (Electron + Vue 2) 迁移到 Tauri v2 + Vue 3。Phase 0-3 已完成（项目骨架、数据库驱动、SQL 编辑器、SSH 隧道/SSL）。Phase 4 需要实现插件系统，使第三方开发者能通过 iframe 沙箱扩展 SQL Studio 的功能。

Beekeeper Studio 的插件系统基于 Electron 自定义协议 + iframe 沙箱 + postMessage RPC，本方案将其适配到 Tauri v2 架构，保持相同的插件隔离模型和通信协议，但简化 API 表面（不含插件商店/自动更新）。

---

## Architecture Overview

```
Plugin (iframe, plugin:// scheme)
  │  postMessage(Request {id, name, args})
  ▼
PluginMessageRouter (Vue, window message listener)
  │  invoke('plugin_api_call', {pluginId, request, connectionId})
  ▼
Tauri Command: plugin_api_call
  │  PluginApiDispatcher::dispatch()
  ▼
Rust Services: SqlConnectionManager / PluginDataStore
```

**分流策略**: 数据库查询/数据存储类 API 走 Rust 后端；剪贴板/通知/确认框等 UI 类 API 在前端 PluginMessageRouter 中直接处理，不经过 Tauri IPC。

---

## A. Backend (Rust) — New Module

### New Directory: `src-tauri/src/modules/sql_studio/plugin/`

```
plugin/
├── mod.rs          # Module entry, re-exports
├── models.rs       # Manifest, metadata, API types
├── manager.rs      # PluginManager (discover, enable/disable lifecycle)
├── protocol.rs     # plugin:// custom protocol handler
├── commands.rs     # 5 Tauri commands
├── store.rs        # Key-value data storage per plugin (rusqlite)
└── api.rs          # Plugin API dispatcher
```

### A1. models.rs — Core Types

```rust
// All structs use #[serde(rename_all = "camelCase")] for IPC

struct PluginManifest {
    id: String,
    name: String,
    version: String,
    description: String,
    author: PluginAuthor,       // enum: String | {name, url}
    min_app_version: Option<String>,
    icon: Option<String>,
    manifest_version: u32,      // default 1
    plugin_entry_dir: Option<String>,
    capabilities: PluginCapabilities,
}

struct PluginCapabilities {
    views: Vec<PluginView>,
    menu: Vec<PluginMenuItem>,
}

struct PluginView {
    id: String,
    name: String,
    view_type: String,  // "shell-tab" | "base-tab"
    entry: String,      // HTML filename
}

struct PluginMenuItem {
    command: String,
    name: String,
    view: String,
    placement: String,  // single placement for simplicity
}

struct PluginMetadata {
    manifest: PluginManifest,
    enabled: bool,
    loadable: bool,
    install_path: String,
}

// postMessage wire format
struct PluginApiRequest {
    id: String,
    name: String,
    args: serde_json::Value,
}

struct PluginApiResponse {
    id: String,
    name: String,
    result: Option<serde_json::Value>,
    error: Option<String>,
}
```

### A2. store.rs — Plugin Data Persistence

New SQLite file `plugins/plugin_store.db` (separate from `sql_studio.db`).

Schema:
```sql
CREATE TABLE IF NOT EXISTS plugin_data (
    plugin_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (plugin_id, key)
);
CREATE TABLE IF NOT EXISTS plugin_settings (
    plugin_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);
```

Pattern: identical to existing `StorageService` — `Mutex<Connection>`, WAL mode, `AppError` for errors.

Methods: `new(data_dir)`, `get_data(plugin_id, key)`, `set_data(plugin_id, key, value)`, `is_enabled(plugin_id)`, `set_enabled(plugin_id, bool)`, `list_keys(plugin_id)`.

### A3. manager.rs — PluginManager

```rust
pub struct PluginManager {
    plugins: DashMap<String, PluginMetadata>,
    plugins_dir: PathBuf,
    store: Arc<PluginDataStore>,
}
```

Methods:
- `new(plugins_dir: PathBuf, store: Arc<PluginDataStore>)` — ensure dir exists
- `discover_plugins()` — scan subdirectories for `manifest.json`, parse, populate DashMap
- `get_plugin(id)`, `list_plugins()`, `get_manifest(id)`
- `enable_plugin(id)` / `disable_plugin(id)` — update DashMap + persist to store
- `resolve_asset_path(plugin_id, relative_path)` — canonicalize + verify within plugin dir (path traversal prevention)
- `is_loadable(manifest, app_version)` — semver check using `semver` crate

### A4. protocol.rs — Custom Protocol Handler

Register `plugin://` scheme via `register_uri_scheme_protocol` in `lib.rs`.

```rust
pub fn create_plugin_protocol() -> impl Fn(tauri::AppHandle, &tauri::webview::HttpRequest) -> tauri::webview::HttpResponse
```

Logic per request:
1. Parse URI: `plugin://{pluginId}/{relativePath}`
2. Resolve via `PluginManager::resolve_asset_path()` (path traversal check)
3. MIME type from extension (html/js/css/json/png/svg/wasm)
4. Return HttpResponse with body + Content-Type
5. HTML responses get CSP header: `default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src *; img-src 'self' data: blob:`
6. Disabled plugins → 403, missing files → 404

**Key**: Handler receives `AppHandle`, resolves `app.path().app_data_dir()?.join("plugins")` at request time via `app.state::<Arc<PluginManager>>()`.

### A5. api.rs — Plugin API Dispatcher

```rust
pub struct PluginApiDispatcher;

impl PluginApiDispatcher {
    pub async fn dispatch(
        request: PluginApiRequest,
        plugin_id: &str,
        connection_id: &str,
        conn_manager: &SqlConnectionManager,
        plugin_store: &PluginDataStore,
        app_version: &str,
    ) -> PluginApiResponse
}
```

Supported Rust-side APIs:

| API | Implementation |
|-----|---------------|
| `getSchemas` | `conn_manager.get_connection(id)` → `client.list_tables(None)` → extract unique schemas |
| `getTables` | `client.list_tables(schema)` → return `{name, schema}[]` |
| `getColumns` | `client.list_columns(table, schema)` → return column info |
| `runQuery` | `client.execute_query(sql, Some(1000))` → return result |
| `getData` | `plugin_store.get_data(plugin_id, key)` |
| `setData` | `plugin_store.set_data(plugin_id, key, value)` |
| `getAppInfo` | Return `{version, theme: "system"}` |
| `getConnectionInfo` | Return active connection metadata (no password) |
| `openExternal` | Use `tauri_plugin_shell::open()` via AppHandle |

Frontend-only APIs (handled by PluginMessageRouter, not dispatched here):
- `clipboardReadText`, `clipboardWriteText`
- `notyInfo/Success/Error/Warning`
- `confirm`
- `getViewContext`

### A6. commands.rs — Tauri Commands

```rust
#[tauri::command]
async fn plugin_list(manager: State<'_, Arc<PluginManager>>) -> Result<Vec<PluginMetadata>, AppError>

#[tauri::command]
async fn plugin_get_manifest(manager: State<'_, Arc<PluginManager>>, id: String) -> Result<PluginManifest, AppError>

#[tauri::command]
async fn plugin_enable(manager: State<'_, Arc<PluginManager>>, id: String) -> Result<(), AppError>

#[tauri::command]
async fn plugin_disable(manager: State<'_, Arc<PluginManager>>, id: String) -> Result<(), AppError>

#[tauri::command]
async fn plugin_api_call(
    manager: State<'_, Arc<PluginManager>>,
    conn_manager: State<'_, Arc<SqlConnectionManager>>,
    plugin_id: String,
    connection_id: String,
    request: PluginApiRequest,
) -> Result<PluginApiResponse, AppError>
```

### A7. Dependencies (Cargo.toml)

```toml
semver = "1"
```

No other new dependencies — rusqlite, serde, serde_json, dashmap, tauri already present.

---

## B. Frontend (Vue 3 TSX) — New Module

### New Directory: `src/modules/sql-studio/plugin/`

```
plugin/
├── types/
│   ├── index.ts          # Re-exports
│   ├── manifest.ts       # PluginManifest, PluginView, PluginMenuItem, PluginMetadata
│   └── api.ts            # PluginApiRequest, PluginApiResponse, PluginNotification
├── services/
│   ├── plugin-commands.ts          # 5 Tauri invoke wrappers
│   └── plugin-message-router.ts    # postMessage ↔ Tauri bridge
├── stores/
│   └── plugin-store.ts             # Pinia store
└── components/
    ├── PluginView.tsx              # iframe sandbox component
    └── PluginManagerModal.tsx      # Plugin management dialog
```

### B1. types/ — Type Definitions

Mirror Rust types exactly (with camelCase). `PluginApiRequest`, `PluginApiResponse` match the postMessage wire format.

### B2. services/plugin-commands.ts

5 invoke wrappers following `sql-commands.ts` pattern:
- `listPlugins()`, `getPluginManifest(id)`, `enablePlugin(id)`, `disablePlugin(id)`
- `pluginApiCall(pluginId, connectionId, request)` → `invoke('plugin_api_call', { pluginId, connectionId, request })`

### B3. services/plugin-message-router.ts — Critical Bridge

Singleton service class:

```typescript
class PluginMessageRouter {
    private iframes: Map<MessageEventSource, { pluginId: string; viewId: string; connectionId: string }>

    start()    // window.addEventListener('message', handler)
    stop()     // removeEventListener
    registerIframe(pluginId, viewId, connectionId, iframe)
    unregisterIframe(iframe)
    postToIframe(iframe, data: PluginApiResponse | PluginNotification)
    broadcast(pluginId, notification)  // send to all iframes of same plugin
}
```

**Message routing logic in `handleMessage(event)`:**

1. Look up `event.source` in iframe registry → get `{ pluginId, connectionId }`
2. If has `id` field → **Request**:
   - **Rust APIs** (getSchemas, getTables, getColumns, runQuery, getData, setData, getAppInfo, getConnectionInfo, openExternal):
     `await invoke('plugin_api_call', { pluginId, connectionId, request })` → post response back
   - **Frontend APIs** (clipboard, noty, confirm, getViewContext):
     handle locally → post response back
3. If no `id` field → **Notification**:
   - `windowEvent` → dispatch DOM event
   - `broadcast` → forward to other plugin iframes
   - `pluginError` → console.error

Frontend API implementations:
- `clipboardReadText/WriteText` → `navigator.clipboard.readText()/writeText()`
- `notyInfo/Success/Error/Warning` → `ElNotification({ type, message })`
- `confirm` → `ElMessageBox.confirm(message, title)`
- `getViewContext` → return from iframe registry context

### B4. stores/plugin-store.ts — Pinia Store

```typescript
export const usePluginStore = defineStore('sql-plugin', () => {
    const plugins = ref<PluginMetadata[]>([])
    const loading = ref(false)

    const enabledPlugins = computed(() => plugins.value.filter(p => p.enabled && p.loadable))

    async function refreshPlugins() { ... }  // call listPlugins()
    async function togglePlugin(id: string, enabled: boolean) { ... }

    return { plugins, loading, enabledPlugins, refreshPlugins, togglePlugin }
})
```

### B5. components/PluginView.tsx — iframe Sandbox

```tsx
const PluginView = defineComponent({
    name: 'PluginView',
    props: {
        pluginId: { type: String, required: true },
        viewId: { type: String, required: true },
        entryPath: { type: String, required: true },
        connectionId: { type: String, default: null },
    },
    setup(props) {
        const iframeRef = ref<HTMLIFrameElement | null>(null)
        const router = getPluginMessageRouter()  // singleton

        onMounted(() => {
            if (iframeRef.value) {
                router.registerIframe(props.pluginId, props.viewId, props.connectionId, iframeRef.value)
            }
        })
        onUnmounted(() => {
            if (iframeRef.value) router.unregisterIframe(iframeRef.value)
        })

        return () => (
            <iframe
                ref={iframeRef}
                src={`plugin://${props.pluginId}/${props.entryPath}`}
                sandbox="allow-scripts allow-same-origin allow-forms"
                style={{ width: '100%', height: '100%', border: 'none' }}
            />
        )
    },
})
```

### B6. components/PluginManagerModal.tsx — Management Dialog

Uses `usePluginStore()`, `el-dialog`, list of plugins with `el-switch` for enable/disable. Empty state when no plugins. Opens from sidebar button.

---

## C. Integration Changes

### C1. `src-tauri/src/modules/sql_studio/mod.rs`

Add `pub mod plugin;` and extend `setup_with_tunnel()`:

```rust
pub mod plugin;

// In setup_with_tunnel(), after existing init:
let plugin_store = Arc::new(PluginDataStore::new(data_dir.join("plugins"))?);
app.manage(plugin_store.clone());

let plugin_manager = Arc::new(PluginManager::new(data_dir.join("plugins"), plugin_store));
plugin_manager.discover_plugins()?;
app.manage(plugin_manager);
```

### C2. `src-tauri/src/lib.rs`

Register custom protocol (before `.invoke_handler`):
```rust
.register_uri_scheme_protocol("plugin", plugin::protocol::create_plugin_protocol())
```

Add 5 commands to `invoke_handler`:
```rust
modules::sql_studio::plugin::commands::plugin_list,
modules::sql_studio::plugin::commands::plugin_get_manifest,
modules::sql_studio::plugin::commands::plugin_enable,
modules::sql_studio::plugin::commands::plugin_disable,
modules::sql_studio::plugin::commands::plugin_api_call,
```

### C3. `src-tauri/tauri.conf.json` — CSP Update

```
"csp": "default-src 'self' plugin:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src plugin:;"
```

Adds `plugin:` scheme to `default-src` and `frame-src` so iframes can load from the custom protocol.

### C4. Frontend Integration — `src/modules/sql-studio/index.tsx`

In `SidebarPanel`, add a "Plugins" button in the header area that opens `PluginManagerModal`. The modal is a simple `el-dialog` wrapped in a `ref<boolean>` toggle.

---

## D. Implementation Order

| Step | Files | Description |
|------|-------|-------------|
| 1 | `plugin/models.rs` | Core types (manifest, metadata, API types) |
| 2 | `plugin/store.rs` | PluginDataStore (rusqlite key-value) |
| 3 | `plugin/manager.rs` + `plugin/mod.rs` | PluginManager (discovery, lifecycle) |
| 4 | `plugin/protocol.rs` | Custom protocol handler |
| 5 | `plugin/api.rs` | API dispatcher (database + data APIs) |
| 6 | `plugin/commands.rs` | 5 Tauri commands |
| 7 | `mod.rs`, `lib.rs`, `Cargo.toml`, `tauri.conf.json` | Backend integration |
| 8 | Frontend `types/`, `plugin-commands.ts` | Type definitions + invoke wrappers |
| 9 | `plugin-message-router.ts` | postMessage bridge (critical) |
| 10 | `plugin-store.ts` | Pinia store |
| 11 | `PluginView.tsx` | iframe sandbox component |
| 12 | `PluginManagerModal.tsx` | Management UI |
| 13 | `index.tsx` integration | Sidebar button + modal |
| 14 | Compile + verify | cargo check + frontend build |

---

## E. Verification

1. **Rust compilation**: `cd ran-rs-desktop/src-tauri && cargo check` — 0 errors
2. **Frontend build**: `cd ran-rs-desktop && npm run build` — 0 errors
3. **Manual E2E test**: Create `{app_data_dir}/plugins/test-plugin/` with:
   - `manifest.json` containing a single view with `entry: "index.html"`
   - `index.html` that sends `getAppInfo` via postMessage and displays the result
   - Verify plugin appears in PluginManagerModal, can be enabled/disabled
   - Verify iframe loads via `plugin://test-plugin/index.html`
   - Verify postMessage round-trip works (getAppInfo → response)

---

## F. Files Modified (Summary)

**New files (Rust):**
- `src-tauri/src/modules/sql_studio/plugin/mod.rs`
- `src-tauri/src/modules/sql_studio/plugin/models.rs`
- `src-tauri/src/modules/sql_studio/plugin/store.rs`
- `src-tauri/src/modules/sql_studio/plugin/manager.rs`
- `src-tauri/src/modules/sql_studio/plugin/protocol.rs`
- `src-tauri/src/modules/sql_studio/plugin/api.rs`
- `src-tauri/src/modules/sql_studio/plugin/commands.rs`

**New files (Frontend):**
- `src/modules/sql-studio/plugin/types/index.ts`
- `src/modules/sql-studio/plugin/types/manifest.ts`
- `src/modules/sql-studio/plugin/types/api.ts`
- `src/modules/sql-studio/plugin/services/plugin-commands.ts`
- `src/modules/sql-studio/plugin/services/plugin-message-router.ts`
- `src/modules/sql-studio/plugin/stores/plugin-store.ts`
- `src/modules/sql-studio/plugin/components/PluginView.tsx`
- `src/modules/sql-studio/plugin/components/PluginManagerModal.tsx`

**Modified files:**
- `src-tauri/Cargo.toml` — add `semver = "1"`
- `src-tauri/tauri.conf.json` — update CSP
- `src-tauri/src/modules/sql_studio/mod.rs` — add `pub mod plugin` + init in setup
- `src-tauri/src/lib.rs` — register protocol + 5 commands
- `src/modules/sql-studio/index.tsx` — add plugin button + modal in sidebar
