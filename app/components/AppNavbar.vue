<script setup lang="ts">
import SaveAsDialog from '~/components/dialogs/SaveAsDialog.vue';
import ShortcutsDialog from '~/components/dialogs/ShortcutsDialog.vue';
import DocsDialog from '~/components/dialogs/DocsDialog.vue';
import AboutDialog from '~/components/dialogs/AboutDialog.vue';
import SettingsDialog from '~/components/settings/SettingsDialog.vue';

const { t, locale } = useI18n();

// 设置
const { notesDirectory, selectNotesDirectory } = useSettings();
const showSettings = ref(false);

// 布局（AI 侧边栏等）
const { toggleAiSidebar, toggleLeftSidebar, toggleZenMode } = useLayoutState();

// 命令面板状态
const searchOpen = ref(false);

// 笔记操作
const { createNote, loadNotes } = useNotes();

// Tab 操作（用于保存快捷键）
const { saveTab, activeTab, openTabByPath } = useTabs();

const toast = useToast();

/**
 * ========== 顶部菜单动作 ==========
 */
const handleCreateNoteFromMenu = async () => {
  // 未设置笔记目录时，先提示选择目录
  if (!notesDirectory.value) {
    await selectNotesDirectory();
  }
  if (!notesDirectory.value) return;

  // 默认在当前活动 tab 的目录创建（与 AppSidebar 行为一致）
  let parentDir: string | undefined;
  if (activeTab.value?.path) {
    const p = activeTab.value.path;
    parentDir = p.substring(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
  }

  await createNote(t('app.noteDefaultName') + '.md', parentDir);
};

const handleOpenWorkspaceFolder = async () => {
  const folder = await selectNotesDirectory();
  if (folder) {
    toast.add({
      title: t('navbar.toast.openWorkspaceFolderSuccess'),
      description: folder,
      color: 'primary',
    });
  }
};

const handleOpenMarkdownFile = async () => {
  if (!window.ipcRenderer) {
    toast.add({ title: t('navbar.toast.unsupportedFileOperation'), color: 'error' });
    return;
  }
  try {
    const filePath = (await window.ipcRenderer.invoke('dialog-open-md-file')) as string | null;
    if (!filePath) return;

    const tab = await openTabByPath(filePath);
    if (!tab) {
      toast.add({ title: t('common.toast.openFileFailed'), color: 'error' });
      return;
    }
    toast.add({
      title: t('navbar.toast.openFileSuccess'),
      description: tab.name,
      color: 'primary',
    });
  } catch (error) {
    console.error('打开文件失败:', error);
    toast.add({ title: t('common.toast.openFileFailed'), color: 'error' });
  }
};

const handleSaveFromMenu = async () => {
  if (!activeTab.value) {
    toast.add({ title: t('navbar.toast.noEditingFile'), color: 'neutral' });
    return;
  }
  const ok = await saveTab();
  toast.add({
    title: ok ? t('common.toast.manualSaveSuccess') : t('common.toast.manualSaveFailed'),
    color: ok ? 'primary' : 'error',
  });
};

const sendEditorCommand = (
  channel: 'edit-undo' | 'edit-redo' | 'edit-cut' | 'edit-copy' | 'edit-paste',
) => {
  window.ipcRenderer?.send(channel);
};

// 另存为（复制当前文件）
const showSaveAs = ref(false);
const getParentDir = (p: string) =>
  p.substring(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
const saveAsDefaultDirectory = computed(() => {
  const p = activeTab.value?.path;
  if (p) return getParentDir(p);
  return notesDirectory.value || '';
});
const saveAsDefaultFileName = computed(() => {
  const base = activeTab.value?.name?.replace(/\.md$/i, '') || t('app.noteDefaultName');
  return `${base} - ${t('app.noteDefaultCopyName')}.md`;
});

const openSaveAsDialog = () => {
  if (!activeTab.value) {
    toast.add({ title: t('navbar.toast.noEditingFile'), color: 'neutral' });
    return;
  }
  showSaveAs.value = true;
};

const handleSaveAsConfirm = async (payload: { directory: string; fileName: string }) => {
  if (!window.ipcRenderer) {
    toast.add({ title: t('navbar.toast.unsupportedFileOperation'), color: 'error' });
    return;
  }
  if (!activeTab.value) {
    toast.add({ title: t('navbar.toast.noEditingFile'), color: 'neutral' });
    return;
  }

  try {
    const newPath = (await window.ipcRenderer.invoke('file-create', {
      directory: payload.directory,
      fileName: payload.fileName,
      content: activeTab.value.content || '',
    })) as string | null;

    if (!newPath) {
      toast.add({ title: t('navbar.toast.createCopyFailed'), color: 'error' });
      return;
    }

    // 刷新笔记树（若副本在当前工作区内，会立刻可见）
    await loadNotes();

    toast.add({
      title: '已创建副本',
      description: newPath,
      color: 'primary',
    });
  } catch (error) {
    console.error('另存为失败:', error);
    toast.add({ title: t('navbar.toast.createCopyFailed'), color: 'error' });
  }
};

// 帮助弹窗
const showShortcuts = ref(false);
const showDocs = ref(false);
const showAbout = ref(false);

// 全局快捷键注册（集中管理所有快捷键回调）
useShortcuts({
  onOpenSettings: () => {
    showSettings.value = true;
  },
  onOpenSearch: () => {
    searchOpen.value = true;
  },
  onCreateNote: () => {
    void handleCreateNoteFromMenu();
  },
  onSaveNote: () => {
    void handleSaveFromMenu();
  },
});

// 窗口控制
const isMaximized = ref(false);

// 初始化时获取最大化状态
onMounted(async () => {
  if (window.ipcRenderer) {
    isMaximized.value = await window.ipcRenderer.invoke('window-is-maximized');
  }
});

const minimizeWindow = () => {
  window.ipcRenderer?.send('window-minimize');
};

const toggleMaximize = async () => {
  window.ipcRenderer?.send('window-toggle-maximize');
  // 延迟获取最新状态
  await nextTick();
  if (window.ipcRenderer) {
    isMaximized.value = await window.ipcRenderer.invoke('window-is-maximized');
  }
};

// 关闭确认弹窗
const { closeAction, setCloseAction } = useWindowPreferences();
const showCloseConfirm = ref(false);
const rememberChoice = ref(false);

// 处理关闭按钮点击
const handleCloseClick = () => {
  // 如果用户已设置偏好，直接执行
  if (closeAction.value === 'minimize') {
    minimizeWindow();
    return;
  }
  if (closeAction.value === 'close') {
    window.ipcRenderer?.send('window-close');
    return;
  }
  // 否则显示确认弹窗
  showCloseConfirm.value = true;
  rememberChoice.value = false;
};

// 执行最小化
const doMinimize = () => {
  if (rememberChoice.value) {
    setCloseAction('minimize');
  }
  showCloseConfirm.value = false;
  minimizeWindow();
};

// 执行关闭
const doClose = () => {
  if (rememberChoice.value) {
    setCloseAction('close');
  }
  showCloseConfirm.value = false;
  window.ipcRenderer?.send('window-close');
};

// 导航菜单项
const navItems = computed(() => {
  // 强制依赖 locale，确保切换语言后菜单 label 重新计算
  void locale.value;
  return [
    {
      label: t('navbar.file.title'),
      icon: 'i-lucide-file',
      children: [
        {
          label: t('navbar.file.new'),
          icon: 'i-lucide-file-plus',
          onSelect: handleCreateNoteFromMenu,
        },
        {
          label: t('navbar.file.folder'),
          icon: 'i-lucide-folder-open',
          onSelect: handleOpenWorkspaceFolder,
        },
        {
          label: t('navbar.file.open'),
          icon: 'i-lucide-file-text',
          onSelect: handleOpenMarkdownFile,
        },
        {
          label: t('navbar.file.save'),
          icon: 'i-lucide-save',
          shortcut: 'Ctrl+S',
          onSelect: handleSaveFromMenu,
        },
        {
          label: t('navbar.file.saveAs'),
          icon: 'i-lucide-save-all',
          onSelect: openSaveAsDialog,
        },
      ],
    },
    {
      label: t('navbar.edit.title'),
      icon: 'i-lucide-pencil',
      children: [
        {
          label: t('navbar.edit.undo'),
          icon: 'i-lucide-undo',
          shortcut: 'Ctrl+Z',
          onSelect: () => sendEditorCommand('edit-undo'),
        },
        {
          label: t('navbar.edit.redo'),
          icon: 'i-lucide-redo',
          shortcut: 'Ctrl+Y',
          onSelect: () => sendEditorCommand('edit-redo'),
        },
        {
          label: t('navbar.edit.cut'),
          icon: 'i-lucide-scissors',
          shortcut: 'Ctrl+X',
          onSelect: () => sendEditorCommand('edit-cut'),
        },
        {
          label: t('navbar.edit.copy'),
          icon: 'i-lucide-copy',
          shortcut: 'Ctrl+C',
          onSelect: () => sendEditorCommand('edit-copy'),
        },
        {
          label: t('navbar.edit.paste'),
          icon: 'i-lucide-clipboard',
          shortcut: 'Ctrl+V',
          onSelect: () => sendEditorCommand('edit-paste'),
        },
      ],
    },
    {
      label: t('navbar.view.title'),
      icon: 'i-lucide-layout-grid',
      children: [
        {
          label: t('navbar.view.fullscreen'),
          icon: 'i-lucide-maximize',
          shortcut: 'F11',
          onSelect: () => window.ipcRenderer?.send('window-toggle-fullscreen'),
        },
        {
          label: t('navbar.view.zenMode'),
          icon: 'i-lucide-focus',
          onSelect: toggleZenMode,
        },
        {
          label: t('navbar.view.sidebar'),
          icon: 'i-lucide-panel-left',
          onSelect: toggleLeftSidebar,
        },
        {
          label: t('navbar.view.aiAssistant'),
          icon: 'i-lucide-sparkles',
          shortcut: 'Ctrl+L',
          onSelect: toggleAiSidebar,
        },
      ],
    },
    {
      label: t('navbar.help.title'),
      icon: 'i-lucide-help-circle',
      children: [
        {
          label: t('navbar.help.shortcuts'),
          icon: 'i-lucide-keyboard',
          onSelect: () => (showShortcuts.value = true),
        },
        {
          label: t('navbar.help.docs'),
          icon: 'i-lucide-book-open',
          onSelect: () => (showDocs.value = true),
        },
        {
          label: t('navbar.help.about'),
          icon: 'i-lucide-info',
          onSelect: () => (showAbout.value = true),
        },
      ],
    },
  ];
});
</script>

<template>
  <header class="app-navbar">
    <!-- 窗口拖动区域 -->
    <div class="drag-region" />

    <!-- 左侧：Logo + 导航 -->
    <div class="navbar-left">
      <!-- Logo -->
      <div class="logo-section">
        <div class="logo">
          <UIcon name="i-lucide-feather" class="w-5 h-5" />
        </div>
        <span class="logo-text">{{ $t('app.name') }}</span>
      </div>

      <!-- 导航菜单 -->
      <nav class="nav-menu">
        <UNavigationMenu
          :items="navItems"
          variant="link"
          :ui="{
            link: 'px-2.5 py-1.5 text-xs font-medium',
            linkLeadingIcon: 'hidden',
          }"
        />
      </nav>
    </div>

    <!-- 中间：搜索栏 -->
    <div class="navbar-center">
      <button class="search-trigger" @click="searchOpen = true">
        <UIcon name="i-lucide-search" class="w-4 h-4" />
        <span>{{ $t('navbar.search.placeholder') }}</span>
        <kbd>Ctrl+P</kbd>
      </button>
    </div>

    <!-- 右侧：工具栏 + 窗口控制 -->
    <div class="navbar-right">
      <!-- 工具栏 -->
      <div class="toolbar">
        <UTooltip :text="$t('navbar.toolbar.sync')">
          <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-cloud" />
        </UTooltip>
        <UTooltip :text="$t('navbar.toolbar.settings')">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-settings"
            @click="showSettings = true"
          />
        </UTooltip>
      </div>

      <!-- 窗口控制按钮 -->
      <div class="window-controls">
        <button class="control-btn" @click="minimizeWindow" :title="$t('navbar.window.minimize')">
          <UIcon name="i-lucide-minus" class="w-4 h-4" />
        </button>
        <button
          class="control-btn"
          @click="toggleMaximize"
          :title="isMaximized ? $t('navbar.window.restore') : $t('navbar.window.maximize')"
        >
          <UIcon :name="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="w-3.5 h-3.5" />
        </button>
        <button
          class="control-btn control-btn--close"
          @click="handleCloseClick"
          :title="$t('navbar.window.close')"
        >
          <UIcon name="i-lucide-x" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 搜索命令面板 -->
    <CommandPalette v-model:open="searchOpen" @open-settings="showSettings = true" />

    <!-- 另存为弹窗（复制当前文件） -->
    <SaveAsDialog
      v-model:open="showSaveAs"
      :default-directory="saveAsDefaultDirectory"
      :default-file-name="saveAsDefaultFileName"
      @confirm="handleSaveAsConfirm"
    />

    <!-- 帮助弹窗 -->
    <ShortcutsDialog v-model:open="showShortcuts" />
    <DocsDialog v-model:open="showDocs" />
    <AboutDialog v-model:open="showAbout" />

    <!-- 关闭确认弹窗 -->
    <UModal v-model:open="showCloseConfirm">
      <template #content>
        <div class="close-confirm-dialog">
          <!-- 头部 -->
          <div class="dialog-header">
            <div class="dialog-icon">
              <UIcon name="i-lucide-log-out" class="w-6 h-6" />
            </div>
            <h3 class="dialog-title">{{ $t('navbar.window.closeApplication') }}</h3>
            <p class="dialog-description">{{ $t('navbar.window.pleaseSelectOperation') }}</p>
          </div>

          <!-- 选项按钮 -->
          <div class="dialog-options">
            <button class="option-btn option-minimize" @click="doMinimize">
              <UIcon name="i-lucide-minus-circle" class="w-5 h-5" />
              <span class="option-title">{{ $t('navbar.window.minimizeToTray') }}</span>
              <span class="option-desc">{{ $t('navbar.window.runInBackground') }}</span>
            </button>
            <button class="option-btn option-close" @click="doClose">
              <UIcon name="i-lucide-power" class="w-5 h-5" />
              <span class="option-title">{{ $t('navbar.window.closeApplication') }}</span>
              <span class="option-desc">{{ $t('navbar.window.entireCloseApplication') }}</span>
            </button>
          </div>

          <!-- 记住选择 -->
          <div class="dialog-footer">
            <UCheckbox v-model="rememberChoice" :label="$t('navbar.window.rememberChoice')" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 设置弹窗（大弹窗 + 左侧菜单） -->
    <SettingsDialog v-model:open="showSettings" />
  </header>
</template>

<style scoped>
.app-navbar {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  background-color: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
  position: relative;
  user-select: none;
}

/* 窗口拖动区域 - 覆盖整个导航栏 */
.drag-region {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
  pointer-events: none;
}

/* 让交互元素可点击 */
.navbar-left,
.navbar-center,
.navbar-right,
.nav-menu,
.search-trigger,
.toolbar,
.window-controls {
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

/* 左侧区域 */
.navbar-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-left: 0.75rem;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-right: 0.75rem;
  border-right: 1px solid var(--border-color);
}

.logo {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  border-radius: 6px;
  color: white;
}

.logo-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-main);
  letter-spacing: -0.025em;
}

.nav-menu {
  display: flex;
  align-items: center;
}

/* 中间搜索区域 */
.navbar-center {
  flex: 1;
  max-width: 400px;
  padding: 0 1.5rem;
}

.search-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--text-mute);
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-trigger:hover {
  border-color: var(--accent-color);
  background-color: var(--bg-paper);
}

.search-trigger kbd {
  margin-left: auto;
  padding: 0.125rem 0.375rem;
  background-color: var(--bg-sidebar);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.625rem;
  font-family: inherit;
}

/* 右侧区域 */
.navbar-right {
  display: flex;
  align-items: center;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-right: 0.75rem;
  border-right: 1px solid var(--border-color);
  margin-right: 0.5rem;
}

/* 窗口控制按钮 */
.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--text-mute);
  cursor: pointer;
  transition: all 0.15s ease;
}

.control-btn:hover {
  background-color: var(--bg-app);
  color: var(--text-main);
}

.control-btn--close:hover {
  background-color: var(--color-error);
  color: white;
}

/* 深色模式调整 */
.dark .search-trigger {
  background-color: var(--bg-paper);
}

.dark .search-trigger:hover {
  background-color: var(--bg-popup);
}

/* 关闭确认弹窗样式 */
.close-confirm-dialog {
  padding: 1.5rem;
  text-align: center;
}

.dialog-header {
  margin-bottom: 1.5rem;
}

.dialog-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  border-radius: 12px;
  color: white;
}

.dialog-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0 0 0.25rem;
}

.dialog-description {
  font-size: 0.875rem;
  color: var(--text-mute);
  margin: 0;
}

.dialog-options {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.option-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-btn:hover {
  border-color: var(--accent-color);
  background-color: var(--bg-paper);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--shadow-color);
}

.option-minimize:hover {
  border-color: var(--color-info);
}

.option-minimize:hover .option-title {
  color: var(--color-info);
}

.option-close:hover {
  border-color: var(--color-error);
}

.option-close:hover .option-title {
  color: var(--color-error);
}

.option-btn .option-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-main);
}

.option-btn .option-desc {
  font-size: 0.75rem;
  color: var(--text-mute);
}

.dialog-footer {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: center;
}

/* 深色模式调整 */
.dark .option-btn {
  background-color: var(--bg-paper);
}

.dark .option-btn:hover {
  background-color: var(--bg-popup);
  box-shadow: 0 4px 12px var(--shadow-color);
}
</style>
