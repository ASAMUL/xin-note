/**
 * App 级别语言桥接（settings.json ↔ i18n）
 *
 * 目标：
 * - locale 统一来源：settings.json
 * - UI 切换语言时：一次 patchSettings 写盘 + 调用 Nuxt i18n 的 setLocale（官方推荐）
 * - 启动时：settings 加载后自动同步到 i18n
 */

export type AppLocale = 'zh-CN' | 'en';

const SUPPORTED_LOCALES: readonly AppLocale[] = ['zh-CN', 'en'] as const;

function normalizeLocale(value: unknown): AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(String(value))
    ? (value as AppLocale)
    : 'zh-CN';
}

export function useAppLocale() {
  const { settings, patchSettings } = useSettings();
  // Nuxt i18n 扩展了 useI18n：请使用 setLocale 切换语言（不要直接写 locale.value）
  const { locale: i18nLocale, locales, setLocale: nuxtSetLocale } = useI18n();

  const appLocale = computed<AppLocale>(() => normalizeLocale(settings.value.locale));

  // settings 变更（含启动后 loadSettings merge）→ 同步到 i18n
  watch(
    appLocale,
    (next) => {
      if (i18nLocale.value === next) return;
      void nuxtSetLocale(next);
    },
    { immediate: true },
  );

  const setLocale = async (next: AppLocale) => {
    const normalized = normalizeLocale(next);
    if (appLocale.value === normalized && i18nLocale.value === normalized) return;
    // 一次写盘（useSettings 内部保证 patchSettings 为一次 save）
    await patchSettings({ locale: normalized });
    await nuxtSetLocale(normalized);
  };

  return {
    supportedLocales: SUPPORTED_LOCALES,
    locales,
    locale: appLocale,
    setLocale,
  };
}

