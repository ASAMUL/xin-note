import type { ThemeMode, ThemePreset } from './theme.types';
import {
  getThemeVariablesForMode,
  normalizeThemeMode,
  normalizeThemePresets,
  resolveActiveThemeId,
} from './theme-presets';

const SYSTEM_DARK_MEDIA = '(prefers-color-scheme: dark)';

export function useAppTheme() {
  const { settings } = useSettings();

  const systemPrefersDark = ref(false);
  const mediaQuery = ref<MediaQueryList | null>(null);
  const appliedCustomKeys = new Set<string>();

  const clearCustomThemeVars = (root: HTMLElement) => {
    for (const key of appliedCustomKeys) {
      root.style.removeProperty(key);
    }
    appliedCustomKeys.clear();
  };

  const applyTheme = (
    mode: ThemeMode,
    rawActiveThemeId: string,
    rawCustomThemes: ThemePreset[],
    prefersDark: boolean,
  ) => {
    if (!import.meta.client || typeof document === 'undefined') return;

    const customThemes = normalizeThemePresets(rawCustomThemes);
    const activeThemeId = resolveActiveThemeId(rawActiveThemeId, customThemes);
    const isDark = mode === 'dark' || (mode === 'system' && prefersDark);

    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.setAttribute('data-theme', activeThemeId);

    clearCustomThemeVars(root);

    const activeCustomTheme = customThemes.find((theme) => theme.id === activeThemeId);
    if (!activeCustomTheme) return;

    const vars = getThemeVariablesForMode(activeCustomTheme, isDark);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
      appliedCustomKeys.add(key);
    }
  };

  const syncTheme = () => {
    applyTheme(
      normalizeThemeMode(settings.value.theme),
      settings.value.activeThemeId,
      settings.value.customThemes,
      systemPrefersDark.value,
    );
  };

  const handleSystemThemeChange = (event: MediaQueryListEvent) => {
    systemPrefersDark.value = event.matches;
  };

  onMounted(() => {
    if (!import.meta.client || typeof window === 'undefined') return;

    const currentMedia = window.matchMedia(SYSTEM_DARK_MEDIA);
    mediaQuery.value = currentMedia;
    systemPrefersDark.value = currentMedia.matches;
    currentMedia.addEventListener('change', handleSystemThemeChange);

    syncTheme();
  });

  onBeforeUnmount(() => {
    mediaQuery.value?.removeEventListener('change', handleSystemThemeChange);
  });

  watch(
    [
      () => settings.value.theme,
      () => settings.value.activeThemeId,
      () => settings.value.customThemes,
      systemPrefersDark,
    ],
    ([mode, activeThemeId, customThemes, prefersDark]) => {
      applyTheme(
        normalizeThemeMode(mode),
        activeThemeId,
        normalizeThemePresets(customThemes),
        prefersDark,
      );
    },
    { immediate: true, deep: true },
  );
}
