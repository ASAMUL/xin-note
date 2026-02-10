// https://nuxt.com/docs/api/configuration/nuxt-config
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [
    '@pinia/nuxt',
    '@nuxt/ui',
    'nuxt-electron',
    '@nuxt/fonts',
    '@nuxt/hints',
    'shadcn-nuxt',
    '@nuxtjs/i18n',
  ],
  i18n: {
    // Electron + hashMode 场景：不建议通过路由前缀切换语言（/en/...）
    strategy: 'no_prefix',
    defaultLocale: 'zh-CN',
    // v10 推荐：使用 langDir + locales[].file 实现按需加载
    // 注意：langDir 的解析相对 restructureDir（默认 i18n/）
    restructureDir: 'i18n',
    langDir: 'locales',
    locales: [
      { code: 'zh-CN', name: '简体中文', file: 'zh-CN.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
    // Electron 下由本地 settings.json 决定语言，不做浏览器语言探测
    detectBrowserLanguage: false,
    vueI18n: './i18n.config.ts',
  },
  components: [{ path: '~/components', extensions: ['vue'] }],
  shadcn: { prefix: '', componentDir: '~/components/ui' },
  vite: {
    optimizeDeps: {
      include: [
        // 避免 prosemirror 多实例导致的 keyed plugin 错误（Nuxt UI Editor / TipTap 常见问题）
        'prosemirror-state',
        'prosemirror-transform',
        'prosemirror-model',
        'prosemirror-view',
        'prosemirror-gapcursor',
      ],
    },
    plugins: [tailwindcss()],
  },

  // 页面和布局过渡动画
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'layout', mode: 'out-in' },
  },

  fonts: {
    // 这是一个很好的全局默认设置，避免每个字体都写一遍
    defaults: {
      weights: [400, 500, 700], // 只下载常用字重
      styles: ['normal', 'italic'],
      subsets: ['latin'], // 默认只下载拉丁字符（英文/数字/符号）
    },

    families: [
      {
        name: 'Inter',
        provider: 'bunny',
        // 可以在这里覆盖默认设置，例如 Inter 不需要斜体
        // styles: ['normal']
      },
      {
        name: 'Noto Serif SC',
        provider: 'google', // 或者是 bunny
        // 中文字体通常没有 'latin' 子集概念，或者包含所有，
        // 但显式指定需要的字重非常重要，因为中文字体文件很大
        weights: [400, 700],
        subsets: ['chinese-simplified', 'latin'],
      },
      {
        name: 'JetBrains Mono',
        provider: 'bunny',
        weights: [400], // 代码字体通常只需要标准字重
      },
      {
        name: 'LXGW WenKai TC',
        provider: 'google',
        // 霞鹜文楷繁体，注意中文字体通常不需要斜体
        styles: ['normal'],
        weights: [400],
      },
    ],
  },
  ssr: false,
  electron: {
    build: [
      {
        // Main-Process entry file of the Electron App.
        entry: 'app/electron/main.ts',
        vite: {
          build: {
            //
            //  example 'externalize' node.js modules.
            //
            //  suppose you want to use node:sqlite.
            //  you write your repository class and import the class into main.ts like:
            //    import { SomethingRepository } from '~/repositories/SomethingRepository.ts';
            //
            //  in the repository class,
            //  you might import node:sqlite like:
            //    import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
            //
            //  now build fails:
            //    app/repositories/SomethingRepository.ts (1:9): "DatabaseSync" is not exported by "__vite-browser-external", imported by "app/repositories/SomethingRepository.ts".
            //
            //  one of the solutions is 'externalize' such modules.
            //
            rollupOptions: {
              // 原生 .node 模块不适合被 Vite/Rollup bundle，必须 external 走运行时加载
              external: ['@lancedb/lancedb', 'apache-arrow', 'reflect-metadata'],
            },
          },
          optimizeDeps: {
            // 避免对原生模块做预打包
            exclude: ['@lancedb/lancedb'],
          },

          resolve: {
            alias: { '~/': path.join(__dirname, 'app/') },
          },
        },
      },
      {
        entry: 'app/electron/preload.ts',
        onstart(args) {
          // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
          // instead of restarting the entire Electron App.
          args.reload();
        },
      },
    ],

    //
    //  it seems that
    //  - npm run dev requires disableDefaultOptions: true
    //    c.f. https://github.com/caoxiemeihao/nuxt-electron/issues/86 etc
    //  - npm run electron:build requires disableDefaultOptions: false
    //    otherwise built program does not work(in my experience)
    //
    //  so we need to switch disableDefaultOptions.
    //
    //  following assumes
    //    process.env.NODE_ENV === 'development' on npm run dev
    //    process.env.NODE_ENV === 'production' on npm run electron:build
    //
    disableDefaultOptions: process.env.NODE_ENV === 'development',

    // Ployfill the Electron and Node.js API for Renderer process.
    // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
    // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
    renderer: {},
  },
  router: {
    options: {
      hashMode: true,
    },
  },
});
