/**
 * 应用设置 composable
 * 管理用户偏好设置，使用 JSON 文件持久化存储
 */

import { parseAiBaseUrl } from '~/utils/ai/baseUrl';

export interface AiModelPoolItem {
  id: string;
  enabled: boolean;
}

export interface AppSettings {
  notesDirectory: string | null; // 笔记存储目录
  autoSaveDelay: number; // 自动保存延迟（毫秒）
  theme: 'light' | 'dark' | 'system';
  /**
   * 应用语言（i18n locale）
   * - Electron 场景不建议用路由前缀切换语言，因此使用本地 settings.json 持久化
   */
  locale: 'zh-CN' | 'en';
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

function cloneDefaultSettings(): AppSettings {
  return {
    ...defaultSettings,
    // 避免默认值中的数组/对象被意外共享引用
    aiModelsPool: defaultSettings.aiModelsPool.map((m) => ({ ...m })),
  };
}

// 默认设置
const defaultSettings: AppSettings = {
  notesDirectory: null,
  autoSaveDelay: 1500,
  theme: 'system',
  locale: 'zh-CN',
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
      if (data) {
        const base = cloneDefaultSettings();
        const merged = { ...base, ...(data as any) } as AppSettings;

        // 简单防御：确保 aiModelsPool 是数组
        if (!Array.isArray((merged as any).aiModelsPool)) {
          merged.aiModelsPool = base.aiModelsPool;
        }

        settings.value = merged;
      } else {
        settings.value = cloneDefaultSettings();
      }
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
    const next = { ...settings.value, ...patch };
    settings.value = next;
    await saveSettings(next);
  };

  // 更新笔记目录
  const setNotesDirectory = async (path: string | null) => {
    // 先构造新的设置对象
    const newSettings = { ...settings.value, notesDirectory: path };
    // 更新状态
    settings.value = newSettings;
    // 保存到文件
    await saveSettings(newSettings);
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
    const newSettings = { ...settings.value, autoSaveDelay: delay };
    settings.value = newSettings;
    await saveSettings(newSettings);
  };

  // 更新主题
  const setTheme = async (theme: 'light' | 'dark' | 'system') => {
    const newSettings = { ...settings.value, theme };
    settings.value = newSettings;
    await saveSettings(newSettings);
  };

  // 更新 AI Key
  const setAiApiKey = async (key: string | null) => {
    const normalized = key?.trim() || null;
    const newSettings = { ...settings.value, aiApiKey: normalized };
    settings.value = newSettings;
    await saveSettings(newSettings);
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

    const newSettings = {
      ...settings.value,
      aiBaseUrl: normalized || defaultSettings.aiBaseUrl,
    };
    settings.value = newSettings;
    await saveSettings(newSettings);
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
    aiApiKey: computed(() => settings.value.aiApiKey),
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
    resetSettings,
  };
}
