### CSS BEM 规范工具函数（useNamespace）使用文档

#### 一、BEM 规范简介
BEM（Block-Element-Modifier）是一种 CSS 命名规范，通过清晰的类名结构实现样式隔离与维护性提升：
- **Block（块）**：独立功能模块（如 `button`、`card`）
- **Element（元素）**：块内的组成部分（如 `button__icon`）
- **Modifier（修饰符）**：块或元素的状态/变体（如 `button--primary`）

本工具基于 BEM 规范实现，默认命名空间为 `cs`，自动生成带命名空间的类名（如 `cs-button`），避免样式冲突。


#### 二、工具函数说明
`useNamespace(block: string)` 接收一个块名称，返回一系列生成 BEM 类名和 CSS 变量的方法，核心方法如下：

| 方法 | 说明 | 生成格式 | 示例 |
|------|------|----------|------|
| `b(blockSuffix?)` | 生成块级类名（可加后缀） | `{namespace}-{block}[-{blockSuffix}]` | `b()` → `cs-button`；`b('group')` → `cs-button-group` |
| `e(element)` | 生成元素类名 | `{namespace}-{block}__{element}` | `e('icon')` → `cs-button__icon` |
| `m(modifier)` | 生成修饰符类名 | `{namespace}-{block}--{modifier}` | `m('primary')` → `cs-button--primary` |
| `be(blockSuffix, element)` | 块后缀 + 元素 | `{namespace}-{block}-{blockSuffix}__{element}` | `be('group', 'item')` → `cs-button-group__item` |
| `em(element, modifier)` | 元素 + 修饰符 | `{namespace}-{block}__{element}--{modifier}` | `em('text', 'bold')` → `cs-button__text--bold` |
| `bm(blockSuffix, modifier)` | 块后缀 + 修饰符 | `{namespace}-{block}-{blockSuffix}--{modifier}` | `bm('group', 'vertical')` → `cs-button-group--vertical` |
| `bem(blockSuffix, element, modifier)` | 块后缀 + 元素 + 修饰符 | `{namespace}-{block}-{blockSuffix}__{element}--{modifier}` | `bem('group', 'item', 'active')` → `cs-button-group__item--active` |
| `is(name, state?)` | 生成状态类名（默认 `is-` 前缀） | `is-{name}`（状态为 true 时生效） | `is('disabled')` → `is-disabled`；`is('loading', false)` → 空字符串 |


#### 三、CSS 变量方法
提供生成命名空间前缀的 CSS 变量方法，便于样式与组件逻辑关联：

| 方法 | 说明 | 生成格式 | 示例 |
|------|------|----------|------|
| `cssVar(object)` | 生成全局 CSS 变量 | `--{namespace}-{key}: {value}` | `cssVar({ size: '16px' })` → `{ '--cs-size': '16px' }` |
| `cssVarBlock(object)` | 生成块级 CSS 变量 | `--{namespace}-{block}-{key}: {value}` | `cssVarBlock({ radius: '4px' })` → `{ '--cs-button-radius': '4px' }` |
| `cssVarName(name)` | 生成全局 CSS 变量名 | `--{namespace}-{name}` | `cssVarName('color')` → `--cs-color` |
| `cssVarBlockName(name)` | 生成块级 CSS 变量名 | `--{namespace}-{block}-{name}` | `cssVarBlockName('hover-color')` → `--cs-button-hover-color` |


#### 四、使用示例

##### 1. 基础用法（按钮组件）
```vue
<template>
  <button 
    :class="[
      ns.b(),         // 基础块类名：cs-button
      ns.m(type),     // 修饰符类名：cs-button--primary
      ns.is('disabled', disabled)  // 状态类名：is-disabled（当 disabled 为 true 时）
    ]"
    :style="ns.cssVarBlock({ size: `${size}px` })"  // 块级 CSS 变量
  >
    <span v-if="icon" :class="ns.e('icon')">📌</span>  // 元素类名：cs-button__icon
    <span :class="ns.e('text')"><slot /></span>        // 元素类名：cs-button__text
  </button>
</template>

<script setup lang="ts">
import { useNamespace } from '@/hooks/use-namespace';

// 初始化命名空间（block 为 'button'）
const ns = useNamespace('button');

// 组件属性
const props = defineProps<{
  type?: 'primary' | 'success' | 'default';
  size?: number;
  disabled?: boolean;
  icon?: boolean;
}>();
</script>

<style lang="less" scoped>
// 基础样式
.@{ns.b()} {
  padding: 8px 16px;
  border: none;
  border-radius: var(--cs-button-radius, 4px);  // 使用块级 CSS 变量
  color: #fff;

  // 修饰符样式（主按钮）
  &.@{ns.m('primary')} {
    background: #165DFF;
  }

  // 修饰符样式（成功按钮）
  &.@{ns.m('success')} {
    background: #00B42A;
  }

  // 状态样式（禁用）
  &.@{ns.is('disabled')} {
    opacity: 0.6;
    cursor: not-allowed;
  }

  // 元素样式（图标）
  .@{ns.e('icon')} {
    margin-right: 4px;
  }

  // 元素样式（文本）
  .@{ns.e('text')} {
    font-size: var(--cs-button-size, 14px);  // 使用动态 CSS 变量
  }
}
</style>
```

##### 2. 复杂组合示例（按钮组组件）
```vue
<template>
  <div :class="ns.b()">  <!-- cs-button-group -->
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useNamespace } from '@/hooks/use-namespace';
const ns = useNamespace('button-group');  // block 为 'button-group'
</script>

<style lang="less" scoped>
.@{ns.b()} {
  display: inline-flex;
  border: 1px solid #e5e7eb;

  // 子元素为按钮组件的样式
  > .@{ns.e('item')} {  // cs-button-group__item
    border-right: 1px solid #e5e7eb;

    &:last-child {
      border-right: none;
    }
  }

  // 垂直方向修饰符
  &.@{ns.m('vertical')} {  // cs-button-group--vertical
    flex-direction: column;

    > .@{ns.e('item')} {
      border-right: none;
      border-bottom: 1px solid #e5e7eb;

      &:last-child {
        border-bottom: none;
      }
    }
  }
}
</style>
```

##### 3. 状态类动态控制
```vue
<template>
  <div 
    :class="[
      ns.b(),
      ns.is('active', isActive),  // 当 isActive 为 true 时添加 is-active
      ns.is('highlight')  // 始终添加 is-highlight
    ]"
  >
    动态状态示例
  </div>
</template>

<script setup lang="ts">
import { useNamespace, ref } from '@/hooks/use-namespace';
const ns = useNamespace('card');
const isActive = ref(false);  // 可通过逻辑动态修改
</script>
```


#### 五、最佳实践
1. **命名空间隔离**：默认命名空间 `cs` 可通过修改 `defaultNamespace` 变量自定义（如团队前缀），避免多组件库冲突。
2. **类名组合原则**：优先使用 `b()` + `m()` 定义基础样式，通过 `e()` 拆分内部元素，避免嵌套过深。
3. **CSS 变量配合**：动态样式（如尺寸、颜色）优先使用 `cssVarBlock()` 定义，便于通过组件 props 动态修改。
4. **状态管理**：组件状态（如 `disabled`、`active`）统一使用 `is()` 方法生成类名，保持状态样式一致性。

通过本工具，可在项目中统一 BEM 规范实现，提升样式可维护性与团队协作效率。
