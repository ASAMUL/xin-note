/**
 * 全局快捷键管理 composable
 * 集中管理应用的所有快捷键，支持跨平台（Windows/Mac/Linux）
 *
 * 在 Electron 环境中，快捷键通过主进程的 before-input-event 捕获，
 * 然后通过 IPC 发送到渲染进程处理。
 */

export interface ShortcutOptions {
  /** 打开设置的回调 */
  onOpenSettings?: () => void;
  /** 打开搜索面板的回调 */
  onOpenSearch?: () => void;
  /** 创建新笔记的回调 */
  onCreateNote?: () => void;
  /** 保存笔记的回调 */
  onSaveNote?: () => void;
}

export function useShortcuts(options: ShortcutOptions = {}) {
  const { onOpenSettings, onOpenSearch, onCreateNote, onSaveNote } = options;

  // 双击 Shift 检测相关状态
  const lastShiftTime = ref(0);
  const DOUBLE_SHIFT_THRESHOLD = 300; // 双击时间阈值（毫秒）

  /**
   * 处理从主进程发送的快捷键消息
   */
  const handleShortcutMessage = (_event: unknown, action: string) => {
    switch (action) {
      case 'open-settings':
        onOpenSettings?.();
        break;
      case 'open-search':
        onOpenSearch?.();
        break;
      case 'create-note':
        onCreateNote?.();
        break;
      case 'save-note':
        console.log('save-note');
        onSaveNote?.();
        break;
    }
  };

  // 在组件挂载时注册事件监听
  onMounted(() => {
    // 监听来自主进程的快捷键消息
    if (window.ipcRenderer) {
      window.ipcRenderer.on('shortcut-triggered', handleShortcutMessage);
    }
  });

  // 在组件卸载时移除事件监听
  onUnmounted(() => {
    if (window.ipcRenderer) {
      window.ipcRenderer.off('shortcut-triggered', handleShortcutMessage);
    }
  });

  return {
    // 暴露方法以便外部需要时手动触发
    openSettings: () => onOpenSettings?.(),
    openSearch: () => onOpenSearch?.(),
    createNote: () => onCreateNote?.(),
    saveFile: () => onSaveNote?.(),
  };
}
