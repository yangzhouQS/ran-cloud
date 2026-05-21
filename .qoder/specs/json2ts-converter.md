# JSON → TypeScript 转换工具实现方案

## Context

在 `develop-tools` 目录下新增 JSON2TS 模块，提供离线可用的 JSON 转 TypeScript 类型定义功能。搭配 Monaco Editor 展示转换结果，支持嵌套解析、联合类型推断、结构去重等完整能力。

## 导航集成

**不新建一级菜单**，将 JSON2TS 作为 k8s 下的二级分类项：
- `src/components/category-panel.tsx` — `k8sCategories` 新增 `{ key: "json2ts", label: "JSON → TypeScript", ... }`
- `src/App.tsx` — `renderMainContent()` 的 `case "k8s"` 内根据 `activeCategory` 分发到 `TelepresencePanel` 或 `Json2TsPanel`

## 目录结构

```
src/modules/develop-tools/json2ts/
├── index.ts                          # 导出入口
├── types/
│   └── index.ts                      # 类型定义
├── services/
│   ├── json-to-ts.ts                 # 核心转换引擎（纯函数）
│   └── type-merger.ts                # 结构哈希与去重
├── components/
│   ├── json2ts-panel.tsx             # 主面板（编排组件）
│   ├── json2ts-panel.less            # 样式
│   ├── json-input.tsx                # 左侧 JSON 输入区
│   ├── ts-output.tsx                 # 右侧 TS 输出（Monaco）
│   ├── toolbar.tsx                   # 工具栏
│   ├── options-form.tsx              # 选项表单
│   └── monaco-editor.tsx             # Monaco 通用封装
```

## 实现步骤

### Step 1: 安装 Monaco Editor 依赖
- `pnpm add monaco-editor monaco-editor-vue3`
- 修改 `rsbuild.config.ts` 配置 worker 支持

### Step 2: 类型定义 — `types/index.ts`
- `ConversionOptions`: rootTypeName, exportStyle(interface|type), treatNullAsOptional, indentSize
- `TypeNode`: 区分联合类型 — PrimitiveType | ObjectType | ArrayType | UnionType
- `FieldDef`: typeNode + optional + nullable
- `ConversionResult`: output + types + errors

### Step 3: 核心转换引擎 — `services/json-to-ts.ts` + `services/type-merger.ts`
纯函数管道：JSON string → parse → 递归推断 → 结构去重 → 格式化 → TypeScript string

- **递归推断** `inferType(value, fieldName, options)`:
  - 基本类型: string/number/boolean/null 直接映射
  - 对象: 递归每个 key，生成 ObjectNode，子对象按 `ParentChild` 命名
  - 数组: 推断元素类型；同类 → `T[]`；异类 → 联合类型数组
  - null: 标记 nullable，可选标记 optional
- **结构去重** `type-merger.ts`:
  - 对每个 ObjectType 计算 key:type 排序哈希
  - 相同哈希合并为一个类型定义，其他引用改为别名
- **格式化**: 按选项输出 `interface` 或 `type`，统一缩进

### Step 4: Monaco Editor 封装 — `components/monaco-editor.tsx`
- Props: value, language, readOnly, theme, height
- Emits: update:modelValue
- setup 中配置 `self.MonacoEnvironment` 使用 `?worker` 导入
- 默认配置: minimap 关闭, 自动换行, 暗色主题

### Step 5: 子组件
- **`json-input.tsx`**: Monaco JSON 模式编辑器 + 错误提示
- **`ts-output.tsx`**: Monaco TypeScript 只读模式 + 空状态提示
- **`toolbar.tsx`**: 转换/复制/清空/重置 按钮
- **`options-form.tsx`**: 根名称、导出风格、null处理、缩进

### Step 6: 主面板 — `components/json2ts-panel.tsx`
- 双栏布局：左 JSON 输入 | 右 TS 输出
- 使用 content-page / content-section 布局类
- 状态: jsonInput, tsOutput, errors, options
- 方法: handleConvert, handleCopy, handleClear, handleReset

### Step 7: 样式 — `components/json2ts-panel.less`
- BEM block: `ran-json2ts`
- `__split`: flex 双栏容器
- `__input` / `__output`: 各占 50%

### Step 8: 导航注册
- `category-panel.tsx`: k8sCategories 新增 json2ts 分类项
- `App.tsx`: activeCategory 为 "json2ts" 时渲染 Json2TsPanel

## 关键修改文件

| 文件 | 操作 |
|------|------|
| `src/modules/develop-tools/json2ts/**` | 新建全部文件 |
| `src/components/category-panel.tsx` | k8sCategories 新增 json2ts |
| `src/App.tsx` | renderMainContent k8s 分支内按 activeCategory 分发 |
| `rsbuild.config.ts` | Monaco worker 配置 |

## 验证方式

1. `pnpm run build` 构建通过
2. 点击 Sidebar "K8s 连接" → Category 中出现 "JSON → TypeScript" 选项
3. 输入嵌套 JSON → 点击转换 → 右侧 Monaco 显示带语法高亮的 TS 类型
4. 验证：可选字段推断、联合类型、相同结构去重
5. 复制、清空、重置按钮正常工作
6. 离线环境可用（Tauri 桌面模式）
