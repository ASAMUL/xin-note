<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3';
import type { EditorCustomHandlers, EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui';
import { Emoji, gitHubEmojis } from '@tiptap/extension-emoji';

import { LocalImageResolver } from '~/components/editor/EditorLocalImageResolverExtension';

// 编辑器引用
const editorRef = useTemplateRef<{ editor: Editor }>('editorRef');
const editorHostRef = useTemplateRef<HTMLElement>('editorHostRef');

// 自动保存 + 标签页内容同步
const { activeTab, editorContent, saveStatus, saveStatusInfo } = useEditorAutoSave();

defineShortcuts({
  meta_y: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editorRef.value?.editor as any)?.chain().focus().redo().run();
  },
});
// 本地图片（上传/粘贴 + src 解析）
const { resolveLocalImageSrc, handlePaste, imageHandlers } = useEditorLocalImages({
  activeTab,
  editorRef,
});

// AI 续写（候选/定位/handlers + extension）
const {
  aiApiKey,
  aiLoading,
  aiState,
  aiAnchor,
  aiDropdownItems,
  aiCompletionExtension,
  aiHandlers,
  onEditorScroll,
  onSelectionUpdate,
} = useEditorAiCompletion({
  editorRef,
  editorHostRef,
});

// 合并 Nuxt UI Editor handlers
const customHandlers = computed(() => {
  return {
    ...imageHandlers.value,
    ...aiHandlers.value,
  } satisfies EditorCustomHandlers;
});

// Drag handle 右键菜单：复用 Nuxt UI 的 mapEditorItems，自动绑定 handler
const { selectedNode, dragHandleMenuItems } = useEditorDragHandleMenu(customHandlers);

const toolbarItems = computed(() => {
  return [
    [
      { kind: 'undo', icon: 'i-lucide-undo', tooltip: { text: '撤销' } },
      { kind: 'redo', icon: 'i-lucide-redo', tooltip: { text: '重做' } },
    ],
    [
      {
        kind: 'aiSuggest',
        icon: 'i-lucide-sparkles',
        tooltip: { text: aiApiKey.value ? 'AI 续写（Tab）' : '请先在设置中填写 API Key' },
        loading: aiLoading.value,
        disabled: !aiApiKey.value,
      },
    ],
    [
      { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: '加粗' } },
      { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: '斜体' } },
      { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: '下划线' } },
      { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: '删除线' } },
      { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: '行内代码' } },
    ],
  ] satisfies EditorToolbarItem<typeof customHandlers.value>[][];
});

const suggestionItems = computed(() => {
  return [
    [
      { type: 'label', label: 'AI' },
      { kind: 'aiSuggest', label: '续写（3 条候选）', icon: 'i-lucide-sparkles' },
    ],
    [
      { type: 'label', label: '插入' },
      { kind: 'imageUpload', label: '图片', icon: 'i-lucide-image' },
      { kind: 'emoji', label: 'Emoji', icon: 'i-lucide-smile-plus' },
      { kind: 'horizontalRule', label: '分割线', icon: 'i-lucide-separator-horizontal' },
    ],
    [
      { type: 'label', label: '块' },
      { kind: 'paragraph', label: '段落', icon: 'i-lucide-type' },
      { kind: 'heading', level: 1, label: '标题 1', icon: 'i-lucide-heading-1' },
      { kind: 'heading', level: 2, label: '标题 2', icon: 'i-lucide-heading-2' },
      { kind: 'heading', level: 3, label: '标题 3', icon: 'i-lucide-heading-3' },
      { kind: 'bulletList', label: '无序列表', icon: 'i-lucide-list' },
      { kind: 'orderedList', label: '有序列表', icon: 'i-lucide-list-ordered' },
      { kind: 'blockquote', label: '引用', icon: 'i-lucide-text-quote' },
      { kind: 'codeBlock', label: '代码块', icon: 'i-lucide-square-code' },
    ],
  ] satisfies EditorSuggestionMenuItem<typeof customHandlers.value>[][];
});

const emojiItems = computed(() => {
  return gitHubEmojis.filter((emoji) => !emoji.name.startsWith('regional_indicator_'));
});

const editorExtensions = computed(() => {
  return [
    Emoji,
    LocalImageResolver.configure({
      resolve: resolveLocalImageSrc,
    }),
    aiCompletionExtension.value,
  ] as any;
});

</script>

<template>
  <div class="editor-container">
    <!-- 标签页栏（包含保存状态） -->
    <EditorTabs :save-status-info="saveStatusInfo" :save-status="saveStatus" />

    <!-- 编辑器内容区 -->
    <div class="editor-content" @scroll.passive="onEditorScroll">
      <!-- 未选择笔记提示 -->
      <div v-if="!activeTab" class="empty-editor">
        <UIcon name="i-lucide-file-text" class="w-16 h-16 empty-icon" />
        <h3 class="empty-title">选择一篇笔记开始编辑</h3>
        <p class="empty-desc">从左侧笔记列表选择，或创建一篇新笔记</p>
      </div>

      <!-- Nuxt UI 编辑器 -->
      <ClientOnly v-else>
        <div ref="editorHostRef" class="relative">
          <UEditor
            ref="editorRef"
            v-slot="{ editor }"
            :key="activeTab?.id"
            v-model="editorContent"
            content-type="markdown"
            :extensions="editorExtensions"
            :handlers="customHandlers"
            placeholder="写点什么吧…（/ 打开命令，: 打开 emoji，Tab 生成灵感）"
            class="nuxt-editor"
            :on-paste="(e) => handlePaste(e)"
            :on-selection-update="onSelectionUpdate"
          >
            <UEditorToolbar
              :editor="editor"
              :items="toolbarItems"
              class="border-b border-(--border-color) sticky top-0 inset-x-0 px-4 py-2 z-50 bg-(--bg-paper) overflow-x-auto"
            />

            <UEditorDragHandle
              v-slot="{ ui }"
              :editor="editor"
              @node-change="selectedNode = $event"
            >
              <UDropdownMenu
                v-slot="{ open }"
                :modal="false"
                :items="dragHandleMenuItems(editor)"
                :content="{ side: 'left' }"
                :ui="{ content: 'w-56', label: 'text-xs' }"
                @update:open="editor.chain().setMeta('lockDragHandle', $event).run()"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  active-variant="soft"
                  size="sm"
                  icon="i-lucide-grip-vertical"
                  :active="open"
                  :class="ui.handle()"
                />
              </UDropdownMenu>
            </UEditorDragHandle>

            <UEditorSuggestionMenu :editor="editor" :items="suggestionItems" />
            <UEditorEmojiMenu :editor="editor" :items="emojiItems" />
            
            <!-- AI 候选下拉（第 1 条在 ghost，其余在下拉） -->
            <div
              v-if="aiState.visible && aiState.suggestions.length > 1"
              class="absolute z-50"
              :style="{ left: `${aiAnchor.x}px`, top: `${aiAnchor.y}px` }"
            >
              <UDropdownMenu :items="aiDropdownItems" :ui="{ content: 'w-80', label: 'text-xs' }">
                <UButton
                  icon="i-lucide-sparkles"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  :loading="aiLoading"
                  title="候选灵感"
                />
              </UDropdownMenu>
            </div>
          </UEditor>
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-paper);
}

.editor-content {
  flex: 1;
  overflow-y: auto;
}

/* Nuxt UI 编辑器样式覆盖 */
.nuxt-editor {
  min-height: calc(100vh - 6rem);
}

/* 编辑器内容区域样式 */
.nuxt-editor :deep(.ProseMirror) {
  min-height: calc(100vh - 6rem);
  outline: none;
}

/* 空状态 */
.empty-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
}

.empty-icon {
  color: var(--text-mute);
  opacity: 0.3;
}

.empty-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--text-mute);
  margin: 0;
}
</style>
