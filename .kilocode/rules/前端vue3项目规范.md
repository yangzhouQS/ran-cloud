# 前端vue3项目规范.md

vue3 使用tsx语法开发组件，组件名称和存放组件的目录命名要求。
开发对象取名一般以英文语义为主，尽量使用比较明确的字面意思描述开发对象，开发对象的命名规则根据具体的对象而定，具体要求如下：

### 常用的命名规范
#### 蛇形命名法 (snake_case)
变量名使用下划线分割小写字母的方式命名,简称`ass_bss`

示例：

```plain
material_categories
```



#### 帕斯卡命名法（PascalCase）
变量名称之间使用首字母大写的命名方式,简称`AssBss`

示例：

```plain
MaterialCategories
```



#### 驼峰命名法（camelCase）
变量名称之间使用首字母大写的命名方式,第一个字母首字母为小写,简称`assBss`

示例：

```plain
materialCategories
```



#### 中划线链接命名法（kebab-case）
变量名使用中划线分割小写字母的方式命名,简称`ass-bss`

示例：

```plain
material-categories
```



### 前端组件库
前端组件库命名规则如下：

**vue-[aa-bb]-library**

```plain
vue-protal-framework-library
vue-protal-app-framework-library
```

> 上传至私有仓库：`@cs/vue-[aa-bb]-library`
>



## 文件和目录命名
### 文件
文件的命名均采用中划线链接命名法，需明确表明 tsx/jsx/vue后缀

示例：

```plain
user.tsx
```



注意，再编写nestjs类的服务时，请使用约定规范命名方式, [aaa-bbbb].[功能类型].ts。

示例:

```plain
test-demo.controller.ts  # 控制器文件命名
test-demo.service.ts     # 服务文件命名
test-demo.interface.ts   # 接口文件命名
test-demo.middleware.ts  # 中间件文件命名
test-demo.constants.ts   # 常量文件命名
test-demo.module.ts      # 模块文件命名
test-demo.decorators.ts  # 装饰器文件命名
```

### 目录
目录的命名均采用中划线链接命名法

示例：

```plain
 web-content
 home-page
```



## 变量和函数命名
开发对象取名一般以英文语义为主，尽量使用比较明确的字面意思描述开发对象，开发对象的命名规则根据具体的对象而定，具体要求如下：



### 常用的命名规范
文件的命名均采用中划线链接命名法

示例：

```plain
 plugin-config.js
 home-page.html
 global-style.pcss
 logo-64*64.png
```



### 类
类的命名均采用帕斯卡命名法（PascalCase）

示例：

```javascript
export class DrawComponent {
    constructor(params) {
    }
}
```



### 函数
类的命名均采用驼峰命名法（camelCase）

示例：

```javascript
export function drawTable {
}
```



> 有时候会根据使用环境区分内部函数还是外部函数，如果是内部函数在函数名前加`_`
>



示例：

```javascript

export class DrawComponent {
    constructor(params) {
    }

    drawTable() {
        // ...
    }
    _everyPageShow() {
        // ...
    }
}
```



### 变量
变量的命名均采用驼峰命名法（camelCase）

> 这里所说的变量范围主要指`js\ts\vue`语法的命名
>

示例：

```javascript
const listData = []
let lastUpdater = 'mlc'
```



**注意**

有时候会定义一些全局变量或高频使用的变量，这些变量名允许加`$`起到强调的作用

示例：

```javascript
const $http = // ...
const $primaryColor = // ...
```





### css类名
样式类采用中划线命名方式

示例：

```css
.page-main{
  height:100%;
  width:100%;
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.yl-message-text{
  padding:10px;
}
```



### 路由路径
路由类采用中划线命名方式

示例：

```css
/c-supplier
```





