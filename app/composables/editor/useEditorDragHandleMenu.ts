import type { Ref } from 'vue';
import type { DropdownMenuItem } from '#ui/components/DropdownMenu.vue';
import type { EditorCustomHandlers } from '#ui/types/editor';
import type { Editor } from '@tiptap/vue-3';
import { mapEditorItems } from '#ui/utils/editor';

import { upperFirst } from 'scule';

/**
 * Nuxt UI Editor DragHandle 的菜单
 * -
 */
export const useEditorDragHandleMenu = (customHandlers: Ref<EditorCustomHandlers>) => {
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
            onSelect: async () => {
              if (!selectedNode.value) return;

              const pos = selectedNode.value.pos;
              const node = editor.state.doc.nodeAt(pos);
              if (node) {
                await navigator.clipboard.writeText(node.textContent);
              }
            },
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

  return {
    selectedNode,
    dragHandleMenuItems,
  };
};
