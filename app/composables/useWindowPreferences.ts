/**
 * 窗口关闭偏好设置 composable
 * 用于管理用户关闭窗口时的行为偏好（最小化或关闭）
 */

export type CloseAction = 'minimize' | 'close' | null;

interface WindowPreferences {
  closeAction: CloseAction; // 关闭按钮的行为：minimize=最小化, close=关闭, null=每次询问
}

const STORAGE_KEY = 'lumina-window-preferences';

export function useWindowPreferences() {
  // 从 localStorage 读取偏好设置
  const preferences = useState<WindowPreferences>('window-preferences', () => {
    if (import.meta.client) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return { closeAction: null };
        }
      }
    }
    return { closeAction: null };
  });

  // 保存偏好设置到 localStorage
  const savePreferences = () => {
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.value));
    }
  };

  // 设置关闭行为
  const setCloseAction = (action: CloseAction) => {
    preferences.value.closeAction = action;
    savePreferences();
  };

  // 清除关闭行为偏好（恢复每次询问）
  const clearCloseAction = () => {
    preferences.value.closeAction = null;
    savePreferences();
  };

  // 获取当前关闭行为
  const closeAction = computed(() => preferences.value.closeAction);

  return {
    closeAction,
    setCloseAction,
    clearCloseAction,
  };
}
