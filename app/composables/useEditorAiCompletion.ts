import type { Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import type { DropdownMenuItem, EditorCustomHandlers } from '@nuxt/ui';

import type { AiCompletionState } from '~/components/editor/EditorAiCompletionExtension';
import { AiCompletion } from '~/components/editor/EditorAiCompletionExtension';

/**
 * AppEditor 内的 AI 续写（候选/ghost/定位/下拉）逻辑封装。
 * - 具体的 “ghost 渲染 + Tab/Esc 快捷键” 在 `EditorAiCompletionExtension.ts` 里
 * - 这里负责：网络请求、候选下拉 UI、定位计算、以及 Nuxt UI Editor 的 handler 封装
 */
export const useEditorAiCompletion = (params: {
  editorRef: Ref<{ editor: Editor } | null>;
  editorHostRef: Ref<HTMLElement | null>;
}) => {
  const { editorRef, editorHostRef } = params;
  const { aiApiKey, aiBaseUrl, aiModel } = useSettings();

  /**
   * ========== AI Completion（Tab 触发/接受）==========
   * 交互：
   * - 第一次按 Tab：生成 3 条候选，ghost 显示第 1 条
   * - Tab（ghost 可见时）：接受当前 ghost
   * - 下拉里提供另外 2 条候选，并可切换当前 ghost
   * - Esc：取消
   */
  const aiLoading = ref(false);
  const aiState = ref<AiCompletionState>({
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

  const aiCompletionExtension = computed(() => {
    return AiCompletion.configure({
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
    });
  });

  const aiHandlers = computed(() => {
    const handlers = {
      aiSuggest: {
        canExecute: (editor: Editor) => !!aiApiKey.value && !aiLoading.value && editor.state.selection.empty,
        execute: (editor: Editor) => {
          triggerAiSuggest(editor);
          return (editor as any).chain();
        },
        isActive: (editor: Editor) => !!getAiStorage(editor)?.visible,
        isDisabled: (editor: Editor) =>
          !aiApiKey.value || aiLoading.value || !editor.state.selection.empty,
      },
    } satisfies EditorCustomHandlers;

    return handlers;
  });

  const onEditorScroll = () => {
    const editor = editorRef.value?.editor;
    if (!editor) return;
    if (!aiState.value.visible || typeof aiState.value.position !== 'number') return;
    updateAiAnchor(editor, aiState.value.position);
  };

  // Nuxt UI UEditor 传入的参数里还会带 transaction，并且不同依赖路径可能导致 Editor 类型不一致；
  // 这里仅取 editor 来做定位计算，入参类型放宽以避免 TS 冲突。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSelectionUpdate = (props: any) => {
    const editor = props?.editor;
    if (!editor) return;
    const st = getAiStorage(editor);
    if (st?.visible && typeof st?.position === 'number') {
      updateAiAnchor(editor, st.position);
    }
  };

  return {
    aiApiKey,
    aiLoading,
    aiState,
    aiAnchor,
    aiDropdownItems,
    aiCompletionExtension,
    aiHandlers,
    onEditorScroll,
    onSelectionUpdate,
  };
};

