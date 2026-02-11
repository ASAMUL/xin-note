import type { ThemeMode, ThemePreset, ThemeVariableMap } from './theme.types';

export interface BuiltInThemeOption {
  id: string;
  labelKey: string;
}

const THEME_MODES = ['light', 'dark', 'system'] as const;

export const DEFAULT_THEME_ID = 'paper';

export const BUILTIN_THEME_OPTIONS: readonly BuiltInThemeOption[] = [
  { id: 'paper', labelKey: 'settings.general.theme.presets.paper' },
  { id: 'ocean', labelKey: 'settings.general.theme.presets.ocean' },
  { id: 'forest', labelKey: 'settings.general.theme.presets.forest' },
] as const;

export const CUSTOM_THEME_VARIABLE_KEYS = [
  '--bg-app',
  '--bg-sidebar',
  '--bg-paper',
  '--bg-popup',
  '--border-color',
  '--text-main',
  '--text-mute',
  '--accent-color',
  '--accent-hover',
  '--primary',
  '--primary-foreground',
  '--background',
  '--foreground',
  '--color-error',
  '--color-error-hover',
  '--color-error-bg',
  '--color-error-bg-subtle',
  '--color-success',
  '--color-success-hover',
  '--color-success-bg',
  '--color-success-bg-subtle',
  '--color-warning',
  '--color-warning-hover',
  '--color-warning-bg',
  '--color-warning-bg-subtle',
  '--color-info',
  '--color-info-hover',
  '--color-info-bg',
  '--color-info-bg-subtle',
] as const;

const CUSTOM_THEME_VARIABLE_KEY_SET = new Set<string>(CUSTOM_THEME_VARIABLE_KEYS);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  if (THEME_MODES.includes(value as ThemeMode)) return value as ThemeMode;
  return 'system';
}

export function isBuiltInThemeId(themeId: string): boolean {
  return BUILTIN_THEME_OPTIONS.some((item) => item.id === themeId);
}

function normalizeThemeName(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return 'Custom Theme';
  return trimmed.slice(0, 32);
}

function sanitizeThemeVarValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 64) return null;
  if (normalized.includes('\n') || normalized.includes('\r')) return null;
  return normalized;
}

export function sanitizeThemeVariableMap(value: unknown): ThemeVariableMap {
  if (!isObjectRecord(value)) return {};

  const normalized: ThemeVariableMap = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!CUSTOM_THEME_VARIABLE_KEY_SET.has(key)) continue;
    const next = sanitizeThemeVarValue(rawValue);
    if (!next) continue;
    normalized[key] = next;
  }
  return normalized;
}

export function normalizeThemePreset(value: unknown): ThemePreset | null {
  if (!isObjectRecord(value)) return null;

  const rawId = typeof value.id === 'string' ? value.id.trim() : '';
  if (!rawId) return null;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rawId)) return null;
  if (isBuiltInThemeId(rawId)) return null;

  const lightVars = sanitizeThemeVariableMap(value.lightVars);
  const darkVars = sanitizeThemeVariableMap(value.darkVars);

  const normalized: ThemePreset = {
    id: rawId,
    name: normalizeThemeName(value.name),
    lightVars,
  };
  if (Object.keys(darkVars).length > 0) {
    normalized.darkVars = darkVars;
  }
  return normalized;
}

export function normalizeThemePresets(value: unknown): ThemePreset[] {
  if (!Array.isArray(value)) return [];

  const normalized: ThemePreset[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    const preset = normalizeThemePreset(item);
    if (!preset) continue;
    if (ids.has(preset.id)) continue;
    ids.add(preset.id);
    normalized.push(preset);
  }

  return normalized;
}

export function resolveActiveThemeId(rawId: unknown, customThemes: ThemePreset[]): string {
  if (typeof rawId === 'string') {
    const trimmed = rawId.trim();
    if (trimmed && isBuiltInThemeId(trimmed)) return trimmed;
    if (trimmed && customThemes.some((theme) => theme.id === trimmed)) return trimmed;
  }
  return DEFAULT_THEME_ID;
}

export function getThemeVariablesForMode(theme: ThemePreset, isDark: boolean): ThemeVariableMap {
  if (!isDark) return theme.lightVars;
  if (theme.darkVars && Object.keys(theme.darkVars).length > 0) return theme.darkVars;
  return theme.lightVars;
}

export function createCustomThemeId(): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `custom-${Date.now()}-${randomPart}`;
}
