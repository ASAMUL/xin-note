<script setup lang="ts">
/**
 * 另存为（复制当前文件）
 * - 只负责收集“文件名 + 目录”
 * - 实际写文件/刷新列表由外层调用方处理（避免耦合 useTabs/useNotes）
 */

const props = defineProps<{
  open: boolean;
  defaultDirectory: string;
  defaultFileName: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'confirm', payload: { directory: string; fileName: string }): void;
}>();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});

const directory = ref('');
const fileName = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    directory.value = props.defaultDirectory || '';
    fileName.value = props.defaultFileName || '';
  },
);

const pickDirectory = async () => {
  if (!window.ipcRenderer) return;
  const result = (await window.ipcRenderer.invoke('dialog-select-folder')) as string | null;
  if (result) directory.value = result;
};

const normalizeFileName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
};

const canConfirm = computed(() => {
  return !!directory.value.trim() && !!fileName.value.trim();
});

const handleConfirm = () => {
  const dir = directory.value.trim();
  const name = normalizeFileName(fileName.value);
  if (!dir || !name) return;
  emit('confirm', { directory: dir, fileName: name });
  isOpen.value = false;
};
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-4 flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-save-all" class="w-5 h-5" />
          <h3 class="text-base font-semibold" style="color: var(--text-main)">另存为</h3>
        </div>

        <div class="flex flex-col gap-2">
          <div class="text-xs font-medium" style="color: var(--text-mute)">文件名</div>
          <UInput
            v-model="fileName"
            size="sm"
            icon="i-lucide-file-text"
            placeholder="例如：我的笔记副本.md"
          />
          <div class="text-xs" style="color: var(--text-mute)">
            会自动补齐 .md 后缀，不会切换到新文件
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="text-xs font-medium" style="color: var(--text-mute)">保存到目录</div>
          <div class="flex items-center gap-2">
            <UInput
              v-model="directory"
              size="sm"
              icon="i-lucide-folder"
              placeholder="选择保存目录"
              class="flex-1"
            />
            <UButton
              variant="soft"
              color="primary"
              size="sm"
              icon="i-lucide-folder-open"
              @click="pickDirectory"
            >
              选择
            </UButton>
          </div>
          <div class="text-xs" style="color: var(--text-mute)">
            默认是当前文件所在目录（也可手动粘贴路径）
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <UButton variant="ghost" color="neutral" @click="isOpen = false">取消</UButton>
          <UButton color="primary" :disabled="!canConfirm" @click="handleConfirm">创建副本</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
