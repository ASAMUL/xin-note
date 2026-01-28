export const useLayoutState = () => {
  const isAiSidebarOpen = useState('layout:ai-sidebar-open', () => false);
  const isLeftSidebarOpen = useState('layout:left-sidebar-open', () => true);

  /**
   * 禅模式：只隐藏左右侧边栏（保留顶部 AppNavbar + 底部 AppFooter）。
   *
   * 设计要点：
   * - 进入禅模式：记录进入前两侧边栏开关状态，然后强制关闭两侧边栏
   * - 退出禅模式：恢复进入前记录的状态
   * - 在禅模式下，如果用户主动点了“侧边栏/AI 助手”，认为是想退出禅模式并立即打开对应栏
   */
  const isZenMode = useState('layout:zen-mode', () => false);
  const zenSnapshot = useState<null | { left: boolean; ai: boolean }>(
    'layout:zen-snapshot',
    () => null,
  );

  const enterZenMode = () => {
    if (isZenMode.value) return;
    zenSnapshot.value = {
      left: isLeftSidebarOpen.value,
      ai: isAiSidebarOpen.value,
    };
    isZenMode.value = true;
    isLeftSidebarOpen.value = false;
    isAiSidebarOpen.value = false;
  };

  const exitZenMode = (options?: { restore?: boolean }) => {
    if (!isZenMode.value) return;
    const restore = options?.restore ?? true;
    isZenMode.value = false;

    if (restore && zenSnapshot.value) {
      isLeftSidebarOpen.value = zenSnapshot.value.left;
      isAiSidebarOpen.value = zenSnapshot.value.ai;
    }

    // 清理快照，避免后续误用旧状态
    zenSnapshot.value = null;
  };

  const toggleZenMode = () => {
    if (isZenMode.value) {
      exitZenMode({ restore: true });
      return;
    }
    enterZenMode();
  };

  const toggleAiSidebar = () => {
    if (isZenMode.value) {
      // 禅模式下用户主动打开侧栏：先退出禅模式（不恢复快照），再执行开关
      exitZenMode({ restore: false });
    }
    isAiSidebarOpen.value = !isAiSidebarOpen.value;
  };

  const toggleLeftSidebar = () => {
    if (isZenMode.value) {
      // 禅模式下用户主动打开侧栏：先退出禅模式（不恢复快照），再执行开关
      exitZenMode({ restore: false });
    }
    isLeftSidebarOpen.value = !isLeftSidebarOpen.value;
  };

  return {
    isAiSidebarOpen,
    toggleAiSidebar,
    isLeftSidebarOpen,
    toggleLeftSidebar,
    isZenMode,
    toggleZenMode,
  };
};
