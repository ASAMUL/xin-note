/**
 * vue-i18n 全局配置（Nuxt i18n v10）
 * - messages 由 @nuxtjs/i18n 通过 langDir + locales[].file 按需加载
 * - locale 的实际值会在运行时通过 settings.json（useAppLocale）调用 setLocale() 同步
 */
export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
}));
