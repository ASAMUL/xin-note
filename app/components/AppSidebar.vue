<script setup lang="ts">
import type { NoteItem } from '~/composables/useNotes';

const {
  notes,
  isLoading,
  createNote,
  createFolder,
  renameNote,
  deleteNote,
  moveNote,
  showInExplorer,
  copyPath,
} = useNotes();
const { openTab, activeTab } = useTabs();
const { notesDirectory, selectNotesDirectory } = useSettings();

// 右键菜单状态
const contextMenuOpen = ref(false);
const contextMenuTarget = ref<NoteItem | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });

// 右键菜单项
const contextMenuItems = computed(() => [
  [
    {
      label: '在编辑器中打开',
      icon: 'i-lucide-file-edit',
      onSelect: () => contextMenuTarget.value && openTab(contextMenuTarget.value),
    },
  ],
  [
    {
      label: '新建笔记',
      icon: 'i-lucide-file-plus',
      onSelect: () => handleCreateNote(),
    },
    {
      label: '新建文件夹',
      icon: 'i-lucide-folder-plus',
      onSelect: () => showCreateFolderDialog(),
    },
  ],
  [
    {
      label: '复制路径',
      icon: 'i-lucide-link',
      onSelect: () => contextMenuTarget.value && copyPath(contextMenuTarget.value),
    },
    {
      label: '重命名',
      icon: 'i-lucide-pencil',
      onSelect: () => startRename(),
    },
  ],
  [
    {
      label: '在资源管理器中显示',
      icon: 'i-lucide-folder-open',
      onSelect: () => contextMenuTarget.value && showInExplorer(contextMenuTarget.value),
    },
  ],
  [
    {
      label: '删除',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => confirmDelete(),
    },
  ],
]);

// 重命名状态
const isRenaming = ref(false);
const renameValue = ref('');
const renameTarget = ref<NoteItem | null>(null);

const startRename = () => {
  if (contextMenuTarget.value) {
    renameTarget.value = contextMenuTarget.value;
    renameValue.value = contextMenuTarget.value.name.replace('.md', '');
    isRenaming.value = true;
  }
};

const confirmRename = async () => {
  if (renameTarget.value && renameValue.value.trim()) {
    await renameNote(renameTarget.value, renameValue.value.trim());
  }
  isRenaming.value = false;
  renameTarget.value = null;
};

const cancelRename = () => {
  isRenaming.value = false;
  renameTarget.value = null;
};

// 删除确认
const showDeleteConfirm = ref(false);
const deleteTarget = ref<NoteItem | null>(null);

const confirmDelete = () => {
  deleteTarget.value = contextMenuTarget.value;
  showDeleteConfirm.value = true;
};

const doDelete = async () => {
  if (deleteTarget.value) {
    await deleteNote(deleteTarget.value);
  }
  showDeleteConfirm.value = false;
  deleteTarget.value = null;
};

// 处理右键菜单
const handleContextMenu = (event: MouseEvent, note: NoteItem) => {
  event.preventDefault();
  contextMenuTarget.value = note;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuOpen.value = true;
};

// 新建笔记（考虑当前选中位置）
const handleCreateNote = async () => {
  if (!notesDirectory.value) {
    // 如果没有设置目录，提示用户先设置
    await selectNotesDirectory();
  }
  if (notesDirectory.value) {
    // 根据当前活动 tab 确定创建位置（tab 只能是文件，获取其所在目录）
    let parentDir: string | undefined;
    if (activeTab.value) {
      const path = activeTab.value.path;
      parentDir = path.substring(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')));
    }
    await createNote('未命名笔记.md', parentDir);
  }
};

// 从头部按钮创建文件夹（考虑当前选中位置）
const handleHeaderCreateFolder = () => {
  // 根据当前活动 tab 确定创建位置（tab 只能是文件，获取其所在目录）
  if (activeTab.value) {
    const path = activeTab.value.path;
    const parentPath = path.substring(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')));
    contextMenuTarget.value = { path: parentPath, isFolder: true } as NoteItem;
  } else {
    contextMenuTarget.value = null;
  }
  showCreateFolderDialog();
};

// 新建文件夹弹窗
const showCreateFolder = ref(false);
const newFolderName = ref('');

const showCreateFolderDialog = () => {
  newFolderName.value = '';
  showCreateFolder.value = true;
};

const confirmCreateFolder = async () => {
  if (newFolderName.value.trim()) {
    // 确定创建位置：如果右键点击的是文件夹则在其内部创建，如果是文件则在其所在目录创建
    let parentDir: string | undefined;
    if (contextMenuTarget.value) {
      if (contextMenuTarget.value.isFolder) {
        // 在文件夹内部创建
        parentDir = contextMenuTarget.value.path;
      } else {
        // 在文件所在目录创建（获取父目录路径）
        const path = contextMenuTarget.value.path;
        parentDir = path.substring(
          0,
          path.lastIndexOf('\\') > -1 ? path.lastIndexOf('\\') : path.lastIndexOf('/'),
        );
      }
    }
    await createFolder(newFolderName.value.trim(), parentDir);
  }
  showCreateFolder.value = false;
  newFolderName.value = '';
};

const cancelCreateFolder = () => {
  showCreateFolder.value = false;
  newFolderName.value = '';
};

// 处理笔记选择
const handleNoteSelect = (note: NoteItem) => {
  if (!note.isFolder) {
    openTab(note);
  }
};

// 处理笔记移动（拖拽到文件夹）
const handleNoteMove = async (note: NoteItem, targetFolderPath: string) => {
  if (targetFolderPath) {
    await moveNote(note, targetFolderPath);
  }
};

// 选择目录包装函数
const handleSelectDirectory = async () => {
  await selectNotesDirectory();
};
</script>

<template>
  <div class="sidebar-container">
    <!-- 侧边栏头部 -->
    <div class="sidebar-header">
      <h2 class="sidebar-title">
        <UIcon name="i-lucide-book-open" class="w-4 h-4" />
        <span>笔记</span>
      </h2>
      <div class="sidebar-actions">
        <UTooltip text="刷新">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-refresh-cw"
            @click="useNotes().loadNotes()"
          />
        </UTooltip>
        <UTooltip text="新建文件夹">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-folder-plus"
            @click="handleHeaderCreateFolder"
          />
        </UTooltip>
        <UTooltip text="新建笔记">
          <UButton
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-file-plus"
            @click="handleCreateNote"
          />
        </UTooltip>
      </div>
    </div>

    <!-- 笔记列表 -->
    <div class="sidebar-content">
      <!-- 未设置目录提示 -->
      <div v-if="!notesDirectory" class="empty-state">
        <UIcon name="i-lucide-folder-plus" class="w-12 h-12 empty-icon" />
        <p class="empty-text">请先设置笔记存储目录</p>
        <UButton
          variant="soft"
          color="primary"
          size="sm"
          icon="i-lucide-folder-open"
          @click="handleSelectDirectory"
        >
          选择目录
        </UButton>
      </div>

      <!-- 加载中 -->
      <div v-else-if="isLoading" class="loading-state">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin" />
        <span>加载中...</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="notes.length === 0" class="empty-state">
        <UIcon name="i-lucide-file-plus" class="w-12 h-12 empty-icon" />
        <p class="empty-text">还没有笔记</p>
        <UButton
          variant="soft"
          color="primary"
          size="sm"
          icon="i-lucide-plus"
          @click="handleCreateNote"
        >
          创建第一篇笔记
        </UButton>
      </div>

      <!-- 笔记树形列表 -->
      <div v-else class="notes-list">
        <NoteTree
          :items="notes"
          :active-tab-path="activeTab?.path"
          :parent-folder-path="notesDirectory"
          @select="handleNoteSelect"
          @contextmenu="handleContextMenu"
          @move="handleNoteMove"
        />
      </div>
    </div>

    <!-- 右键菜单 - 使用 DropdownMenu 作为浮动菜单 -->
    <UDropdownMenu
      :open="contextMenuOpen"
      :items="contextMenuItems"
      :ui="{ content: 'min-w-48' }"
      @update:open="contextMenuOpen = $event"
    >
      <template #default>
        <!-- 隐藏的触发器，位置通过 CSS 控制 -->
        <div
          ref="contextMenuTrigger"
          class="context-menu-trigger"
          :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
        />
      </template>
    </UDropdownMenu>

    <!-- 重命名弹窗 -->
    <UModal v-model:open="isRenaming">
      <template #content>
        <div class="rename-dialog">
          <h3 class="dialog-title">重命名笔记</h3>
          <UInput
            v-model="renameValue"
            placeholder="输入新名称"
            class="w-full"
            autofocus
            @keyup.enter="confirmRename"
            @keyup.escape="cancelRename"
          />
          <div class="dialog-actions">
            <UButton variant="ghost" color="neutral" @click="cancelRename">取消</UButton>
            <UButton color="primary" @click="confirmRename">确定</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 删除确认弹窗 -->
    <UModal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="delete-dialog">
          <div class="dialog-icon delete-icon">
            <UIcon name="i-lucide-trash-2" class="w-6 h-6" />
          </div>
          <h3 class="dialog-title">确认删除</h3>
          <p class="dialog-message">
            确定要删除 "
            <strong>{{ deleteTarget?.name.replace('.md', '') }}</strong>
            " 吗？此操作无法撤销。
          </p>
          <div class="dialog-actions">
            <UButton variant="ghost" color="neutral" @click="showDeleteConfirm = false">
              取消
            </UButton>
            <UButton color="error" @click="doDelete">删除</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 新建文件夹弹窗 -->
    <UModal v-model:open="showCreateFolder">
      <template #content>
        <div class="rename-dialog">
          <h3 class="dialog-title">新建文件夹</h3>
          <UInput
            v-model="newFolderName"
            placeholder="输入文件夹名称"
            class="w-full"
            autofocus
            @keyup.enter="confirmCreateFolder"
            @keyup.escape="cancelCreateFolder"
          />
          <div class="dialog-actions">
            <UButton variant="ghost" color="neutral" @click="cancelCreateFolder">取消</UButton>
            <UButton color="primary" @click="confirmCreateFolder">创建</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.sidebar-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

/* 空状态和加载状态 */
.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  gap: 0.75rem;
  text-align: center;
}

.empty-icon {
  color: var(--text-mute);
  opacity: 0.5;
}

.empty-text {
  font-size: 0.875rem;
  color: var(--text-mute);
  margin: 0;
}

.loading-state {
  flex-direction: row;
  color: var(--text-mute);
  font-size: 0.875rem;
}

/* 笔记列表 */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.note-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.note-item:hover {
  background-color: var(--bg-app);
}

.note-item--active {
  background-color: var(--highlight-bg);
}

.note-item--active .note-icon {
  color: var(--accent-color);
}

.note-item--active .note-name {
  color: var(--accent-color);
  font-weight: 500;
}

.note-item--child {
  padding-left: 1.75rem;
}

.note-icon {
  color: var(--text-mute);
  flex-shrink: 0;
}

.note-name {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modified-indicator {
  color: var(--accent-color);
  flex-shrink: 0;
}

/* 右键菜单触发器 - 隐藏的定位元素 */
.context-menu-trigger {
  position: fixed;
  width: 1px;
  height: 1px;
  pointer-events: none;
  z-index: -1;
}

/* 弹窗样式 */
.rename-dialog,
.delete-dialog {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dialog-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.dialog-message {
  font-size: 0.875rem;
  color: var(--text-mute);
  margin: 0;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.dialog-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.delete-icon {
  background-color: var(--color-error-bg);
  color: var(--color-error);
}

.dark .delete-icon {
  background-color: var(--color-error-bg);
  color: var(--color-error);
}
</style>
