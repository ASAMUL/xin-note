<script setup lang="ts">
// 设置
const {
  notesDirectory,
  selectNotesDirectory,
  aiApiKey,
  aiBaseUrl,
  aiModel,
  setAiApiKey,
  setAiBaseUrl,
  setAiModel,
} = useSettings();
const showSettings = ref(false);

// AI 设置（用草稿值编辑，点击保存后写入 settings.json）
const aiKeyDraft = ref('');
const aiBaseUrlDraft = ref('');
const aiModelDraft = ref('');
const showAiKey = ref(false);

watch(
  () => showSettings.value,
  (open) => {
    if (!open) return;
    aiKeyDraft.value = aiApiKey.value || '';
    aiBaseUrlDraft.value = aiBaseUrl.value || 'https://api.openai.com/v1';
    aiModelDraft.value = aiModel.value || 'gpt-4o-mini';
  },
);

const saveAiSettings = async () => {
  await setAiBaseUrl(aiBaseUrlDraft.value);
  await setAiModel(aiModelDraft.value);
  await setAiApiKey(aiKeyDraft.value);
};

// 命令面板状态
const searchOpen = ref(false);

// 笔记操作
const { createNote } = useNotes();

// Tab 操作（用于保存快捷键）
const { saveTab } = useTabs();

const toast = useToast();
// 全局快捷键注册（集中管理所有快捷键回调）
useShortcuts({
  onOpenSettings: () => {
    showSettings.value = true;
  },
  onOpenSearch: () => {
    searchOpen.value = true;
  },
  onCreateNote: () => {
    createNote();
  },
  onSaveNote: () => {
    saveTab().then((result) => {
      console.log('saveTab result', result);
      if (result) {
        toast.add({
          title: '已手动保存',
          color: 'primary',
        });
      }
    });
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
const navItems = ref([
  {
    label: '文件',
    icon: 'i-lucide-file',
    children: [
      { label: '新建笔记', icon: 'i-lucide-file-plus' },
      { label: '打开...', icon: 'i-lucide-folder-open' },
      { type: 'separator' },
      { label: '保存', icon: 'i-lucide-save', shortcut: 'Ctrl+S' },
      { label: '另存为...', icon: 'i-lucide-save-all' },
    ],
  },
  {
    label: '编辑',
    icon: 'i-lucide-pencil',
    children: [
      { label: '撤销', icon: 'i-lucide-undo', shortcut: 'Ctrl+Z' },
      { label: '重做', icon: 'i-lucide-redo', shortcut: 'Ctrl+Y' },
      { type: 'separator' },
      { label: '剪切', icon: 'i-lucide-scissors', shortcut: 'Ctrl+X' },
      { label: '复制', icon: 'i-lucide-copy', shortcut: 'Ctrl+C' },
      { label: '粘贴', icon: 'i-lucide-clipboard', shortcut: 'Ctrl+V' },
    ],
  },
  {
    label: '视图',
    icon: 'i-lucide-layout-grid',
    children: [
      { label: '全屏', icon: 'i-lucide-maximize', shortcut: 'F11' },
      { label: '禅模式', icon: 'i-lucide-focus' },
      { type: 'separator' },
      { label: '侧边栏', icon: 'i-lucide-panel-left' },
      { label: 'AI 助手', icon: 'i-lucide-sparkles', shortcut: 'Ctrl+L' },
    ],
  },
  {
    label: '帮助',
    icon: 'i-lucide-help-circle',
    children: [
      { label: '快捷键', icon: 'i-lucide-keyboard' },
      { label: '文档', icon: 'i-lucide-book-open' },
      { type: 'separator' },
      { label: '关于 Lumina', icon: 'i-lucide-info' },
    ],
  },
]);
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
        <span class="logo-text">Lumina</span>
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
        <span>搜索笔记...</span>
        <kbd>Ctrl+P</kbd>
      </button>
    </div>

    <!-- 右侧：工具栏 + 窗口控制 -->
    <div class="navbar-right">
      <!-- 工具栏 -->
      <div class="toolbar">
        <UTooltip text="同步">
          <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-cloud" />
        </UTooltip>
        <UTooltip text="设置">
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
        <button class="control-btn" @click="minimizeWindow" title="最小化">
          <UIcon name="i-lucide-minus" class="w-4 h-4" />
        </button>
        <button
          class="control-btn"
          @click="toggleMaximize"
          :title="isMaximized ? '还原' : '最大化'"
        >
          <UIcon :name="isMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="w-3.5 h-3.5" />
        </button>
        <button class="control-btn control-btn--close" @click="handleCloseClick" title="关闭">
          <UIcon name="i-lucide-x" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 搜索命令面板 -->
    <CommandPalette v-model:open="searchOpen" @open-settings="showSettings = true" />

    <!-- 关闭确认弹窗 -->
    <UModal v-model:open="showCloseConfirm">
      <template #content>
        <div class="close-confirm-dialog">
          <!-- 头部 -->
          <div class="dialog-header">
            <div class="dialog-icon">
              <UIcon name="i-lucide-log-out" class="w-6 h-6" />
            </div>
            <h3 class="dialog-title">关闭应用</h3>
            <p class="dialog-description">请选择你想要的操作</p>
          </div>

          <!-- 选项按钮 -->
          <div class="dialog-options">
            <button class="option-btn option-minimize" @click="doMinimize">
              <UIcon name="i-lucide-minus-circle" class="w-5 h-5" />
              <span class="option-title">最小化到托盘</span>
              <span class="option-desc">应用将在后台运行</span>
            </button>
            <button class="option-btn option-close" @click="doClose">
              <UIcon name="i-lucide-power" class="w-5 h-5" />
              <span class="option-title">退出应用</span>
              <span class="option-desc">完全关闭程序</span>
            </button>
          </div>

          <!-- 记住选择 -->
          <div class="dialog-footer">
            <UCheckbox v-model="rememberChoice" label="记住我的选择，下次不再询问" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 设置弹窗 -->
    <UModal v-model:open="showSettings" :ui="{ content: 'max-w-md' }">
      <template #content>
        <div class="settings-dialog">
          <!-- 头部 -->
          <div class="settings-header">
            <div class="settings-icon">
              <UIcon name="i-lucide-settings" class="w-5 h-5" />
            </div>
            <h3 class="settings-title">设置</h3>
          </div>

          <!-- 设置项 -->
          <div class="settings-content">
            <!-- 笔记存储目录 -->
            <div class="settings-item">
              <div class="settings-item-header">
                <UIcon name="i-lucide-folder" class="w-4 h-4" />
                <span class="settings-item-label">笔记存储目录</span>
              </div>
              <div class="settings-item-value">
                <span v-if="notesDirectory" class="directory-path">{{ notesDirectory }}</span>
                <span v-else class="directory-empty">未设置</span>
                <UButton
                  variant="soft"
                  color="primary"
                  size="xs"
                  icon="i-lucide-folder-open"
                  @click="selectNotesDirectory()"
                >
                  {{ notesDirectory ? '更改' : '选择' }}
                </UButton>
              </div>
            </div>

            <!-- AI 配置 -->
            <div class="settings-item">
              <div class="settings-item-header">
                <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
                <span class="settings-item-label">AI 配置</span>
              </div>

              <div class="flex flex-col gap-2">
                <UInput
                  v-model="aiBaseUrlDraft"
                  size="sm"
                  icon="i-lucide-link"
                  placeholder="Base URL（例如 https://api.openai.com/v1）"
                />
                <UInput
                  v-model="aiModelDraft"
                  size="sm"
                  icon="i-lucide-box"
                  placeholder="模型（例如 gpt-4o-mini）"
                />
                <UInput
                  v-model="aiKeyDraft"
                  size="sm"
                  :type="showAiKey ? 'text' : 'password'"
                  icon="i-lucide-key"
                  placeholder="API Key（仅保存在本地 settings.json）"
                >
                  <template #trailing>
                    <UButton
                      :icon="showAiKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      @click="showAiKey = !showAiKey"
                    />
                  </template>
                </UInput>
              </div>

              <div class="flex justify-end gap-2 mt-2">
                <UButton
                  variant="soft"
                  color="primary"
                  size="xs"
                  icon="i-lucide-save"
                  @click="saveAiSettings"
                >
                  保存
                </UButton>
              </div>
            </div>
          </div>

          <!-- 底部 -->
          <div class="settings-footer">
            <UButton variant="ghost" color="neutral" @click="showSettings = false">关闭</UButton>
          </div>
        </div>
      </template>
    </UModal>
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

/* 设置弹窗样式 */
.settings-dialog {
  padding: 1.5rem;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.settings-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  border-radius: 10px;
  color: white;
}

.settings-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.settings-item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-main);
}

.settings-item-label {
  font-size: 0.875rem;
  font-weight: 500;
}

.settings-item-value {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.directory-path {
  flex: 1;
  font-size: 0.75rem;
  color: var(--text-mute);
  word-break: break-all;
  padding: 0.5rem;
  background-color: var(--bg-sidebar);
  border-radius: 6px;
}

.directory-empty {
  flex: 1;
  font-size: 0.75rem;
  color: var(--text-mute);
  font-style: italic;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.dark .settings-item {
  background-color: var(--bg-paper);
}
</style>
