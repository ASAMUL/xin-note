/**
 * 标签页管理 composable
 * 负责多标签页的打开、关闭、切换等操作
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

export function useTabs() {
  // 标签页状态（使用 useState 保证跨组件共享）
  const state = useState<TabsState>('tabs-state', () => ({
    openTabs: [],
    activeTabId: null,
  }));

  // 获取当前激活的标签页
  const activeTab = computed(() => {
    if (!state.value.activeTabId) return null;
    return state.value.openTabs.find((tab) => tab.id === state.value.activeTabId) || null;
  });

  /**
   * 打开标签页
   * 如果标签页已存在，则切换到该标签页
   * 如果不存在，则创建新标签页并切换
   */
  const openTab = async (note: NoteItem) => {
    if (note.isFolder) return;

    // 检查标签页是否已存在
    const existingTab = state.value.openTabs.find((tab) => tab.id === note.id);

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
  };

  /**
   * 关闭指定标签页
   */
  const closeTab = (tabId: string) => {
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
  };

  /**
   * 关闭其他所有标签页
   */
  const closeOtherTabs = (tabId: string) => {
    const tab = state.value.openTabs.find((t) => t.id === tabId);
    if (!tab) return;

    state.value.openTabs = [tab];
    state.value.activeTabId = tabId;
  };

  /**
   * 关闭右侧所有标签页
   */
  const closeTabsToRight = (tabId: string) => {
    const index = state.value.openTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;

    // 保留当前及左侧的标签页
    state.value.openTabs = state.value.openTabs.slice(0, index + 1);

    // 如果当前激活的标签页被关闭，切换到保留的最后一个
    if (!state.value.openTabs.find((tab) => tab.id === state.value.activeTabId)) {
      state.value.activeTabId = state.value.openTabs[state.value.openTabs.length - 1]?.id || null;
    }
  };

  /**
   * 关闭左侧所有标签页
   */
  const closeTabsToLeft = (tabId: string) => {
    const index = state.value.openTabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;

    // 保留当前及右侧的标签页
    state.value.openTabs = state.value.openTabs.slice(index);

    // 如果当前激活的标签页被关闭，切换到保留的第一个
    if (!state.value.openTabs.find((tab) => tab.id === state.value.activeTabId)) {
      state.value.activeTabId = state.value.openTabs[0]?.id || null;
    }
  };

  /**
   * 关闭所有标签页
   */
  const closeAllTabs = () => {
    state.value.openTabs = [];
    state.value.activeTabId = null;
  };

  /**
   * 切换到指定标签页
   */
  const switchTab = (tabId: string) => {
    const tab = state.value.openTabs.find((t) => t.id === tabId);
    if (tab) {
      state.value.activeTabId = tabId;
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

  return {
    // 状态
    openTabs: computed(() => state.value.openTabs),
    activeTabId: computed(() => state.value.activeTabId),
    activeTab,
    hasOpenTabs: computed(() => state.value.openTabs.length > 0),

    // 方法
    openTab,
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
  };
}
