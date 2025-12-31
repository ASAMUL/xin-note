/**
 * 应用设置 composable
 * 管理用户偏好设置，包括笔记存储目录等
 */

export interface AppSettings {
  notesDirectory: string | null; // 笔记存储目录
  autoSaveDelay: number; // 自动保存延迟（毫秒）
  theme: 'light' | 'dark' | 'system';
}

const STORAGE_KEY = 'lumina-app-settings';

// 默认设置
const defaultSettings: AppSettings = {
  notesDirectory: null,
  autoSaveDelay: 1500,
  theme: 'system',
};

export function useSettings() {
  // 从 localStorage 读取设置
  const settings = useState<AppSettings>('app-settings', () => {
    if (import.meta.client) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return { ...defaultSettings, ...JSON.parse(stored) };
        } catch {
          return { ...defaultSettings };
        }
      }
    }
    return { ...defaultSettings };
  });

  // 保存设置到 localStorage
  const saveSettings = () => {
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
    }
  };

  // 更新笔记目录
  const setNotesDirectory = async (path: string | null) => {
    settings.value.notesDirectory = path;
    saveSettings();
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
  const setAutoSaveDelay = (delay: number) => {
    settings.value.autoSaveDelay = delay;
    saveSettings();
  };

  // 更新主题
  const setTheme = (theme: 'light' | 'dark' | 'system') => {
    settings.value.theme = theme;
    saveSettings();
  };

  // 重置设置
  const resetSettings = () => {
    settings.value = { ...defaultSettings };
    saveSettings();
  };

  return {
    settings: computed(() => settings.value),
    notesDirectory: computed(() => settings.value.notesDirectory),
    autoSaveDelay: computed(() => settings.value.autoSaveDelay),
    setNotesDirectory,
    selectNotesDirectory,
    setAutoSaveDelay,
    setTheme,
    resetSettings,
  };
}
