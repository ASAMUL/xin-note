/**
 * 应用设置 composable
 * 管理用户偏好设置，使用 JSON 文件持久化存储
 */

export interface AppSettings {
  notesDirectory: string | null; // 笔记存储目录
  autoSaveDelay: number; // 自动保存延迟（毫秒）
  theme: 'light' | 'dark' | 'system';
  /**
   * AI 配置（前端直连，用户自行填写 key）
   * 注意：这会写入本地 settings.json（位于 Electron userData 目录）
   */
  aiApiKey: string | null;
  aiBaseUrl: string;
  aiModel: string;
}

const CONFIG_FILE = 'settings.json';

// 默认设置
const defaultSettings: AppSettings = {
  notesDirectory: null,
  autoSaveDelay: 1500,
  theme: 'system',
  aiApiKey: null,
  aiBaseUrl: 'https://api.openai.com/v1',
  aiModel: 'gpt-4o-mini',
};

export function useSettings() {
  // 设置状态
  const settings = useState<AppSettings>('app-settings', () => ({ ...defaultSettings }));

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
        // 使用整体替换确保响应式更新
        settings.value = { ...defaultSettings, ...data };
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
    const normalized = url.trim().replace(/\/+$/, '');
    const newSettings = { ...settings.value, aiBaseUrl: normalized || defaultSettings.aiBaseUrl };
    settings.value = newSettings;
    await saveSettings(newSettings);
  };

  // 更新 AI Model
  const setAiModel = async (model: string) => {
    const normalized = model.trim();
    const newSettings = { ...settings.value, aiModel: normalized || defaultSettings.aiModel };
    settings.value = newSettings;
    await saveSettings(newSettings);
  };

  // 重置设置
  const resetSettings = async () => {
    const newSettings = { ...defaultSettings };
    settings.value = newSettings;
    await saveSettings(newSettings);
  };

  // 客户端初始化时加载设置
  if (import.meta.client && !isInitialized.value && !isLoading.value) {
    loadSettings();
  }

  return {
    settings: computed(() => settings.value),
    notesDirectory: computed(() => settings.value.notesDirectory),
    autoSaveDelay: computed(() => settings.value.autoSaveDelay),
    theme: computed(() => settings.value.theme),
    aiApiKey: computed(() => settings.value.aiApiKey),
    aiBaseUrl: computed(() => settings.value.aiBaseUrl),
    aiModel: computed(() => settings.value.aiModel),
    isInitialized: computed(() => isInitialized.value),
    loadSettings,
    setNotesDirectory,
    selectNotesDirectory,
    setAutoSaveDelay,
    setTheme,
    setAiApiKey,
    setAiBaseUrl,
    setAiModel,
    resetSettings,
  };
}
