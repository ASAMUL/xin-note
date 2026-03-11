<div align="center">

# ✨ Xin Note

**AI-Powered Intelligent Note-Taking & Novel Writing Tool**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js&logoColor=white)](https://nuxt.com)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)

English | [简体中文](./README.md)

</div>

---

## 📖 Introduction

**Xin Note** is an AI-powered desktop note-taking and novel-writing tool. Some people use it to take notes, some use it to write novels, and some just stare at a blank page all afternoon — but that's fine, the AI will write the first few lines for you.

Built on Electron for Windows and macOS. Yes, it's a desktop app, because some inspirations deserve to be treated natively.

> Core philosophy: **Make AI your creative partner, not the classmate who does your homework.**

## ✨ Features

- 🧠 **AI Smart Suggestions** — Press Tab, get 3 creative suggestions. Pick any one — they're all the AI's ideas anyway
- 📝 **Rich Text Editor** — Tiptap-based, with code blocks, emoji, text alignment, and more. Everything you need, and things you didn't know you needed
- 🔍 **Semantic Search** — LanceDB-powered vector search. The AI actually read everything you wrote, even if you didn't
- 🤖 **AI Assistant** — Built-in Agent with OpenAI / Anthropic / Google support. Let the AIs compete among themselves
- 🌐 **i18n Support** — Chinese and English. Let's nail these two first — covers most of the planet anyway
- 🎨 **Modern UI** — Nuxt UI 4 + TailwindCSS 4. Looking good is the first productivity hack, and nobody can argue with that
- 📊 **Mermaid Diagrams** — Flowcharts and mind maps in your notes. Makes it look like you've given it some serious thought
- ⌨️ **Command Palette** — VS Code-like command palette. After using it, you'll think the mouse was invented in the last century
- 🗂️ **File Tree** — Drag-and-drop sorting. The joy of organizing notes is probably close to organizing your closet
- 🖥️ **Cross-platform** — Windows and macOS. Linux users... we're on our way

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Nuxt 4](https://nuxt.com) + [Vue 3](https://vuejs.org) |
| **Desktop** | [Electron 39](https://www.electronjs.org) |
| **UI Components** | [Nuxt UI 4](https://ui.nuxt.com) + [shadcn-vue](https://www.shadcn-vue.com) |
| **Styling** | [TailwindCSS 4](https://tailwindcss.com) |
| **Editor** | [Tiptap](https://tiptap.dev) |
| **AI** | [Vercel AI SDK](https://sdk.vercel.ai) (OpenAI / Anthropic / Google) |
| **Vector Search** | [LanceDB](https://lancedb.github.io/lancedb/) |
| **State Management** | [Pinia](https://pinia.vuejs.org) |
| **i18n** | [@nuxtjs/i18n](https://i18n.nuxtjs.org) |
| **Package Manager** | [pnpm](https://pnpm.io) |

## 📦 Installation

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 10

### Clone the Repository

```bash
git clone https://github.com/ASAMUL/xin-note.git
cd xin-note
```

### Install Dependencies

```bash
pnpm install
```

## 🚀 Development

Start the development server (with Electron hot-reload):

```bash
pnpm dev
```

## 📦 Build

Build the production desktop application:

```bash
pnpm electron:build
```

Build artifacts will be output to the `release/` directory.

## 📁 Project Structure

```
xin-note/
├── app/
│   ├── ai/                  # AI related logic
│   ├── assets/              # Static assets & styles
│   ├── components/          # Vue components
│   │   ├── ai-assistant/    # AI assistant components
│   │   ├── ai-elements/     # AI elements library
│   │   ├── dialogs/         # Dialog components
│   │   ├── editor/          # Editor components
│   │   ├── settings/        # Settings components
│   │   └── ui/              # Common UI components
│   ├── composables/         # Vue composables
│   ├── electron/            # Electron main process & preload
│   ├── layouts/             # Page layouts
│   ├── lib/                 # Utility libraries
│   ├── pages/               # Page routes
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Utility functions
├── i18n/                    # Internationalization resources
│   └── locales/             # Language packs (zh-CN / en)
├── public/                  # Public static assets
├── nuxt.config.ts           # Nuxt configuration
├── electron-builder.json    # Electron Builder configuration
└── package.json
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a **Pull Request**

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation update
- `style:` Code style changes
- `refactor:` Code refactoring
- `perf:` Performance improvement
- `test:` Test related
- `chore:` Build/tooling changes

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [Nuxt](https://nuxt.com) — The framework that makes full-stack feel easy (is it though?)
- [Electron](https://www.electronjs.org) — The magic of stuffing a webpage into a desktop app. RAM disagrees
- [Tiptap](https://tiptap.dev) — A headless editor framework that's better than most headed ones
- [Vercel AI SDK](https://sdk.vercel.ai) — The Swiss Army knife of AI. Plugs into every model out there
- [LanceDB](https://lancedb.github.io/lancedb/) — Vector database that lets the AI pretend it read everything you wrote

---

<div align="center">

Made with ❤️ by [Asamul](https://github.com/ASAMUL)

</div>
