<script setup lang="ts">
/**
 * 快捷键说明（只展示，不绑定逻辑）
 */

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});

type ShortcutRow = {
  keys: string[];
  desc: string;
};

const groups = computed(() => {
  const list: { title: string; items: ShortcutRow[] }[] = [
    {
      title: '全局',
      items: [
        { keys: ['Ctrl', 'P'], desc: '打开搜索/命令面板' },
        { keys: ['Ctrl', 'N'], desc: '新建笔记' },
        { keys: ['Ctrl', 'S'], desc: '保存当前文件' },
        { keys: ['Ctrl', ','], desc: '打开设置' },
        { keys: ['Shift', 'Shift'], desc: '双击 Shift 打开搜索' },
        { keys: ['Ctrl', 'L'], desc: '打开/关闭 AI 助手' },
      ],
    },
    {
      title: '视图',
      items: [{ keys: ['F11'], desc: '切换全屏' }],
    },
    {
      title: '编辑',
      items: [
        { keys: ['Ctrl', 'Z'], desc: '撤销' },
        { keys: ['Ctrl', 'Y'], desc: '重做' },
        { keys: ['Ctrl', 'X'], desc: '剪切' },
        { keys: ['Ctrl', 'C'], desc: '复制' },
        { keys: ['Ctrl', 'V'], desc: '粘贴' },
      ],
    },
    {
      title: 'AI 续写（编辑器内）',
      items: [
        { keys: ['Tab'], desc: '生成候选/接受当前候选' },
        { keys: ['Esc'], desc: '取消候选' },
      ],
    },
  ];

  return list;
});
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div class="p-4 flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-keyboard" class="w-5 h-5" />
            <h3 class="text-base font-semibold" style="color: var(--text-main)">快捷键</h3>
          </div>
          <UButton variant="ghost" color="neutral" icon="i-lucide-x" @click="isOpen = false" />
        </div>

        <div class="flex flex-col gap-4">
          <div v-for="g in groups" :key="g.title" class="flex flex-col gap-2">
            <div class="text-xs font-semibold" style="color: var(--text-mute)">{{ g.title }}</div>
            <div
              v-for="item in g.items"
              :key="g.title + item.desc"
              class="flex items-center justify-between gap-3 py-2 px-3 rounded-lg"
              style="background-color: var(--bg-app); border: 1px solid var(--border-color)"
            >
              <div class="flex items-center gap-1 flex-wrap">
                <template v-for="(k, idx) in item.keys" :key="k + idx">
                  <UKbd :value="k" size="sm" />
                  <span
                    v-if="idx < item.keys.length - 1"
                    class="text-xs"
                    style="color: var(--text-mute)"
                  >
                    +
                  </span>
                </template>
              </div>
              <div class="text-xs" style="color: var(--text-main)">{{ item.desc }}</div>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton color="primary" variant="soft" @click="isOpen = false">关闭</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
