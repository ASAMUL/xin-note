import type { ThemeMode, ThemePreset, ThemeVariableMap } from './theme.types';
import {
  BUILTIN_THEME_OPTIONS,
  DEFAULT_THEME_ID,
  createCustomThemeId,
  isBuiltInThemeId,
  normalizeThemeMode,
  normalizeThemePreset,
  normalizeThemePresets,
  resolveActiveThemeId,
} from './theme-presets';

interface ThemeDraftPayload {
  name: string;
  lightVars: ThemeVariableMap;
  darkVars?: ThemeVariableMap;
}

export function useThemeManager() {
  const { settings, patchSettings } = useSettings();

  const themeMode = computed<ThemeMode>(() => normalizeThemeMode(settings.value.theme));
  const customThemes = computed<ThemePreset[]>(() => normalizeThemePresets(settings.value.customThemes));
  const activeThemeId = computed<string>(() =>
    resolveActiveThemeId(settings.value.activeThemeId, customThemes.value),
  );

  const setThemeMode = async (next: ThemeMode) => {
    await patchSettings({ theme: normalizeThemeMode(next) });
  };

  const setActiveTheme = async (themeId: string) => {
    const nextId = resolveActiveThemeId(themeId, customThemes.value);
    await patchSettings({ activeThemeId: nextId });
  };

  const createCustomTheme = async (payload: ThemeDraftPayload) => {
    const normalized = normalizeThemePreset({
      id: createCustomThemeId(),
      name: payload.name,
      lightVars: payload.lightVars,
      darkVars: payload.darkVars,
    });
    if (!normalized) return null;

    const nextCustomThemes = [...customThemes.value, normalized];
    await patchSettings({
      customThemes: nextCustomThemes,
      activeThemeId: normalized.id,
    });
    return normalized;
  };

  const updateCustomTheme = async (themeId: string, payload: ThemeDraftPayload) => {
    if (isBuiltInThemeId(themeId)) return null;

    const index = customThemes.value.findIndex((theme) => theme.id === themeId);
    if (index < 0) return null;

    const normalized = normalizeThemePreset({
      id: themeId,
      name: payload.name,
      lightVars: payload.lightVars,
      darkVars: payload.darkVars,
    });
    if (!normalized) return null;

    const nextCustomThemes = customThemes.value.map((theme, idx) =>
      idx === index ? normalized : theme,
    );
    await patchSettings({
      customThemes: nextCustomThemes,
      activeThemeId: resolveActiveThemeId(settings.value.activeThemeId, nextCustomThemes),
    });
    return normalized;
  };

  const deleteCustomTheme = async (themeId: string) => {
    if (isBuiltInThemeId(themeId)) return false;

    const nextCustomThemes = customThemes.value.filter((theme) => theme.id !== themeId);
    if (nextCustomThemes.length === customThemes.value.length) return false;

    const fallbackActiveThemeId =
      settings.value.activeThemeId === themeId ? DEFAULT_THEME_ID : settings.value.activeThemeId;

    await patchSettings({
      customThemes: nextCustomThemes,
      activeThemeId: resolveActiveThemeId(fallbackActiveThemeId, nextCustomThemes),
    });
    return true;
  };

  return {
    builtInThemes: BUILTIN_THEME_OPTIONS,
    customThemes,
    themeMode,
    activeThemeId,
    setThemeMode,
    setActiveTheme,
    createCustomTheme,
    updateCustomTheme,
    deleteCustomTheme,
    isBuiltInThemeId,
  };
}
