<script setup lang="ts">
/**
 * 命令面板组件
 * 提供快速搜索和执行命令的功能
 */
import type { NoteItem } from '~/composables/useNotes';
import { useNoteContentSearch } from '~/composables/search/useNoteContentSearch';

// Props 定义
const props = defineProps<{
  open: boolean;
}>();

// Emits 定义
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'openSettings'): void;
}>();

// 组合式函数
const { notesDirectory } = useSettings();
const { openTabs, openTab, openTabByPath, saveTab, activeTab } = useTabs();
const { notes, createNote } = useNotes();

// 内部状态
const searchTerm = ref('');
const { results: contentSearchResults, loading: contentSearchLoading } = useNoteContentSearch({
  searchTerm,
  notesDirectory,
});
const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});

// 扁平化笔记列表（用于搜索）
const flattenNotes = (noteList: NoteItem[]): NoteItem[] => {
  const result: NoteItem[] = [];
  for (const note of noteList) {
    if (!note.isFolder) {
      result.push(note);
    }
    if (note.children?.length) {
      result.push(...flattenNotes(note.children));
    }
  }
  return result;
};

// 获取相对路径用于显示后缀
const getRelativePath = (filePath: string): string => {
  if (!notesDirectory.value) return '';
  const relativePath = filePath.replace(notesDirectory.value, '').replace(/\\/g, '/');
  const parts = relativePath.split('/');
  parts.pop(); // 移除文件名
  return parts.join('/').replace(/^\//, '') || '根目录';
};

// 关闭命令面板
const closePanel = () => {
  isOpen.value = false;
  searchTerm.value = '';
};

// 命令面板分组
const commandGroups = computed(() => {
  const groups: any[] = [];

  // 1. 操作命令组
  groups.push({
    id: 'actions',
    items: [
      {
        id: 'action-new-note',
        label: '新建笔记',
        suffix: '在当前目录创建新的笔记文件',
        icon: 'i-lucide-file-plus',
        kbds: ['ctrl', 'N'],
        onSelect: async () => {
          closePanel();
          await createNote();
        },
      },
      {
        id: 'action-save',
        label: '保存当前文件',
        suffix: '保存正在编辑的笔记',
        icon: 'i-lucide-save',
        kbds: ['ctrl', 'S'],
        disabled: !activeTab.value,
        onSelect: async () => {
          closePanel();
          await saveTab();
        },
      },
      {
        id: 'action-ai',
        label: '打开 AI 助手',
        suffix: '使用 AI 辅助写作',
        icon: 'i-lucide-sparkles',
        kbds: ['ctrl', 'L'],
        onSelect: () => {
          closePanel();
          // TODO: 打开 AI 助手
        },
      },
      {
        id: 'action-settings',
        label: '设置',
        suffix: '打开应用设置',
        icon: 'i-lucide-settings',
        kbds: ['ctrl', ','],
        onSelect: () => {
          closePanel();
          emit('openSettings');
        },
      },
    ],
  });

  // 2. 最近文档组（当前打开的标签页）
  if (openTabs.value.length > 0) {
    groups.push({
      id: 'recent',
      label: '已打开的文档',
      items: openTabs.value.map((tab) => ({
        id: `recent-${tab.id}`,
        label: tab.name.replace('.md', ''),
        suffix: getRelativePath(tab.path),
        icon: tab.isModified ? 'i-lucide-file-edit' : 'i-lucide-file-text',
        active: tab.id === activeTab.value?.id,
        onSelect: async () => {
          closePanel();
          await openTabByPath(tab.path);
        },
      })),
    });
  }

  // 2.5 内容搜索（BM25 / 全文检索）
  const q = searchTerm.value.trim();
  if (q && notesDirectory.value) {
    const items = contentSearchResults.value.map((hit) => ({
      id: `content-${hit.path}`,
      label: hit.name.replace('.md', ''),
      suffix: getRelativePath(hit.path),
      description: hit.snippet,
      icon: 'i-lucide-file-search',
      onSelect: async () => {
        closePanel();
        await openTabByPath(hit.path);
      },
    }));

    // 只有在有输入时显示，且由我们自己提供搜索结果（不走内部 Fuse 过滤）
    groups.push({
      id: 'content',
      label: '内容搜索',
      ignoreFilter: true,
      items,
    });
  }

  // 3. 全部笔记组
  const allNotes = flattenNotes(notes.value);
  if (allNotes.length > 0) {
    groups.push({
      id: 'notes',
      label: '全部笔记',
      items: allNotes.map((note) => ({
        id: `note-${note.id}`,
        label: note.name.replace('.md', ''),
        suffix: getRelativePath(note.path),
        icon: 'i-lucide-file-text',
        onSelect: async () => {
          closePanel();
          await openTab(note);
        },
      })),
    });
  }

  return groups;
});

// 处理命令选择
const handleCommandSelect = (item: any) => {
  if (item?.onSelect) {
    item.onSelect();
  }
};

// 快捷键现在由 useShortcuts composable 统一管理
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-xl' }">
    <template #content>
      <UCommandPalette
        v-model:search-term="searchTerm"
        placeholder="搜索笔记、内容、命令..."
        :loading="contentSearchLoading"
        :groups="commandGroups"
        :fuse="{
          fuseOptions: {
            keys: ['label', 'suffix'],
            threshold: 0.3,
          },
        }"
        class="command-palette"
        :ui="{
          input: 'h-12',
          viewport: 'max-h-80',
        }"
        @update:model-value="handleCommandSelect"
      >
        <!-- 内容搜索：展示匹配片段 -->
        <template #item-description="{ item }">
          <span v-if="item?.description" class="command-item-desc text-xs text-dimmed">
            {{ item.description }}
          </span>
        </template>

        <!-- 空状态 -->
        <template #empty="{ searchTerm }">
          <div class="command-empty">
            <UIcon name="i-lucide-search-x" class="w-8 h-8" />
            <p v-if="searchTerm">没有找到与 "{{ searchTerm }}" 相关的结果</p>
            <p v-else>输入关键词开始搜索</p>
          </div>
        </template>

        <!-- 底部栏 -->
        <template #footer>
          <div class="command-footer">
            <UIcon name="i-lucide-feather" class="size-4 text-dimmed" />
            <div class="command-footer-actions">
              <div class="command-hint">
                <UKbd value="↑" size="sm" />
                <UKbd value="↓" size="sm" />
                <span>导航</span>
              </div>
              <USeparator orientation="vertical" class="h-4" />
              <div class="command-hint">
                <UKbd value="enter" size="sm" />
                <span>执行</span>
              </div>
              <USeparator orientation="vertical" class="h-4" />
              <div class="command-hint">
                <UKbd value="esc" size="sm" />
                <span>关闭</span>
              </div>
            </div>
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>

<style scoped>
.command-palette {
  border-radius: 12px;
  overflow: hidden;
}

.command-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  gap: 0.75rem;
  color: var(--text-mute);
}

.command-empty p {
  margin: 0;
  font-size: 0.875rem;
}

.command-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background-color: var(--bg-sidebar);
  border-top: 1px solid var(--border-color);
}

.command-footer-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.command-item-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.command-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-mute);
}
</style>
