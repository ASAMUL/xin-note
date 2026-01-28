<script setup lang="ts">
/**
 * 关于
 * - Electron 环境下通过 IPC 读取版本号
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

const version = ref<string>('0.0.1');
const startTime = ref<string>('');

onMounted(async () => {
  if (!window.ipcRenderer) return;
  try {
    const v = (await window.ipcRenderer.invoke('app-get-version')) as string | undefined;
    if (v) version.value = v;
  } catch (e) {
    console.warn('读取版本号失败:', e);
  }

  try {
    const t = (await window.ipcRenderer.invoke('app-start-time')) as string | undefined;
    if (t) startTime.value = t;
  } catch (e) {
    console.warn('读取启动时间失败:', e);
  }
});
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-5 flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center"
              style="
                background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
                color: white;
              "
            >
              <UIcon name="i-lucide-feather" class="w-5 h-5" />
            </div>
            <div class="flex flex-col">
              <div class="text-base font-semibold" style="color: var(--text-main)">Lumina</div>
              <div class="text-xs" style="color: var(--text-mute)">版本 {{ version }}</div>
            </div>
          </div>
          <UButton variant="ghost" color="neutral" icon="i-lucide-x" @click="isOpen = false" />
        </div>

        <div class="text-sm leading-6" style="color: var(--text-mute)">
          <div>一个 AI 辅助写作 / 笔记应用（Xin-Note）。</div>
          <div v-if="startTime" class="mt-2">启动时间：{{ startTime }}</div>
        </div>

        <div class="flex justify-end">
          <UButton color="primary" variant="soft" @click="isOpen = false">关闭</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
