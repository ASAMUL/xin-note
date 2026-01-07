<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3';
import type {
  DropdownMenuItem,
  EditorCustomHandlers,
  EditorSuggestionMenuItem,
  EditorToolbarItem,
} from '@nuxt/ui';
import { mapEditorItems } from '@nuxt/ui/utils/editor';
import { Emoji, gitHubEmojis } from '@tiptap/extension-emoji';

import { AiCompletion } from '~/components/editor/EditorAiCompletionExtension';
import { ImageUpload } from '~/components/editor/EditorImageUploadExtension';
import { LocalImageResolver } from '~/components/editor/EditorLocalImageResolverExtension';

const upperFirst = (str: string) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : str);

const { activeTab, updateTabContent, saveTab } = useTabs();
const { autoSaveDelay, aiApiKey, aiBaseUrl, aiModel } = useSettings();

// 编辑器引用
const editorRef = useTemplateRef<{ editor: Editor }>('editorRef');
const editorHostRef = useTemplateRef<HTMLElement>('editorHostRef');

// 编辑器内容（双向绑定用）
const editorContent = ref('');

// 自动保存定时器
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

// 保存状态
const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved');

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

defineShortcuts({
  meta_y: () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editorRef.value?.editor as any)?.chain().focus().redo().run();
  },
});
// 清理定时器和事件监听
onBeforeUnmount(() => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
});

// 格式化上次保存时间
const formatLastSavedTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) {
    return '刚刚保存';
  } else if (minutes < 60) {
    return `${minutes} 分钟前保存`;
  } else if (hours < 24) {
    return `${hours} 小时前保存`;
  } else {
    // 显示具体日期时间
    return `上次编辑 ${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
};

// 保存状态图标和文字
const saveStatusInfo = computed(() => {
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

/**
 * ========== AI Completion（Tab 触发/接受）==========
 * 交互：
 * - 第一次按 Tab：生成 3 条候选，ghost 显示第 1 条
 * - Tab（ghost 可见时）：接受当前 ghost
 * - 下拉里提供另外 2 条候选，并可切换当前 ghost
 * - Esc：取消
 */
const aiLoading = ref(false);
const aiState = ref<{
  visible: boolean;
  position?: number;
  suggestions: string[];
  activeIndex: number;
}>({
  visible: false,
  position: undefined,
  suggestions: [],
  activeIndex: 0,
});
const aiAnchor = ref<{ x: number; y: number }>({ x: 0, y: 0 });

// 只依赖 editor.view.coordsAtPos，避免 TipTap 多处类型声明不一致导致 TS 报错
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateAiAnchor = (editor: any, pos: number) => {
  const host = editorHostRef.value;
  if (!host) return;

  const hostRect = host.getBoundingClientRect();
  const coords = editor.view.coordsAtPos(pos);

  // 相对 editorHost 的定位（注意 editor-content 有滚动条）
  aiAnchor.value = {
    x: Math.max(8, coords.left - hostRect.left),
    y: Math.max(8, coords.bottom - hostRect.top + 6),
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getAiStorage = (editor: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor.storage as any)?.aiCompletion as any;
};

const requestAiSuggestions = async (_editor: Editor, textBefore: string): Promise<string[]> => {
  const key = aiApiKey.value?.trim();
  if (!key) return [];

  aiLoading.value = true;
  try {
    const endpoint = `${(aiBaseUrl.value || 'https://api.openai.com/v1').replace(
      /\/+$/,
      '',
    )}/chat/completions`;
    const res: any = await $fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: aiModel.value || 'gpt-4o-mini',
        n: 3,
        temperature: 0.7,
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content:
              '你是一个写作续写助手。只输出“续写的新增内容”，不要复述用户已有内容。最多输出 1 句话。保持原文语气与格式。',
          },
          {
            role: 'user',
            content: `请基于以下内容继续写作（只输出续写部分）：\n\n${textBefore}`,
          },
        ],
      },
    });

    const choices = Array.isArray(res?.choices) ? res.choices : [];
    return choices
      .map((c: any) => c?.message?.content ?? c?.text ?? '')
      .filter(Boolean)
      .slice(0, 3);
  } catch (e) {
    console.error('AI completion 请求失败:', e);
    return [];
  } finally {
    aiLoading.value = false;
  }
};

const triggerAiSuggest = async (editor: Editor) => {
  const key = aiApiKey.value?.trim();
  if (!key) return;
  if (aiLoading.value) return;

  const { state } = editor;
  const { selection } = state;
  if (!selection.empty) return;

  const pos = selection.from;
  const full = state.doc.textBetween(0, pos, '\n');
  const textBefore = full.slice(-2000);

  const st = getAiStorage(editor);
  st?.setPosition?.(pos);
  st?.clear?.();

  const raw = await requestAiSuggestions(editor, textBefore);
  const cleaned = raw.map((s: string) => s.replace(/\r\n/g, '\n').trimEnd()).filter(Boolean);

  const lastChar = full.slice(-1);
  const needsSpace = lastChar && !/\s/.test(lastChar);
  const finalSuggestions = cleaned.map((s) => {
    if (!needsSpace) return s;
    return /^\s/.test(s) ? s : ` ${s}`;
  });

  st?.setSuggestions?.(finalSuggestions);
  updateAiAnchor(editor, pos);
};

const insertCurrentAiSuggestion = () => {
  const editor = editorRef.value?.editor;
  if (!editor) return;
  const st = getAiStorage(editor);
  const suggestion = st?.suggestions?.[st?.activeIndex] as string | undefined;
  const pos = st?.position as number | undefined;
  if (!suggestion || typeof pos !== 'number') return;

  st?.clear?.();
  editor.chain().focus().insertContentAt(pos, suggestion).run();
};

const dismissAiSuggestion = () => {
  const editor = editorRef.value?.editor;
  if (!editor) return;
  const st = getAiStorage(editor);
  st?.clear?.();
};

const setAiActiveIndex = (index: number) => {
  const editor = editorRef.value?.editor;
  if (!editor) return;
  const st = getAiStorage(editor);
  st?.setActiveIndex?.(index);
  if (typeof st?.position === 'number') {
    updateAiAnchor(editor, st.position);
  }
};

const aiDropdownItems = computed((): DropdownMenuItem[][] => {
  const items: DropdownMenuItem[][] = [];
  const editor = editorRef.value?.editor;
  const suggestions = aiState.value.suggestions || [];

  if (!editor || suggestions.length <= 1) return items;

  items.push([
    { type: 'label', label: '候选灵感（Tab 接受，Esc 取消）' },
    ...suggestions.map((s, idx) => ({
      label: s.length > 50 ? `${s.slice(0, 50)}…` : s,
      icon: idx === aiState.value.activeIndex ? 'i-lucide-check' : 'i-lucide-sparkles',
      onSelect: () => setAiActiveIndex(idx),
    })),
  ]);

  items.push([
    { type: 'separator' },
    {
      label: '插入当前候选',
      icon: 'i-lucide-corner-down-left',
      onSelect: insertCurrentAiSuggestion,
    },
    {
      label: '取消候选',
      icon: 'i-lucide-x',
      onSelect: dismissAiSuggestion,
    },
  ]);

  return items;
});

// Drag handle 右键菜单：复用 Nuxt UI 的 mapEditorItems，自动绑定 handler
const selectedNode = ref<{ node: any; pos: number }>();
const dragHandleMenuItems = (editor: Editor): DropdownMenuItem[][] => {
  if (!selectedNode.value?.node?.type) return [];

  return mapEditorItems(
    editor,
    [
      [
        { type: 'label', label: upperFirst(selectedNode.value.node.type) },
        {
          label: '转成',
          icon: 'i-lucide-repeat-2',
          children: [
            { kind: 'paragraph', label: '段落', icon: 'i-lucide-type' },
            { kind: 'heading', level: 1, label: '标题 1', icon: 'i-lucide-heading-1' },
            { kind: 'heading', level: 2, label: '标题 2', icon: 'i-lucide-heading-2' },
            { kind: 'heading', level: 3, label: '标题 3', icon: 'i-lucide-heading-3' },
            { kind: 'heading', level: 4, label: '标题 4', icon: 'i-lucide-heading-4' },
            { kind: 'bulletList', label: '无序列表', icon: 'i-lucide-list' },
            { kind: 'orderedList', label: '有序列表', icon: 'i-lucide-list-ordered' },
            { kind: 'blockquote', label: '引用', icon: 'i-lucide-text-quote' },
            { kind: 'codeBlock', label: '代码块', icon: 'i-lucide-square-code' },
          ],
        },
        {
          kind: 'clearFormatting',
          pos: selectedNode.value.pos,
          label: '重置格式',
          icon: 'i-lucide-rotate-ccw',
        },
      ],
      [
        {
          kind: 'duplicate',
          pos: selectedNode.value.pos,
          label: '复制块',
          icon: 'i-lucide-copy',
        },
        {
          kind: 'moveUp',
          pos: selectedNode.value.pos,
          label: '上移',
          icon: 'i-lucide-arrow-up',
        },
        {
          kind: 'moveDown',
          pos: selectedNode.value.pos,
          label: '下移',
          icon: 'i-lucide-arrow-down',
        },
      ],
      [
        {
          kind: 'delete',
          pos: selectedNode.value.pos,
          label: '删除',
          icon: 'i-lucide-trash',
        },
      ],
    ],
    customHandlers.value,
  ) as DropdownMenuItem[][];
};

const customHandlers = computed(() => {
  const handlers = {
    imageUpload: {
      canExecute: (editor: Editor) => editor.can().insertContent({ type: 'imageUpload' }),
      execute: (editor: Editor) => editor.chain().focus().insertContent({ type: 'imageUpload' }),
      isActive: (editor: Editor) => editor.isActive('imageUpload'),
      isDisabled: undefined,
    },
    aiSuggest: {
      canExecute: (editor: Editor) =>
        !!aiApiKey.value && !aiLoading.value && editor.state.selection.empty,
      execute: (editor: Editor) => {
        triggerAiSuggest(editor);
        return editor.chain();
      },
      isActive: (editor: Editor) => !!getAiStorage(editor)?.visible,
      isDisabled: (editor: Editor) =>
        !aiApiKey.value || aiLoading.value || !editor.state.selection.empty,
    },
  } satisfies EditorCustomHandlers;
  return handlers;
});

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
      { kind: 'imageUpload', icon: 'i-lucide-image', tooltip: { text: '插入图片' } },
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

// 将 markdown 的相对路径 assets/xxx.png 解析为 file:/// 绝对路径，确保 Electron 能显示本地图片
const resolveLocalImageSrc = (src: string) => {
  if (!src) return null;
  // 已经是完整 URL：不处理
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:') || src.startsWith('blob:'))
    return null;

  const notePath = activeTab.value?.path;
  if (!notePath) return null;

  const noteDir = notePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
  const rel = src.replace(/\\/g, '/').replace(/^\.\/+/, '');
  const abs = `${noteDir}/${rel}`.replace(/\/{2,}/g, '/');

  // Windows 需要 file:///C:/...
  return `file:///${encodeURI(abs)}`;
};

const editorExtensions = computed(() => {
  return [
    Emoji,
    ImageUpload,
    LocalImageResolver.configure({
      resolve: resolveLocalImageSrc,
    }),
    AiCompletion.configure({
      // Nuxt UI 的 Editor 暴露的是 TipTap Editor（Vue 版本），而扩展内部使用的是 core Editor 类型；这里做一次类型兼容
      onRequest: requestAiSuggestions as unknown as (
        editor: any,
        textBefore: string,
      ) => Promise<string[]>,
      onChange: (state) => {
        aiState.value = state as any;
        const editor = editorRef.value?.editor;
        if (editor && state.visible && typeof state.position === 'number') {
          updateAiAnchor(editor, state.position);
        }
      },
    }),
  ] as any;
});

// 粘贴图片：写入当前笔记同目录 assets/ 并插入 image 节点（markdown 里保存相对路径）
const handlePaste = async (e: ClipboardEvent) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = editorRef.value?.editor as any;
  if (!editor) return;
  if (!activeTab.value?.path) return;
  if (!window.ipcRenderer) return;

  const items = e.clipboardData?.items;
  if (!items || items.length === 0) return;

  const imageItem = Array.from(items).find(
    (it) => it.kind === 'file' && it.type.startsWith('image/'),
  );
  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;

  e.preventDefault();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop()?.toLowerCase() || file.type.split('/')[1] || 'png';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${unique}-pasted.${ext}`;

    const result = await window.ipcRenderer.invoke('asset-write', {
      notePath: activeTab.value.path,
      fileName,
      data: new Uint8Array(arrayBuffer),
    });

    if (!result?.ok || !result?.relativePath) {
      throw new Error('写入图片失败');
    }

    editor
      .chain()
      .focus()
      .setImage({
        src: result.relativePath,
        alt: file.name || 'pasted image',
      })
      .run();
  } catch (err) {
    console.error('粘贴图片失败:', err);
  }
};

const onEditorScroll = () => {
  const editor = editorRef.value?.editor;
  if (!editor) return;
  if (!aiState.value.visible || typeof aiState.value.position !== 'number') return;
  updateAiAnchor(editor, aiState.value.position);
};
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
            :on-selection-update="
              ({ editor }) => {
                const st = getAiStorage(editor);
                if (st?.visible && typeof st?.position === 'number') {
                  updateAiAnchor(editor, st.position);
                }
              }
            "
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
