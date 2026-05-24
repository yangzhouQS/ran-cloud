# SQL 查询编辑器与结果区域布局调整方案

## Context

当前 SQL Studio 采用三栏水平 Splitview 布局：左栏(sidebar) | 中栏(editor) | 右栏(result)。这种布局导致编辑器和结果表格水平挤占空间，不符合 SQL 工具的常见使用习惯。

需要改为：左侧 sidebar 保持不变，右侧区域改为上下分割——上方是 SQL 编辑器，下方是带 tab 页签的结果区域（Output / Result），上下区域支持拖拽调整大小。

## 当前布局 → 目标布局

```
当前：                         目标：
┌──────┬───────┬───────┐     ┌──────┬───────────────┐
│      │       │       │     │      │  QueryEditor  │
│ Side │ Editor│ Result│     │ Side │               │
│ bar  │       │       │     │ bar  ├───────────────┤
│      │       │       │     │      │ [Output|Result]│
└──────┴───────┴───────┘     └──────┴───────────────┘
```

## 需要修改/新增的文件

| 文件 | 变更类型 |
|------|---------|
| `src/modules/sql-studio/index.tsx` | 重构：嵌套 Splitview 布局 |
| `src/modules/sql-studio/components/ResultTable.tsx` | 微调：移除错误展示（移至 Output tab） |
| `src/modules/sql-studio/stores/sql-store.ts` | 微调：添加 `lastExecutedSql` 状态 |
| `src/modules/sql-studio/index.less` | 修改：更新布局样式和新增 tab 样式 |
| `src/modules/sql-studio/components/OutputPanel.tsx` | **新增**：Output tab 组件 |

## 实现步骤

### 步骤 1：Store 添加 lastExecutedSql

**文件**: `src/modules/sql-studio/stores/sql-store.ts`

添加一个新的 ref 记录最近执行的 SQL 语句：

```typescript
/** 最近执行的 SQL */
const lastExecutedSql = ref<string | null>(null);
```

在 `executeQuery` 函数开头记录：
```typescript
async function executeQuery(sql: string, database?: string) {
  if (!sql.trim() || !activeConnectionId.value) return;
  lastExecutedSql.value = sql.trim();
  // ... 后续逻辑不变
}
```

在 return 中导出 `lastExecutedSql`。

### 步骤 2：新增 OutputPanel 组件

**文件**: `src/modules/sql-studio/components/OutputPanel.tsx`（新建）

Output tab 显示查询执行的元信息，类似控制台/日志面板：

**Props**:
- `executedSql: string | null` — 已执行的 SQL
- `executionTimeMs: number | null` — 执行耗时
- `error: string | null` — 错误信息
- `success: boolean` — 是否成功
- `loading: boolean` — 是否执行中

**渲染内容**:
1. **执行中状态**: 显示 "查询执行中..." 加载提示
2. **无执行记录**: 显示空状态提示
3. **有执行记录时**，按顺序展示：
   - 执行状态标签: `<el-tag type="success">成功</el-tag>` 或 `<el-tag type="danger">失败</el-tag>`
   - 执行时间: `耗时: {n} ms`
   - 已执行 SQL: 在代码块中回显 SQL（支持折叠长 SQL）
   - 错误信息（如果失败）: `<el-alert type="error">`

### 步骤 3：重构主布局

**文件**: `src/modules/sql-studio/index.tsx`

**当前结构**（水平三分栏）:
```tsx
<SplitviewVue orientation={Orientation.HORIZONTAL}>
  panels: SidebarPanel, EditorPanel, ResultPanel
</SplitviewVue>
```

**目标结构**（水平二分栏 + 嵌套垂直分割）:
```tsx
<SplitviewVue orientation={Orientation.HORIZONTAL}>
  panels:
    1. SidebarPanel (200-400px, default 260px)  // 不变
    2. MainPanel (min 400px)                    // 新增：包含嵌套分割
       → 内部渲染 <SplitviewVue orientation={Orientation.VERTICAL}>
           panels:
             a. EditorPanel (min 150px, default 400px)
             b. BottomPanel (min 150px, default 250px)
                → 内部渲染 el-tabs
                   - "Output" tab → OutputPanel 组件
                   - "Result" tab → ResultTable 组件
</SplitviewVue>
```

具体改动：

1. **删除 `ResultPanel`**，改为 `MainPanel` 和 `BottomPanel`

2. **`MainPanel`** — 新组件，包含嵌套的垂直 Splitview：
```tsx
const MainPanel = defineComponent({
  name: "SqlMainPanel",
  setup() {
    const onReady = (event: SplitviewReadyEvent) => {
      event.api.addPanel({ id: "editor", component: "EditorPanel", minimumSize: 150, size: 400 });
      event.api.addPanel({ id: "bottom", component: "BottomPanel", minimumSize: 150, size: 250 });
    };
    return () => (
      <SplitviewVue
        components={{ EditorPanel, BottomPanel }}
        orientation={Orientation.VERTICAL}
        onReady={onReady}
      />
    );
  },
});
```

3. **`BottomPanel`** — 新组件，包含 el-tabs：
```tsx
const BottomPanel = defineComponent({
  name: "SqlBottomPanel",
  setup() {
    const store = useSqlStore();
    const activeTab = ref("output");

    // 查询成功后自动切换到 Result tab
    watch(() => store.currentResult, (result) => {
      if (result) activeTab.value = "result";
    });
    // 查询失败后自动切换到 Output tab
    watch(() => store.queryError, (error) => {
      if (error) activeTab.value = "output";
    });

    return () => (
      <div class="ran-sql-studio__bottom">
        <el-tabs v-model={activeTab.value} class="ran-sql-bottom-tabs">
          <el-tab-pane label="Output" name="output">
            <OutputPanel
              executedSql={store.lastExecutedSql}
              executionTimeMs={store.currentResult?.executionTimeMs ?? null}
              error={store.queryError}
              success={!store.queryError && !!store.currentResult}
              loading={store.executing}
            />
          </el-tab-pane>
          <el-tab-pane label="Result" name="result">
            <ResultTable
              result={store.currentResult}
              error={store.queryError}
              loading={store.executing}
            />
          </el-tab-pane>
        </el-tabs>
      </div>
    );
  },
});
```

4. **外层 `onReady`** — 从 3 个面板改为 2 个：
```tsx
const onReady = (event: SplitviewReadyEvent) => {
  event.api.addPanel({ id: "sidebar", component: "SidebarPanel", minimumSize: 200, maximumSize: 400, size: 260 });
  event.api.addPanel({ id: "main", component: "MainPanel", minimumSize: 400 });
};
```

5. **组件注册** — 更新外层 components map：
```tsx
components={{ SidebarPanel, MainPanel }}
```

### 步骤 4：微调 ResultTable

**文件**: `src/modules/sql-studio/components/ResultTable.tsx`

ResultTable 当前已包含错误提示（`el-alert`）和加载状态。在 tab 模式下，这些状态会与 Output tab 内容重叠。做以下调整：

1. **保留**：信息栏（行数、执行时间、导出按钮）、加载状态、空结果提示
2. **保留**：错误时的 `el-empty` 状态
3. **移除**：错误 `el-alert`（已移至 OutputPanel 展示，避免重复）

即删除 ResultTable 中的这段：
```tsx
{props.error && !props.loading && (
  <el-alert title="查询执行失败" description={props.error} ... />
)}
```

### 步骤 5：样式更新

**文件**: `src/modules/sql-studio/index.less`

1. **更新 `&__sidebar`** — 保持不变
2. **删除** `&__editor` 和 `&__result` 的独立样式（不再作为外层面板）
3. **新增 `&__bottom`** — 底部面板容器：
```less
.ran-sql-studio__bottom {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

4. **新增底部 tab 样式** — 控制 el-tabs 在底部面板中的表现：
```less
.ran-sql-bottom-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;

  .el-tabs__content {
    flex: 1;
    overflow: auto;
  }
  .el-tabs__header {
    margin-bottom: 0;
    padding: 0 8px;
  }
}
```

5. **OutputPanel 样式** — 在 index.less 中添加 `.ran-sql-output` block：
```less
.ran-sql-output {
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;

  &__status { ... }
  &__sql {
    background: #f5f7fa;
    border-radius: 4px;
    padding: 8px 12px;
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 120px;
    overflow-y: auto;
  }
  &__time { ... }
}
```

6. **更新 dark theme** — 为新增样式添加暗色规则

## 边界情况处理

- **首次加载无结果**：Output tab 显示 "执行查询以查看输出"，Result tab 显示现有空状态
- **执行中**：Output tab 显示加载提示，Result tab 保持之前结果
- **查询成功**：自动切换到 Result tab
- **查询失败**：自动切换到 Output tab 显示错误
- **长 SQL 显示**：OutputPanel 中的 SQL 代码块设置 max-height，超出滚动

## 验证方式

1. **编译检查**：`cd ran-rs-desktop && pnpm run typecheck`
2. **功能测试**：
   - 页面加载后应显示左 sidebar + 右侧上下分割布局
   - 编辑器和底部结果区域之间应有可拖拽分隔条
   - 底部区域应显示 Output / Result 两个 tab
   - 执行 SQL 后应自动切换到 Result tab 显示结果
   - 执行失败的 SQL 应自动切换到 Output tab 显示错误
   - Output tab 应显示执行状态、时间、SQL 回显
   - sidebar 宽度仍可拖拽调整
