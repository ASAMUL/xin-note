import { formatLastSavedTime } from '~/utils/datetime';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export interface SaveStatusInfo {
  icon: string;
  text: string;
  color: string;
}

/**
 * 编辑器内容同步 + 自动保存（基于 useTabs）
 * - 监听 v-model 的 editorContent：更新当前 tab 内容 + 标记未保存 + 延迟自动保存
 * - 监听 activeTab：切换时把 tab.content 写入 editorContent（并避免被误判为用户修改）
 */
export const useEditorAutoSave = () => {
  const { activeTab, updateTabContent, saveTab } = useTabs();
  const { autoSaveDelay } = useSettings();

  // 编辑器内容（双向绑定用）
  const editorContent = ref('');

  // 自动保存定时器
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // 保存状态
  const saveStatus = ref<SaveStatus>('saved');

  // 上次保存时间
  const lastSavedTime = ref<Date | null>(null);

  // 是否正在通过程序设置内容（用于防止误判为用户修改）
  const isSettingContent = ref(false);

  // 触发自动保存
  const triggerAutoSave = () => {
    // 清除之前的定时器
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }

    // 设置新的定时器
    autoSaveTimer = setTimeout(async () => {
      await performSave();
    }, autoSaveDelay.value);
  };

  // 执行保存
  const performSave = async () => {
    if (!activeTab.value || !activeTab.value.isModified) return;

    saveStatus.value = 'saving';
    const success = await saveTab();
    saveStatus.value = success ? 'saved' : 'unsaved';

    // 更新上次保存时间
    if (success) {
      lastSavedTime.value = new Date();
    }
  };

  // 监听编辑器内容变化（用户输入）
  watch(editorContent, (newContent) => {
    if (!activeTab.value) return;

    // 如果是程序设置内容，不视为用户修改
    if (isSettingContent.value) return;

    // 更新标签页内容
    updateTabContent(activeTab.value.id, newContent);
    saveStatus.value = 'unsaved';

    // 触发自动保存
    triggerAutoSave();
  });

  // 监听活动标签页变化，加载内容
  watch(
    () => activeTab.value,
    (tab) => {
      // 设置标志位，防止内容切换被误判为用户修改
      isSettingContent.value = true;

      if (tab) {
        editorContent.value = tab.content || '';
        saveStatus.value = tab.isModified ? 'unsaved' : 'saved';
        // 重置上次保存时间（切换标签页时）
        lastSavedTime.value = tab.isModified ? null : new Date();
      } else {
        editorContent.value = '';
        saveStatus.value = 'saved';
        lastSavedTime.value = null;
      }

      // 使用 nextTick 确保在编辑器更新完成后重置标志位
      nextTick(() => {
        isSettingContent.value = false;
      });
    },
    { immediate: true, deep: true },
  );

  // 清理定时器
  onBeforeUnmount(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
  });

  // 保存状态图标和文字
  const saveStatusInfo = computed<SaveStatusInfo>(() => {
    switch (saveStatus.value) {
      case 'saved': {
        const timeText = lastSavedTime.value ? formatLastSavedTime(lastSavedTime.value) : '已保存';
        return { icon: '', text: timeText, color: 'text-(--text-mute)' };
      }
      case 'saving':
        return { icon: 'i-lucide-loader-2', text: '保存中...', color: 'text-yellow-500' };
      case 'unsaved':
        return { icon: 'i-lucide-circle', text: '未保存', color: 'text-orange-500' };
      default:
        return { icon: '', text: '', color: '' };
    }
  });

  return {
    activeTab,
    editorContent,
    saveStatus,
    saveStatusInfo,
  };
};

