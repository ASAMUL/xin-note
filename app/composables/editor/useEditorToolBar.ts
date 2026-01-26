import type { EditorToolbarItem } from '@nuxt/ui';

export const useEditorToolBar = ({
  aiApiKey,
  aiLoading,
}: {
  aiApiKey: Ref<string | null>;
  aiLoading: Ref<boolean>;
}) => {
  const toolbarItems: EditorToolbarItem[][] = [
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
  ];
  return { toolbarItems };
};
