/**
 * 应用设置 composable
 * 管理用户偏好设置，使用 JSON 文件持久化存储
 */

import {
  DEFAULT_THEME_ID,
  normalizeThemeMode,
  normalizeThemePresets,
  resolveActiveThemeId,
} from '~/composables/theme/theme-presets';
import type { ThemeMode, ThemePreset } from '~/composables/theme/theme.types';
import { parseAiBaseUrl } from '~/utils/ai/baseUrl';

/** 允许的字体列表（与 nuxt.config.ts 中预加载的字体对应） */
export const ALLOWED_FONT_FAMILIES = [
  'system',          // 系统默认字体
  'LXGW WenKai TC',  // 霞鹜文楷
  'Inter',           // 无衬线英文字体
  'Noto Serif SC',   // 思源宋体
  'JetBrains Mono',  // 等宽编程字体
] as const;

export type FontFamily = (typeof ALLOWED_FONT_FAMILIES)[number];

export const DEFAULT_FONT_FAMILY: FontFamily = 'LXGW WenKai TC';

export interface AiModelPoolItem {
  id: string;
  enabled: boolean;
}

export interface AppSettings {
  notesDirectory: string | null; // 笔记存储目录
  autoSaveDelay: number; // 自动保存延迟（毫秒）
  theme: ThemeMode;
  activeThemeId: string; // 当前激活主题（内置 + 自定义共用）
  customThemes: ThemePreset[]; // 用户自定义主题
  /**
   * 应用语言（i18n locale）
   * - Electron 场景不建议用路由前缀切换语言，因此使用本地 settings.json 持久化
   */
  locale: 'zh-CN' | 'en';
  /** 全局界面字体 */
  fontFamily: FontFamily;
  /**
   * AI 配置（前端直连，用户自行填写 key）
   * 注意：这会写入本地 settings.json（位于 Electron userData 目录）
   */
  aiApiKey: string | null;
  aiBaseUrl: string;
  /**
   * 模型池：通过“管理”添加模型，并可对每个模型启用/禁用。
   * - role 模型只能从 enabled 的模型中选择
   */
  aiModelsPool: AiModelPoolItem[];
  /**
   * 三种“角色模型”：分别用于不同场景的调用。
   * - chat：聊天/助手
   * - fast：快速（预留给未来轻量调用）
   * - completion：编辑器 Tab 补全/续写
   */
  aiChatModelId: string | null;
  aiFastModelId: string | null;
  aiCompletionModelId: string | null;
}

const CONFIG_FILE = 'settings.json';

const DEFAULT_AI_MODEL = 'openai/gpt-4o-mini';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneThemePreset(theme: ThemePreset): ThemePreset {
  return {
    ...theme,
    lightVars: { ...theme.lightVars },
    darkVars: theme.darkVars ? { ...theme.darkVars } : undefined,
  };
}

function cloneDefaultSettings(): AppSettings {
  return {
    ...defaultSettings,
    // 避免默认值中的数组/对象被意外共享引用
    aiModelsPool: defaultSettings.aiModelsPool.map((m) => ({ ...m })),
    customThemes: defaultSettings.customThemes.map((theme) => cloneThemePreset(theme)),
  };
}

function normalizeAiModelsPool(value: unknown): AiModelPoolItem[] {
  if (!Array.isArray(value)) {
    return defaultSettings.aiModelsPool.map((m) => ({ ...m }));
  }

  const normalized: AiModelPoolItem[] = [];
  const seenIds = new Set<string>();
  for (const item of value) {
    if (!isObjectRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    normalized.push({ id, enabled: Boolean(item.enabled) });
  }

  if (normalized.length === 0) {
    return defaultSettings.aiModelsPool.map((m) => ({ ...m }));
  }
  return normalized;
}

function normalizeRoleModelId(
  value: unknown,
  pool: AiModelPoolItem[],
  fallback: string | null,
): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw && pool.some((item) => item.id === raw)) return raw;
  if (fallback && pool.some((item) => item.id === fallback)) return fallback;
  return pool[0]?.id ?? null;
}

function normalizeIncomingSettings(value: unknown): AppSettings {
  const base = cloneDefaultSettings();
  if (!isObjectRecord(value)) return base;

  const merged = { ...base, ...value } as AppSettings;
  const aiModelsPool = normalizeAiModelsPool((merged as any).aiModelsPool);
  const customThemes = normalizeThemePresets((merged as any).customThemes);
  const activeThemeId = resolveActiveThemeId((merged as any).activeThemeId, customThemes);

  const normalizedNotesDirectory =
    typeof merged.notesDirectory === 'string' && merged.notesDirectory.trim()
      ? merged.notesDirectory
      : null;
  const normalizedDelay = Number(merged.autoSaveDelay);
  const normalizedAutoSaveDelay =
    Number.isFinite(normalizedDelay) && normalizedDelay >= 200 && normalizedDelay <= 60000
      ? normalizedDelay
      : base.autoSaveDelay;

  return {
    ...base,
    ...merged,
    notesDirectory: normalizedNotesDirectory,
    autoSaveDelay: normalizedAutoSaveDelay,
    theme: normalizeThemeMode((merged as any).theme),
    activeThemeId,
    customThemes,
    locale: merged.locale === 'en' ? 'en' : 'zh-CN',
    fontFamily: ALLOWED_FONT_FAMILIES.includes((merged as any).fontFamily)
      ? (merged as any).fontFamily
      : DEFAULT_FONT_FAMILY,
    aiApiKey: typeof merged.aiApiKey === 'string' ? merged.aiApiKey.trim() || null : null,
    aiBaseUrl:
      typeof merged.aiBaseUrl === 'string' && merged.aiBaseUrl.trim()
        ? merged.aiBaseUrl.trim()
        : base.aiBaseUrl,
    aiModelsPool,
    aiChatModelId: normalizeRoleModelId(merged.aiChatModelId, aiModelsPool, base.aiChatModelId),
    aiFastModelId: normalizeRoleModelId(merged.aiFastModelId, aiModelsPool, base.aiFastModelId),
    aiCompletionModelId: normalizeRoleModelId(
      merged.aiCompletionModelId,
      aiModelsPool,
      base.aiCompletionModelId,
    ),
  };
}

// 默认设置
const defaultSettings: AppSettings = {
  notesDirectory: null,
  autoSaveDelay: 1500,
  theme: 'system',
  activeThemeId: DEFAULT_THEME_ID,
  customThemes: [],
  locale: 'zh-CN',
  fontFamily: DEFAULT_FONT_FAMILY,
  aiApiKey: null,
  // 用户通常只需要填写「Base URL」本体；请求时会自动追加 /v1（末尾加 # 可禁用）
  aiBaseUrl: 'https://api.openai.com',
  aiModelsPool: [{ id: DEFAULT_AI_MODEL, enabled: true }],
  aiChatModelId: DEFAULT_AI_MODEL,
  aiFastModelId: DEFAULT_AI_MODEL,
  aiCompletionModelId: DEFAULT_AI_MODEL,
};

export function useSettings() {
  // 设置状态
  const settings = useState<AppSettings>('app-settings', () => cloneDefaultSettings());

  // 初始化状态也使用 useState 确保全局唯一
  const isInitialized = useState<boolean>('settings-initialized', () => false);
  const isLoading = useState<boolean>('settings-loading', () => false);

  // 从 JSON 文件加载设置
  const loadSettings = async () => {
    // 避免重复加载
    if (isInitialized.value || isLoading.value) return;
    if (!window.ipcRenderer) return;

    isLoading.value = true;
    try {
      const data = await window.ipcRenderer.invoke('config-read', CONFIG_FILE);
      settings.value = normalizeIncomingSettings(data);
      isInitialized.value = true;
    } catch (error) {
      console.error('加载设置失败:', error);
    } finally {
      isLoading.value = false;
    }
  };

  // 保存设置到 JSON 文件
  const saveSettings = async (dataToSave: AppSettings) => {
    if (!window.ipcRenderer) {
      console.warn('ipcRenderer 不可用，无法保存设置');
      return false;
    }

    try {
      const result = await window.ipcRenderer.invoke('config-write', {
        fileName: CONFIG_FILE,
        data: dataToSave,
      });
      console.log('设置已保存:', dataToSave);
      return result;
    } catch (error) {
      console.error('保存设置失败:', error);
      return false;
    }
  };

  // 批量 patch（一次写盘），给更复杂的设置场景使用（例如 AI 模型池）
  const patchSettings = async (patch: Partial<AppSettings>) => {
    const next = normalizeIncomingSettings({ ...settings.value, ...patch });
    settings.value = next;
    await saveSettings(next);
  };

  // 更新笔记目录
  const setNotesDirectory = async (path: string | null) => {
    await patchSettings({ notesDirectory: path });
  };

  // 选择笔记目录（调用 Electron 对话框）
  const selectNotesDirectory = async (): Promise<string | null> => {
    if (!window.ipcRenderer) return null;

    const result = await window.ipcRenderer.invoke('dialog-select-folder');
    if (result) {
      await setNotesDirectory(result);
    }
    return result;
  };

  // 更新自动保存延迟
  const setAutoSaveDelay = async (delay: number) => {
    await patchSettings({ autoSaveDelay: delay });
  };

  // 更新主题
  const setTheme = async (theme: ThemeMode) => {
    await patchSettings({ theme: normalizeThemeMode(theme) });
  };

  // 更新 AI Key
  const setAiApiKey = async (key: string | null) => {
    const normalized = key?.trim() || null;
    await patchSettings({ aiApiKey: normalized });
  };

  // 更新 AI Base URL
  const setAiBaseUrl = async (url: string) => {
    // 规范化规则：
    // - 去空格、去末尾斜杠
    // - 支持末尾 `#`：禁用自动追加 /v1
    // - 若用户误填了 /v1/chat/completions 等 endpoint，会自动裁剪回 baseURL
    const parsed = parseAiBaseUrl(url);
    const normalized = parsed.baseURL
      ? `${parsed.baseURL}${parsed.disableAutoAppendV1 ? '#' : ''}`
      : '';

    await patchSettings({ aiBaseUrl: normalized || defaultSettings.aiBaseUrl });
  };

  // 更新全局字体
  const setFontFamily = async (font: FontFamily) => {
    await patchSettings({ fontFamily: font });
  };

  // 重置设置
  const resetSettings = async () => {
    const newSettings = cloneDefaultSettings();
    settings.value = newSettings;
    await saveSettings(newSettings);
  };

  onMounted(() => {
    void loadSettings();
  });

  return {
    settings: computed(() => settings.value),
    notesDirectory: computed(() => settings.value.notesDirectory),
    autoSaveDelay: computed(() => settings.value.autoSaveDelay),
    theme: computed(() => settings.value.theme),
    activeThemeId: computed(() => settings.value.activeThemeId),
    customThemes: computed(() => settings.value.customThemes),
    aiApiKey: computed(() => settings.value.aiApiKey),
    fontFamily: computed(() => settings.value.fontFamily),
    aiBaseUrl: computed(() => settings.value.aiBaseUrl),
    aiModelsPool: computed(() => settings.value.aiModelsPool),
    aiChatModelId: computed(() => settings.value.aiChatModelId),
    aiFastModelId: computed(() => settings.value.aiFastModelId),
    aiCompletionModelId: computed(() => settings.value.aiCompletionModelId),
    isInitialized: computed(() => isInitialized.value),
    loadSettings,
    patchSettings,
    setNotesDirectory,
    selectNotesDirectory,
    setAutoSaveDelay,
    setTheme,
    setAiApiKey,
    setAiBaseUrl,
    setFontFamily,
    resetSettings,
  };
}
