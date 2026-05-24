# 数据库树层级展示功能实现方案

## Context

当前 SQL Studio 的 DatabaseTree 组件在用户建立数据库连接后，直接以扁平列表展示当前连接的表，没有数据库/schema 层级。用户需要看到完整的 **数据库 → 表 → 列** 三层树形结构，以便浏览和切换不同数据库/schema。

后端已具备所有必要能力：`sql_database_list` 命令（含三个驱动的 `list_databases()` 实现）已存在并注册，前端只需要调用并重构树组件。

## 需要修改的文件

| 文件 | 变更类型 |
|------|---------|
| `src-tauri/src/modules/sql_studio/drivers/mysql.rs` | 修改：让 `list_tables`/`list_columns` 支持可选 schema 参数 |
| `src/modules/sql-studio/services/sql-commands.ts` | 新增：`DatabaseInfo` 接口和 `getDatabaseList()` 函数 |
| `src/modules/sql-studio/components/DatabaseTree.tsx` | 重构：三层树加载逻辑 |
| `src/modules/sql-studio/index.tsx` | 微调：传递 `dbType` prop |
| `src/modules/sql-studio/index.less` | 微调：数据库节点样式 |

## 实现步骤

### 步骤 1：后端 — MySQL 驱动支持跨数据库查询

**文件**: `src-tauri/src/modules/sql_studio/drivers/mysql.rs`

MySQL 的 `list_tables` 和 `list_columns` 当前使用 `TABLE_SCHEMA = DATABASE()` 硬编码，忽略了 `_schema` 参数。需要修改为：当 `_schema` 参数存在时使用该值过滤。

**`list_tables` 修改**（第 120 行附近）：
```rust
// 当前：
// let sql = "... WHERE TABLE_SCHEMA = DATABASE() ...";
// 修改为：
let sql = match _schema {
    Some(s) => format!(
        "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.tables WHERE TABLE_SCHEMA = '{}' ORDER BY TABLE_NAME",
        s.replace('\'', "''")
    ),
    None => "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME".to_string(),
};
```

**`list_columns` 修改**（第 141 行附近）：
```rust
// 同理，当 _schema 存在时使用它替代 DATABASE()
let schema_filter = match _schema {
    Some(s) => format!("TABLE_SCHEMA = '{}'", s.replace('\'', "''")),
    None => "TABLE_SCHEMA = DATABASE()".to_string(),
};
let sql = format!(
    "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY \
     FROM information_schema.columns \
     WHERE {} AND TABLE_NAME = '{}' \
     ORDER BY ORDINAL_POSITION",
    schema_filter,
    table.replace('\'', "''")
);
```

### 步骤 2：前端服务层 — 添加数据库列表 API

**文件**: `src/modules/sql-studio/services/sql-commands.ts`

在 `// ==================== 数据库对象树命令 ====================` 注释下方添加：

```typescript
/** 数据库/Schema 信息 */
export interface DatabaseInfo {
  name: string;
  kind: string; // "database" | "schema" | "main"
}

/** 获取数据库/Schema 列表 */
export async function getDatabaseList(connectionId: string): Promise<DatabaseInfo[]> {
  return invoke<DatabaseInfo[]>("sql_database_list", { connectionId });
}
```

### 步骤 3：重构 DatabaseTree 组件

**文件**: `src/modules/sql-studio/components/DatabaseTree.tsx`

#### 3.1 更新 TreeNode 接口

```typescript
interface TreeNode {
  id: string;
  label: string;
  type: "database" | "schema" | "table" | "view" | "column";
  isLeaf: boolean;
  schema?: string;  // 数据库/schema 上下文，传递给子查询
  children?: TreeNode[];
}
```

#### 3.2 添加 dbType prop

```typescript
props: {
  connectionId: { type: String as PropType<string | null>, default: null },
  dbType: { type: String as PropType<string | null>, default: null },
  onSelectTable: { type: Function as PropType<(tableName: string) => void>, default: () => {} },
},
```

#### 3.3 重写 loadTree 为两阶段加载

```
connectionId 变化时：
├── 调用 getDatabaseList(connectionId)
├── 判断返回结果：
│   ├── SQLite（只有一个 kind="main" 的结果）
│   │   ├── 跳过数据库层级
│   │   └── 直接调用 getDatabaseTree(connectionId) → 顶层显示表节点
│   └── MySQL/PostgreSQL
│       └── 顶层显示 database/schema 节点（isLeaf: false）
```

#### 3.4 统一懒加载 load 回调

替换现有 `loadColumnNode`，根据节点 type 分发：

```
节点展开时（load 回调）：
├── type === "database" 或 "schema"
│   ├── 调用 getDatabaseTree(connectionId, node.data.schema)
│   └── resolve 表节点（继承 parent 的 schema）
├── type === "table" 或 "view"
│   ├── 调用 getTableColumns(connectionId, node.data.label, node.data.schema)
│   └── resolve 列节点（isLeaf: true）
```

#### 3.5 更新图标

```
"database" → "🗄"
"schema"   → "🗂"
"table"    → "📂"  (现有)
"view"     → "👁"  (现有)
"column"   → "📝"  (现有)
```

### 步骤 4：父组件传递 dbType

**文件**: `src/modules/sql-studio/index.tsx`

在 SidebarPanel 中更新 DatabaseTree 调用：

```tsx
<DatabaseTree
  connectionId={store.activeConnectionId}
  dbType={store.activeConnection?.dbType ?? null}
  onSelectTable={() => {}}
/>
```

### 步骤 5：样式更新

**文件**: `src/modules/sql-studio/index.less`

在 `.ran-sql-database-tree` block 中添加数据库/schema 节点的视觉区分样式（稍加粗字体或不同颜色），以及对应的 dark theme 规则。

## 边界情况处理

- **SQLite 特殊处理**：只有一个 "main" 库时，跳过数据库层级，表直接作为顶层节点
- **空数据库**：展开后返回空数组，el-tree 显示空节点
- **连接断开**：API 调用失败时 catch 并 resolve([])，与现有模式一致
- **搜索过滤**：现有 filterNode 逻辑按 label 过滤，对 database/schema 节点同样有效

## 验证方式

1. **编译检查**：`cd ran-rs-desktop && pnpm run typecheck` 确保无 TypeScript 错误
2. **Rust 编译**：`cd ran-rs-desktop/src-tauri && cargo check` 确保后端改动无编译错误
3. **功能测试**：
   - 创建 MySQL 连接 → 展开后应显示数据库列表 → 展开数据库应显示表
   - 创建 PostgreSQL 连接 → 展开后应显示 schema 列表 → 展开 schema 应显示表
   - 创建 SQLite 连接 → 应直接显示表列表（无数据库层级）
   - 搜索过滤功能应正常工作
   - 切换连接后树应自动重新加载
