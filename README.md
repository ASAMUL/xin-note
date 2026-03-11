<div align="center">

# ✨ Xin Note

**AI 驱动的智能笔记**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js&logoColor=white)](https://nuxt.com)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)

[English](./README_EN.md) | 简体中文

</div>

---

## 📖 简介

**Xin Note** 是一款 AI 辅助的桌面笔记工具。有些人用它记笔记，有些人打开之后盯着空白页面发了一下午呆——不过没关系，AI 会替你先写两句。

基于 Electron 构建，支持 Windows 和 macOS。是的，它是一个桌面应用，因为有些灵感值得被 native 地对待。

> 核心理念：**让 AI 成为你的创作伙伴，而不是替你写作业的同桌。**

## ✨ 功能特性

- 🧠 **AI 智能提示** — 按下 Tab 键，AI 会给你 3 个灵感候选。选哪个都行，反正都是它想的
- 📝 **富文本编辑器** — 基于 Tiptap，支持代码块、Emoji、文本对齐等。该有的都有，不该有的也有
- 🔍 **全局语义检索** — 基于 LanceDB 向量数据库。AI 真的读完了你写的所有东西，即使你自己都没读完
- 🤖 **AI 助手** — 内置 Agent 能力，支持 OpenAI / Anthropic / Google。AI 的事情，就交给 AI 们去卷吧
- 🌐 **多语言支持** — 中文和英文。先把这两个搞定，毕竟地球上大部分人说的也就这俩
- 🎨 **现代化 UI** — Nuxt UI 4 + TailwindCSS 4 打磨。好看是第一生产力，这句话没人反对吧
- 📊 **Mermaid 图表** — 在笔记里画流程图和思维导图。让你的笔记看起来像是经过了深思熟虑
- ⌨️ **快捷命令面板** — 类似 VS Code 的命令面板。用了之后你会觉得鼠标是上个世纪的发明
- 🗂️ **文件树管理** — 支持拖拽排序。整理笔记的快乐，大概和整理衣柜差不多
- 🖥️ **跨平台** — Windows 和 macOS。Linux 用户……我们还在路上

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | [Nuxt 4](https://nuxt.com) + [Vue 3](https://vuejs.org) |
| **桌面端** | [Electron 39](https://www.electronjs.org) |
| **UI 组件** | [Nuxt UI 4](https://ui.nuxt.com) + [shadcn-vue](https://www.shadcn-vue.com) |
| **样式** | [TailwindCSS 4](https://tailwindcss.com) |
| **编辑器** | [Tiptap](https://tiptap.dev) |
| **AI** | [Vercel AI SDK](https://sdk.vercel.ai) (OpenAI / Anthropic / Google) |
| **向量搜索** | [LanceDB](https://lancedb.github.io/lancedb/) |
| **状态管理** | [Pinia](https://pinia.vuejs.org) |
| **国际化** | [@nuxtjs/i18n](https://i18n.nuxtjs.org) |
| **包管理** | [pnpm](https://pnpm.io) |

## 📦 安装

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 10

### 克隆仓库

```bash
git clone https://github.com/ASAMUL/xin-note.git
cd xin-note
```

### 安装依赖

```bash
pnpm install
```

## 🚀 开发

启动开发服务器（含 Electron 热重载）：

```bash
pnpm dev
```

## 📦 构建

构建生产版本的桌面应用：

```bash
pnpm electron:build
```

构建产物将输出到 `release/` 目录。

## 📁 项目结构

```
xin-note/
├── app/
│   ├── ai/                  # AI 相关逻辑
│   ├── assets/              # 静态资源 & 样式
│   ├── components/          # Vue 组件
│   │   ├── ai-assistant/    # AI 助手组件
│   │   ├── ai-elements/     # AI 元素组件库
│   │   ├── dialogs/         # 对话框组件
│   │   ├── editor/          # 编辑器组件
│   │   ├── settings/        # 设置组件
│   │   └── ui/              # 通用 UI 组件
│   ├── composables/         # Vue 组合式函数
│   ├── electron/            # Electron 主进程 & 预加载
│   ├── layouts/             # 页面布局
│   ├── lib/                 # 工具库
│   ├── pages/               # 页面路由
│   ├── types/               # TypeScript 类型定义
│   └── utils/               # 工具函数
├── i18n/                    # 国际化资源
│   └── locales/             # 语言包 (zh-CN / en)
├── public/                  # 公共静态资源
├── nuxt.config.ts           # Nuxt 配置
├── electron-builder.json    # Electron Builder 配置
└── package.json
```

## 🤝 贡献指南

欢迎贡献代码！请按照以下步骤：

1. **Fork** 本仓库
2. 创建你的功能分支：`git checkout -b feature/amazing-feature`
3. 提交你的更改：`git commit -m 'feat: add some amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 提交 **Pull Request**

### 提交规范

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` 修复 Bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `perf:` 性能优化
- `test:` 测试相关
- `chore:` 构建/工具变更

## 📄 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。

## 🙏 致谢

- [Nuxt](https://nuxt.com) — 让你觉得写全栈不难的框架（它真的不难吗）
- [Electron](https://www.electronjs.org) — 把网页塞进桌面的魔法，内存表示不太同意
- [Tiptap](https://tiptap.dev) — 一个没有头的编辑器框架，但它比大多数有头的都好用
- [Vercel AI SDK](https://sdk.vercel.ai) — AI 界的瑞士军刀，什么模型都能接
- [LanceDB](https://lancedb.github.io/lancedb/) — 向量数据库，让 AI 假装读过你写的所有东西

---

<div align="center">

Made with ❤️ by [Asamul](https://github.com/ASAMUL)

</div>
