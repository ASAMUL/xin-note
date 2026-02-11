<script setup lang="ts">
import { useAppLocale } from '~/composables/i18n/useAppLocale';
import type { ThemeMode, ThemeVariableMap } from '~/composables/theme/theme.types';
import { useThemeManager } from '~/composables/theme/useThemeManager';
/**
 * 设置 - 通用
 * - 语言切换：写入 settings.json，并同步到 i18n
 * - 主题设置：模式 / 内置主题 / 自定义主题
 */

defineProps<{ open?: boolean }>();

const { locale, setLocale } = useAppLocale();
const {
  builtInThemes,
  customThemes,
  themeMode,
  activeThemeId,
  setThemeMode,
  setActiveTheme,
  createCustomTheme,
  updateCustomTheme,
  deleteCustomTheme,
} = useThemeManager();

const toast = useToast();

interface ThemeColorDraft {
  bgApp: string;
  bgPaper: string;
  textMain: string;
  textMute: string;
  borderColor: string;
  accentColor: string;
}

const DEFAULT_LIGHT_DRAFT: ThemeColorDraft = {
  bgApp: '#f0eee5',
  bgPaper: '#faf9f6',
  textMain: '#000000',
  textMute: '#857f78',
  borderColor: '#d6d3c9',
  accentColor: '#b8860b',
};

const DEFAULT_DARK_DRAFT: ThemeColorDraft = {
  bgApp: '#0f0f10',
  bgPaper: '#1a1a1c',
  textMain: '#e4e4e7',
  textMute: '#71717a',
  borderColor: '#27272a',
  accentColor: '#d4a017',
};

const DEFAULT_LIGHT_SEMANTIC_VARS: ThemeVariableMap = {
  '--color-error': '#dc2626',
  '--color-error-hover': '#b91c1c',
  '--color-error-bg': '#fee2e2',
  '--color-error-bg-subtle': '#fef2f2',
  '--color-success': '#16a34a',
  '--color-success-hover': '#15803d',
  '--color-success-bg': '#dcfce7',
  '--color-success-bg-subtle': '#f0fdf4',
  '--color-warning': '#f59e0b',
  '--color-warning-hover': '#d97706',
  '--color-warning-bg': '#fef3c7',
  '--color-warning-bg-subtle': '#fffbeb',
  '--color-info': '#3b82f6',
  '--color-info-hover': '#2563eb',
  '--color-info-bg': '#dbeafe',
  '--color-info-bg-subtle': '#eff6ff',
};

const DEFAULT_DARK_SEMANTIC_VARS: ThemeVariableMap = {
  '--color-error': '#f87171',
  '--color-error-hover': '#fca5a5',
  '--color-error-bg': '#450a0a',
  '--color-error-bg-subtle': '#2d0a0a',
  '--color-success': '#4ade80',
  '--color-success-hover': '#86efac',
  '--color-success-bg': '#052e16',
  '--color-success-bg-subtle': '#022c22',
  '--color-warning': '#facc15',
  '--color-warning-hover': '#fde047',
  '--color-warning-bg': '#422006',
  '--color-warning-bg-subtle': '#2d1a06',
  '--color-info': '#60a5fa',
  '--color-info-hover': '#93c5fd',
  '--color-info-bg': '#1e3a5f',
  '--color-info-bg-subtle': '#172554',
};

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeDraftColor(value: unknown, fallback: string): string {
  if (!isHexColor(value)) return fallback;
  return value.trim().toLowerCase();
}

function readThemeVar(vars: ThemeVariableMap | undefined, key: string, fallback: string): string {
  return normalizeDraftColor(vars?.[key], fallback);
}

const customThemeName = ref('');
const lightDraft = reactive<ThemeColorDraft>({ ...DEFAULT_LIGHT_DRAFT });
const darkDraft = reactive<ThemeColorDraft>({ ...DEFAULT_DARK_DRAFT });

const activeCustomTheme = computed(() =>
  customThemes.value.find((theme) => theme.id === activeThemeId.value),
);

const isEditingCustomTheme = computed(() => Boolean(activeCustomTheme.value));

const applyDraft = (theme?: (typeof customThemes.value)[number]) => {
  if (!theme) {
    customThemeName.value = '';
    Object.assign(lightDraft, DEFAULT_LIGHT_DRAFT);
    Object.assign(darkDraft, DEFAULT_DARK_DRAFT);
    return;
  }

  customThemeName.value = theme.name;
  const darkSource =
    theme.darkVars && Object.keys(theme.darkVars).length > 0 ? theme.darkVars : theme.lightVars;

  Object.assign(lightDraft, {
    bgApp: readThemeVar(theme.lightVars, '--bg-app', DEFAULT_LIGHT_DRAFT.bgApp),
    bgPaper: readThemeVar(theme.lightVars, '--bg-paper', DEFAULT_LIGHT_DRAFT.bgPaper),
    textMain: readThemeVar(theme.lightVars, '--text-main', DEFAULT_LIGHT_DRAFT.textMain),
    textMute: readThemeVar(theme.lightVars, '--text-mute', DEFAULT_LIGHT_DRAFT.textMute),
    borderColor: readThemeVar(theme.lightVars, '--border-color', DEFAULT_LIGHT_DRAFT.borderColor),
    accentColor: readThemeVar(theme.lightVars, '--accent-color', DEFAULT_LIGHT_DRAFT.accentColor),
  });

  Object.assign(darkDraft, {
    bgApp: readThemeVar(darkSource, '--bg-app', DEFAULT_DARK_DRAFT.bgApp),
    bgPaper: readThemeVar(darkSource, '--bg-paper', DEFAULT_DARK_DRAFT.bgPaper),
    textMain: readThemeVar(darkSource, '--text-main', DEFAULT_DARK_DRAFT.textMain),
    textMute: readThemeVar(darkSource, '--text-mute', DEFAULT_DARK_DRAFT.textMute),
    borderColor: readThemeVar(darkSource, '--border-color', DEFAULT_DARK_DRAFT.borderColor),
    accentColor: readThemeVar(darkSource, '--accent-color', DEFAULT_DARK_DRAFT.accentColor),
  });
};

watch(
  activeCustomTheme,
  (theme) => {
    applyDraft(theme);
  },
  { immediate: true },
);

const canSaveCustomTheme = computed(() => customThemeName.value.trim().length > 0);

const buildThemeVars = (palette: ThemeColorDraft, isDark: boolean): ThemeVariableMap => {
  const bgApp = normalizeDraftColor(
    palette.bgApp,
    isDark ? DEFAULT_DARK_DRAFT.bgApp : DEFAULT_LIGHT_DRAFT.bgApp,
  );
  const bgPaper = normalizeDraftColor(
    palette.bgPaper,
    isDark ? DEFAULT_DARK_DRAFT.bgPaper : DEFAULT_LIGHT_DRAFT.bgPaper,
  );
  const textMain = normalizeDraftColor(
    palette.textMain,
    isDark ? DEFAULT_DARK_DRAFT.textMain : DEFAULT_LIGHT_DRAFT.textMain,
  );
  const textMute = normalizeDraftColor(
    palette.textMute,
    isDark ? DEFAULT_DARK_DRAFT.textMute : DEFAULT_LIGHT_DRAFT.textMute,
  );
  const borderColor = normalizeDraftColor(
    palette.borderColor,
    isDark ? DEFAULT_DARK_DRAFT.borderColor : DEFAULT_LIGHT_DRAFT.borderColor,
  );
  const accentColor = normalizeDraftColor(
    palette.accentColor,
    isDark ? DEFAULT_DARK_DRAFT.accentColor : DEFAULT_LIGHT_DRAFT.accentColor,
  );
  const semanticVars = isDark ? DEFAULT_DARK_SEMANTIC_VARS : DEFAULT_LIGHT_SEMANTIC_VARS;

  return {
    '--bg-app': bgApp,
    '--bg-sidebar': bgApp,
    '--bg-paper': bgPaper,
    '--bg-popup': bgPaper,
    '--text-main': textMain,
    '--text-mute': textMute,
    '--border-color': borderColor,
    '--accent-color': accentColor,
    '--accent-hover': accentColor,
    '--primary': accentColor,
    '--primary-foreground': isDark ? '#0b1115' : '#ffffff',
    '--background': bgPaper,
    '--foreground': textMain,
    ...semanticVars,
  };
};

const buildThemePayload = () => ({
  name: customThemeName.value.trim(),
  lightVars: buildThemeVars(lightDraft, false),
  darkVars: buildThemeVars(darkDraft, true),
});

const handleThemeMode = async (mode: ThemeMode) => {
  await setThemeMode(mode);
};

const handleSelectTheme = async (themeId: string) => {
  await setActiveTheme(themeId);
};

const handleCreateCustomTheme = async () => {
  if (!canSaveCustomTheme.value) {
    toast.add({ title: $t('settings.general.theme.custom.toast.nameRequired'), color: 'warning' });
    return;
  }
  const created = await createCustomTheme(buildThemePayload());
  if (!created) {
    toast.add({ title: $t('settings.general.theme.custom.toast.saveFailed'), color: 'error' });
    return;
  }
  toast.add({ title: $t('settings.general.theme.custom.toast.created'), color: 'primary' });
};

const handleUpdateCustomTheme = async () => {
  if (!activeCustomTheme.value) return;
  if (!canSaveCustomTheme.value) {
    toast.add({ title: $t('settings.general.theme.custom.toast.nameRequired'), color: 'warning' });
    return;
  }
  const updated = await updateCustomTheme(activeCustomTheme.value.id, buildThemePayload());
  if (!updated) {
    toast.add({ title: $t('settings.general.theme.custom.toast.saveFailed'), color: 'error' });
    return;
  }
  toast.add({ title: $t('settings.general.theme.custom.toast.updated'), color: 'primary' });
};

const handleDeleteCustomTheme = async () => {
  if (!activeCustomTheme.value) return;
  const ok = window.confirm($t('settings.general.theme.custom.deleteConfirm'));
  if (!ok) return;

  const removed = await deleteCustomTheme(activeCustomTheme.value.id);
  if (!removed) {
    toast.add({ title: $t('settings.general.theme.custom.toast.deleteFailed'), color: 'error' });
    return;
  }

  applyDraft();
  toast.add({ title: $t('settings.general.theme.custom.toast.deleted'), color: 'primary' });
};
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h4 class="text-sm font-semibold" style="color: var(--text-main)">
        {{ $t('settings.general.title') }}
      </h4>
      <p class="text-xs" style="color: var(--text-mute)">
        {{ $t('settings.general.description') }}
      </p>
    </div>

    <div class="section-card space-y-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-languages" class="w-4 h-4" />
        <span class="text-sm font-medium" style="color: var(--text-main)">
          {{ $t('settings.general.language.title') }}
        </span>
      </div>

      <p class="text-xs -mt-2" style="color: var(--text-mute)">
        {{ $t('settings.general.language.description') }}
      </p>

      <div class="flex items-center gap-2">
        <UButton
          size="sm"
          :variant="locale === 'zh-CN' ? 'soft' : 'ghost'"
          :color="locale === 'zh-CN' ? 'primary' : 'neutral'"
          icon="i-lucide-check"
          :ui="{ leadingIcon: locale === 'zh-CN' ? '' : 'opacity-0' }"
          @click="setLocale('zh-CN')"
        >
          {{ $t('settings.general.language.zhCN') }}
        </UButton>

        <UButton
          size="sm"
          :variant="locale === 'en' ? 'soft' : 'ghost'"
          :color="locale === 'en' ? 'primary' : 'neutral'"
          icon="i-lucide-check"
          :ui="{ leadingIcon: locale === 'en' ? '' : 'opacity-0' }"
          @click="setLocale('en')"
        >
          {{ $t('settings.general.language.en') }}
        </UButton>
      </div>
    </div>

    <div class="section-card space-y-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-palette" class="w-4 h-4" />
        <span class="text-sm font-medium" style="color: var(--text-main)">
          {{ $t('settings.general.theme.title') }}
        </span>
      </div>

      <p class="text-xs -mt-2" style="color: var(--text-mute)">
        {{ $t('settings.general.theme.description') }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          size="sm"
          :variant="themeMode === 'light' ? 'soft' : 'ghost'"
          :color="themeMode === 'light' ? 'primary' : 'neutral'"
          icon="i-lucide-sun"
          :ui="{ leadingIcon: themeMode === 'light' ? '' : 'opacity-0' }"
          @click="handleThemeMode('light')"
        >
          {{ $t('settings.general.theme.mode.light') }}
        </UButton>

        <UButton
          size="sm"
          :variant="themeMode === 'dark' ? 'soft' : 'ghost'"
          :color="themeMode === 'dark' ? 'primary' : 'neutral'"
          icon="i-lucide-moon"
          :ui="{ leadingIcon: themeMode === 'dark' ? '' : 'opacity-0' }"
          @click="handleThemeMode('dark')"
        >
          {{ $t('settings.general.theme.mode.dark') }}
        </UButton>

        <UButton
          size="sm"
          :variant="themeMode === 'system' ? 'soft' : 'ghost'"
          :color="themeMode === 'system' ? 'primary' : 'neutral'"
          icon="i-lucide-monitor"
          :ui="{ leadingIcon: themeMode === 'system' ? '' : 'opacity-0' }"
          @click="handleThemeMode('system')"
        >
          {{ $t('settings.general.theme.mode.system') }}
        </UButton>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium" style="color: var(--text-main)">
          {{ $t('settings.general.theme.presets.title') }}
        </p>
        <div class="theme-grid">
          <button
            v-for="preset in builtInThemes"
            :key="preset.id"
            type="button"
            class="theme-pill"
            :class="{ 'theme-pill-active': activeThemeId === preset.id }"
            @click="handleSelectTheme(preset.id)"
          >
            <span>{{ $t(preset.labelKey) }}</span>
            <UIcon v-if="activeThemeId === preset.id" name="i-lucide-check" class="h-4 w-4" />
          </button>

          <button
            v-for="theme in customThemes"
            :key="theme.id"
            type="button"
            class="theme-pill"
            :class="{ 'theme-pill-active': activeThemeId === theme.id }"
            @click="handleSelectTheme(theme.id)"
          >
            <span>{{ theme.name }}</span>
            <UIcon v-if="activeThemeId === theme.id" name="i-lucide-check" class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="custom-theme-editor space-y-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-medium" style="color: var(--text-main)">
            {{ $t('settings.general.theme.custom.title') }}
          </p>
          <span class="text-xs" style="color: var(--text-mute)">
            {{
              isEditingCustomTheme
                ? $t('settings.general.theme.custom.editing')
                : $t('settings.general.theme.custom.creating')
            }}
          </span>
        </div>

        <UInput
          v-model="customThemeName"
          size="sm"
          icon="i-lucide-tag"
          :placeholder="$t('settings.general.theme.custom.namePlaceholder')"
        />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="palette-card">
            <p class="palette-title">{{ $t('settings.general.theme.custom.lightTitle') }}</p>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.bgApp') }}</span>
              <input v-model="lightDraft.bgApp" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.bgPaper') }}</span>
              <input v-model="lightDraft.bgPaper" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.textMain') }}</span>
              <input v-model="lightDraft.textMain" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.textMute') }}</span>
              <input v-model="lightDraft.textMute" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.border') }}</span>
              <input v-model="lightDraft.borderColor" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.accent') }}</span>
              <input v-model="lightDraft.accentColor" type="color" />
            </label>
          </div>

          <div class="palette-card">
            <p class="palette-title">{{ $t('settings.general.theme.custom.darkTitle') }}</p>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.bgApp') }}</span>
              <input v-model="darkDraft.bgApp" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.bgPaper') }}</span>
              <input v-model="darkDraft.bgPaper" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.textMain') }}</span>
              <input v-model="darkDraft.textMain" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.textMute') }}</span>
              <input v-model="darkDraft.textMute" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.border') }}</span>
              <input v-model="darkDraft.borderColor" type="color" />
            </label>
            <label class="color-row">
              <span>{{ $t('settings.general.theme.custom.fields.accent') }}</span>
              <input v-model="darkDraft.accentColor" type="color" />
            </label>
          </div>
        </div>

        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            variant="soft"
            color="primary"
            size="sm"
            icon="i-lucide-plus"
            @click="handleCreateCustomTheme"
          >
            {{ $t('settings.general.theme.custom.create') }}
          </UButton>

          <UButton
            v-if="isEditingCustomTheme"
            variant="soft"
            color="neutral"
            size="sm"
            icon="i-lucide-save"
            @click="handleUpdateCustomTheme"
          >
            {{ $t('settings.general.theme.custom.update') }}
          </UButton>

          <UButton
            v-if="isEditingCustomTheme"
            variant="soft"
            color="error"
            size="sm"
            icon="i-lucide-trash-2"
            @click="handleDeleteCustomTheme"
          >
            {{ $t('settings.general.theme.custom.delete') }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  background-color: var(--bg-app);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.theme-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 38px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-paper);
  color: var(--text-main);
  font-size: 12px;
  padding: 8px 10px;
  transition: all 0.2s ease;
}

.theme-pill:hover {
  border-color: var(--accent-color);
}

.theme-pill-active {
  border-color: var(--accent-color);
  background: color-mix(in oklab, var(--accent-color) 14%, var(--bg-paper));
}

.custom-theme-editor {
  border-top: 1px dashed var(--border-color);
  padding-top: 12px;
}

.palette-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background-color: var(--bg-paper);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-mute);
}

.color-row input[type='color'] {
  width: 34px;
  height: 26px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
</style>
