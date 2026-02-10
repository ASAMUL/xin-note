<script setup lang="ts">
/**
 * 设置 - 笔记相关
 */

defineProps<{ open?: boolean }>();

const { notesDirectory, selectNotesDirectory } = useSettings();
const toast = useToast();

const handleSelectDirectory = async () => {
  const folder = await selectNotesDirectory();
  if (!folder) return;
  toast.add({
    title: $t('settings.notes.toast.directoryUpdated'),
    description: folder,
    color: 'primary',
  });
};
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h4 class="text-sm font-semibold" style="color: var(--text-main)">
        {{ $t('settings.notes.title') }}
      </h4>
      <p class="text-xs" style="color: var(--text-mute)">
        {{ $t('settings.notes.description') }}
      </p>
    </div>

    <div class="section-card">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-folder" class="w-4 h-4" />
        <span class="text-sm font-medium" style="color: var(--text-main)">
          {{ $t('settings.notes.directory.title') }}
        </span>
      </div>

      <div class="mt-3 flex items-center gap-3">
        <div class="path-box">
          <span v-if="notesDirectory">{{ notesDirectory }}</span>
          <span v-else class="italic">{{ $t('settings.notes.directory.unset') }}</span>
        </div>

        <UButton
          variant="soft"
          color="primary"
          size="sm"
          icon="i-lucide-folder-open"
          @click="handleSelectDirectory"
        >
          {{
            notesDirectory
              ? $t('settings.notes.directory.change')
              : $t('settings.notes.directory.select')
          }}
        </UButton>
      </div>

      <p class="mt-2 text-xs" style="color: var(--text-mute)">
        {{ $t('settings.notes.directory.help') }}
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
