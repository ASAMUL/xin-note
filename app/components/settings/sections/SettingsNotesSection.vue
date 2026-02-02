<script setup lang="ts">
/**
 * 设置 - 笔记相关
 * 目前仅包含「笔记存储目录」：与原 `AppNavbar.vue` 的设置项一致。
 */

defineProps<{ open?: boolean }>();

const { notesDirectory, selectNotesDirectory } = useSettings();
const toast = useToast();

const handleSelectDirectory = async () => {
  const folder = await selectNotesDirectory();
  if (!folder) return;
  toast.add({
    title: '已更新笔记存储目录',
    description: folder,
    color: 'primary',
  });
};
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h4 class="text-sm font-semibold" style="color: var(--text-main)">笔记</h4>
      <p class="text-xs" style="color: var(--text-mute)">配置笔记存储目录等偏好</p>
    </div>

    <div class="section-card">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-folder" class="w-4 h-4" />
        <span class="text-sm font-medium" style="color: var(--text-main)">笔记存储目录</span>
      </div>

      <div class="mt-3 flex items-center gap-3">
        <div class="path-box">
          <span v-if="notesDirectory">{{ notesDirectory }}</span>
          <span v-else class="italic">未设置</span>
        </div>

        <UButton
          variant="soft"
          color="primary"
          size="sm"
          icon="i-lucide-folder-open"
          @click="handleSelectDirectory"
        >
          {{ notesDirectory ? '更改' : '选择' }}
        </UButton>
      </div>

      <p class="mt-2 text-xs" style="color: var(--text-mute)">
        该目录用于存放你的 Markdown 笔记；未设置时部分功能会提示你选择目录。
      </p>
    </div>
  </div>
</template>

<style scoped>
.section-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  background-color: var(--bg-app);
}

.path-box {
  flex: 1;
  min-height: 36px;
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-sidebar);
  color: var(--text-mute);
  font-size: 12px;
  word-break: break-all;
}
</style>
