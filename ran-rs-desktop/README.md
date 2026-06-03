# Ran RS Desktop

基于 **Tauri v2** + **Rsbuild v2** + **Vue 3** + **TypeScript** + **TSX** 构建的跨平台桌面应用。

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Tauri | v2 | 跨平台桌面应用框架 |
| Rsbuild | v2 | 基于 Rspack 的高性能构建工具 |
| Vue 3 | v3.5 | 渐进式前端框架 |
| TypeScript | v5.8 | 类型安全的 JavaScript 超集 |
| TSX | - | Vue 3 JSX/TSX 语法支持 |

## 前置要求

- [Node.js](https://nodejs.org/) >= 20.19
- [Rust](https://www.rust-lang.org/tools/install) (最新稳定版)
- [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)

## 快速开始

### 安装依赖

```bash
# 安装前端依赖
npm install

# 生成 Tauri 图标（可选，需要准备 1024x1024 的源图标）
# npm run tauri icon path/to/icon.png
```

### 开发模式

```bash
# 仅启动前端开发服务器
npm run dev

# 启动 Tauri 开发模式（前端 + Rust 后端）
npm run tauri:dev
```

### 构建发布

```bash
# 构建生产版本
npm run tauri:build
```

## 项目结构

```
ran-rs-desktop/
├── src/                          # 前端源码
│   ├── assets/                   # 静态资源
│   │   └── styles/
│   │       └── index.css         # 全局样式
│   ├── services/                 # 服务层
│   │   └── tauri.ts              # Tauri IPC 调用封装
│   ├── App.tsx                   # 根组件 (TSX)
│   ├── main.ts                   # 应用入口
│   └── env.d.ts                  # 类型声明
├── src-tauri/                    # Tauri 后端 (Rust)
│   ├── capabilities/
│   │   └── default.json          # 权限配置
│   ├── icons/                    # 应用图标
│   ├── src/
│   │   ├── lib.rs                # Tauri 库入口
│   │   └── main.rs               # Rust 主入口
│   ├── build.rs                  # Tauri 构建脚本
│   ├── Cargo.toml                # Rust 依赖配置
│   └── tauri.conf.json           # Tauri 配置文件
├── index.html                    # HTML 模板
├── rsbuild.config.ts             # Rsbuild 配置
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # 项目依赖
└── README.md                     # 项目文档
```

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动前端开发服务器 |
| `npm run build` | 构建前端生产版本 |
| `npm run preview` | 预览前端构建产物 |
| `npm run tauri:dev` | 启动 Tauri 开发模式 |
| `npm run tauri:build` | 构建 Tauri 安装包 |

## License

MIT



请基于项目结构进行深度分析和验证，全面评估将 Beekeeper Studio 的所有功能完整迁移至 Tauri 和 Rust 技术栈的可行性。分析需要包含以下具体方面：

1. **包管理分析**：评估当前 Beekeeper Studio 应用的包依赖结构（包括 ​libs/beekeeper-studio/apps/studio/package.json​ 中的所有依赖），分析哪些包可以被 Rust 生态替代或需要重新实现

2. **数据库驱动兼容性**：详细分析当前支持的各种数据库连接器和驱动（参考 ​libs/beekeeper-studio/dev/​ 目录下的各种数据库初始化脚本），评估这些数据库连接能力在 Tauri/Rust 环境中的实现方案

3. **UI 组件库迁移**：分析 ​libs/beekeeper-studio/apps/ui-kit/​ 组件库的现有功能，评估如何将其迁移到与 Tauri 兼容的前端框架中

4. **第三方依赖映射**：梳理 ​libs/beekeeper-studio/​ 项目中的所有第三方依赖（包括 Node.js 模块、JavaScript 库等），确定每个依赖在 Rust 生态中的对应解决方案或替代方案

5. **前后端插件系统**：分析当前插件架构（参考 ​libs/beekeeper-studio/docs/plugin_development/​ 相关文档），设计在 Tauri/Rust 环境下如何实现类似的插件扩展机制

6. **C++ 依赖模块处理**：识别项目中可能存在的原生 C++ 模块或二进制依赖，制定在 Rust 中重新实现或桥接的策略

7. **性能和安全影响**：评估迁移后的性能表现和安全性改进

8. **迁移路径规划**：提供具体的分阶段迁移计划和风险评估

请提供详细的可行性报告，包括技术挑战、解决方案建议和实施时间估算。


# 2026-6-2 20:26:31
请在 H:\2026code\project\ran-cloud\ran-rs-desktop\src\modules 目录下添加 claw-manager 管理模块，具体要求如下：
1. 模块名称：claw-manager
2. 模块功能：提供对 OpenClaw 的管理功能，包括启动、停止、配置等操作。
3. 模块要求：
   - 使用 Rust 编写，确保模块的性能和安全性。
   - 提供详细的文档，说明模块的使用方法和配置项。
   - 模块代码提交到 H:\2026code\project\ran-cloud\ran-rs-desktop\src\modules 目录下。
   - 在sidebar添加入口，方便用户快速访问。不用独立弹出面板，直接访问模块下的页面即可



将这些命令进行规划分类，自行在claw-manager规划二级页面实现



请自行规划分类管理，添加这些指令的操作界面