/**
 * 标签页管理 composable
 * 负责多标签页的打开、关闭、切换等操作
 * 支持工作区状态持久化到 JSON 文件
 */

import type { NoteItem } from './useNotes';

// 标签页项接口
export interface TabItem {
  id: string; // 唯一标识（与笔记 id 一致）
  name: string; // 显示名称
  path: string; // 文件路径
  isModified: boolean; // 是否有未保存修改
  content: string; // 编辑器内容
}

// 标签页状态接口
interface TabsState {
  openTabs: TabItem[];
  activeTabId: string | null;
}

// 工作区数据结构（只存路径，不存内容）
interface WorkspaceData {
  openTabPaths: string[]; // 打开的文件路径列表
  activeTabPath: string | null; // 当前激活的标签页路径
}

const WORKSPACE_FILE = 'workspace.json';

export function useTabs() {
  // 标签页状态（使用 useState 保证跨组件共享）
  const state = useState<TabsState>('tabs-state', () => ({
    openTabs: [],
    activeTabId: null,
  }));

  // 初始化状态也使用 useState 确保全局唯一
  const isWorkspaceRestored = useState<boolean>('workspace-restored', () => false);
  const isRestoring = useState<boolean>('workspace-restoring', () => false);

  // 获取当前激活的标签页
  const activeTab = computed(() => {
    if (!state.value.activeTabId) return null;
    return state.value.openTabs.find((tab) => tab.id === state.value.activeTabId) || null;
  });

  /**
   * 保存工作区状态到 JSON 文件
   */
  const saveWorkspace = async () => {
    if (!window.ipcRenderer) return;

    try {
      const data: WorkspaceData = {
        openTabPaths: state.value.openTabs.map((tab) => tab.path),
        activeTabPath: activeTab.value?.path || null,
      };
      await window.ipcRenderer.invoke('config-write', {
        fileName: WORKSPACE_FILE,
        data,
      });
    } catch (error) {
      console.error('保存工作区状态失败:', error);
    }
  };

  /**
   * 根据文件路径打开标签页
   */
  const openTabByPath = async (filePath: string): Promise<TabItem | null> => {
    if (!window.ipcRenderer) return null;

    // 检查是否已存在
    const existing = state.value.openTabs.find((tab) => tab.path === filePath);
    if (existing) {
      state.value.activeTabId = existing.id;
      return existing;
    }

    try {
      // 读取文件内容
      const content = (await window.ipcRenderer.invoke('file-read', filePath)) || '';

      // 从路径提取文件名
      const pathParts = filePath.replace(/\\/g, '/').split('/');
      const fileName = pathParts[pathParts.length - 1] || 'unknown';

      // 生成唯一 ID
      const id = `${Date.now()}-${Math.random().toString(36).substring(2)}`;

      const newTab: TabItem = {
        id,
        name: fileName,
        path: filePath,
        isModified: false,
        content,
      };

      state.value.openTabs.push(newTab);
      state.value.activeTabId = newTab.id;

      return newTab;
    } catch (error) {
      console.error('通过路径打开标签页失败:', error);
      return null;
    }
  };

  /**
   * 恢复工作区状态（应用启动时调用）
   */
  const restoreWorkspace = async () => {
    // 避免重复恢复
    if (isWorkspaceRestored.value || isRestoring.value) return;
    if (!window.ipcRenderer) return;

    isRestoring.value = true;
    try {
      const data: WorkspaceData | null = await window.ipcRenderer.invoke(
        'config-read',
        WORKSPACE_FILE,
      );
      if (!data || !data.openTabPaths || data.openTabPaths.length === 0) {
        isWorkspaceRestored.value = true;
        return;
      }

      // 清空现有标签页（避免重复）
      state.value.openTabs = [];
      state.value.activeTabId = null;

      // 根据路径重新打开标签页
      for (const filePath of data.openTabPaths) {
        await openTabByPath(filePath);
      }

      // 恢复激活状态
      if (data.activeTabPath) {
        const tab = state.value.openTabs.find((t) => t.path === data.activeTabPath);
        if (tab) {
          state.value.activeTabId = tab.id;
        }
      }

      isWorkspaceRestored.value = true;
    } catch (error) {
      console.error('恢复工作区状态失败:', error);
      isWorkspaceRestored.value = true;
    } finally {
      isRestoring.value = false;
    }
  };

  /**
   * 打开标签页
   * 如果标签页已存在，则切换到该标签页
   * 如果不存在，则创建新标签页并切换
   */
  const openTab = async (note: NoteItem) => {
    if (note.isFolder) return;

    // 检查标签页是否已存在（通过路径匹配，因为恢复的标签页 id 不同）
    const existingTab = state.value.openTabs.find((tab) => tab.path === note.path);

    if (existingTab) {
      // 切换到已存在的标签页
      state.value.activeTabId = existingTab.id;
      return;
    }

    // 读取文件内容
    let content = '';
    if (window.ipcRenderer) {
      try {
        content = (await window.ipcRenderer.invoke('file-read', note.path)) || '';
      } catch (error) {
        console.error('读取文件失败:', error);
      }
    }

    // 创建新标签页
    const newTab: TabItem = {
      id: note.id,
      name: note.name,
      path: note.path,
      isModified: false,
      content,
    };

    // 添加到标签页列表并激活
    state.value.openTabs.push(newTab);
    state.value.activeTabId = newTab.id;

    // 保存工作区状态
    await saveWorkspace();
  };

  /**
   * 关闭指定标签页
   */
  const closeTab = async (tabId: string) => {
    const index = state.value.openTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;

    // 如果关闭的是当前激活的标签页，需要切换到其他标签页
    if (state.value.activeTabId === tabId) {
      // 优先切换到右边的标签页，没有则切换到左边
      if (state.value.openTabs.length > 1) {
        const newActiveIndex = index < state.value.openTabs.length - 1 ? index + 1 : index - 1;
        const nextTab = state.value.openTabs[newActiveIndex];
        state.value.activeTabId = nextTab ? nextTab.id : null;
      } else {
        state.value.activeTabId = null;
      }
    }

    // 移除标签页
    state.value.openTabs.splice(index, 1);

    // 保存工作区状态
    await saveWorkspace();
  };

  /**
   * 关闭其他所有标签页
   */
  const closeOtherTabs = async (tabId: string) => {
    const tab = state.value.openTabs.find((t) => t.id === tabId);
    if (!tab) return;

    state.value.openTabs = [tab];
    state.value.activeTabId = tabId;

    // 保存工作区状态
    await saveWorkspace();
  };

  /**
   * 关闭右侧所有标签页
   */
  const closeTabsToRight = async (tabId: string) => {
    const index = state.value.openTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;

    // 保留当前及左侧的标签页
    state.value.openTabs = state.value.openTabs.slice(0, index + 1);

    // 如果当前激活的标签页被关闭，切换到保留的最后一个
    if (!state.value.openTabs.find((tab) => tab.id === state.value.activeTabId)) {
      state.value.activeTabId = state.value.openTabs[state.value.openTabs.length - 1]?.id || null;
    }

    // 保存工作区状态
    await saveWorkspace();
  };

  /**
   * 关闭左侧所有标签页
   */
  const closeTabsToLeft = async (tabId: string) => {
    const index = state.value.openTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;

    // 保留当前及右侧的标签页
    state.value.openTabs = state.value.openTabs.slice(index);

    // 如果当前激活的标签页被关闭，切换到保留的第一个
    if (!state.value.openTabs.find((tab) => tab.id === state.value.activeTabId)) {
      state.value.activeTabId = state.value.openTabs[0]?.id || null;
    }

    // 保存工作区状态
    await saveWorkspace();
  };

  /**
   * 关闭所有标签页
   */
  const closeAllTabs = async () => {
    state.value.openTabs = [];
    state.value.activeTabId = null;

    // 保存工作区状态
    await saveWorkspace();
  };

  /**
   * 切换到指定标签页
   */
  const switchTab = async (tabId: string) => {
    const tab = state.value.openTabs.find((t) => t.id === tabId);
    if (tab) {
      state.value.activeTabId = tabId;

      // 保存工作区状态
      await saveWorkspace();
    }
  };

  /**
   * 更新标签页内容
   */
  const updateTabContent = (tabId: string, content: string) => {
    const tab = state.value.openTabs.find((t) => t.id === tabId);
    if (tab) {
      tab.content = content;
      tab.isModified = true;
    }
  };

  /**
   * 保存标签页
   */
  const saveTab = async (tabId?: string): Promise<boolean> => {
    const targetId = tabId || state.value.activeTabId;
    if (!targetId) return false;

    const tab = state.value.openTabs.find((t) => t.id === targetId);
    if (!tab || !window.ipcRenderer) return false;

    try {
      await window.ipcRenderer.invoke('file-write', {
        path: tab.path,
        content: tab.content,
      });
      tab.isModified = false;
      return true;
    } catch (error) {
      console.error('保存文件失败:', error);
      return false;
    }
  };

  /**
   * 在资源管理器中显示
   */
  const showTabInExplorer = async (tabId: string) => {
    const tab = state.value.openTabs.find((t) => t.id === tabId);
    if (!tab || !window.ipcRenderer) return;
    await window.ipcRenderer.invoke('file-show-in-explorer', tab.path);
  };

  /**
   * 复制标签页文件路径
   */
  const copyTabPath = async (tabId: string) => {
    const tab = state.value.openTabs.find((t) => t.id === tabId);
    if (!tab || !window.ipcRenderer) return;
    await window.ipcRenderer.invoke('clipboard-write', tab.path);
  };

  // 客户端初始化时恢复工作区
  if (import.meta.client && !isWorkspaceRestored.value && !isRestoring.value) {
    restoreWorkspace();
  }

  return {
    // 状态
    openTabs: computed(() => state.value.openTabs),
    activeTabId: computed(() => state.value.activeTabId),
    activeTab,
    hasOpenTabs: computed(() => state.value.openTabs.length > 0),
    isWorkspaceRestored: computed(() => isWorkspaceRestored.value),

    // 方法
    openTab,
    openTabByPath,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    closeTabsToLeft,
    closeAllTabs,
    switchTab,
    updateTabContent,
    saveTab,
    showTabInExplorer,
    copyTabPath,
    restoreWorkspace,
    saveWorkspace,
  };
}
