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
  ],
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
    families: [
      { name: 'Inter', provider: 'bunny' },
      { name: 'Noto Serif SC', provider: 'bunny' },
      { name: 'JetBrains Mono', provider: 'bunny' },
      { name: 'LXGW WenKai TC', provider: 'google' },
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
