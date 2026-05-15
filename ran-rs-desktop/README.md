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
