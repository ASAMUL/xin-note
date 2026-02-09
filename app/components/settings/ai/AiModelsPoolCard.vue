<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { AiModelPoolItem } from '~/composables/useSettings';

import { Switch } from '~/components/ui/switch';
import { cn } from '~/lib/utils';

const props = defineProps<{
  models: AiModelPoolItem[];
  class?: HTMLAttributes['class'];
}>();

const emit = defineEmits<{
  (e: 'toggle', modelId: string, enabled: boolean): void;
  (e: 'remove', modelId: string): void;
}>();

const enabledCount = computed(() => props.models.filter((m) => m.enabled).length);
</script>

<template>
  <div :class="cn('section-card space-y-3', props.class)">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-lucide-boxes" class="w-4 h-4" />
        <div class="min-w-0">
          <div class="text-sm font-medium truncate" style="color: var(--text-main)">模型池</div>
          <div class="text-xs truncate" style="color: var(--text-mute)">
            已启用 {{ enabledCount }}/{{ props.models.length }}
          </div>
        </div>
      </div>

      <div class="shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <div
      v-if="props.models.length === 0"
      class="rounded-md px-3 py-3 text-xs"
      style="
        color: var(--text-mute);
        background-color: var(--bg-sidebar);
        border: 1px dashed var(--border-color);
      "
    >
      暂无模型，请点击右上角「管理」添加。
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="m in props.models"
        :key="m.id"
        class="flex items-center gap-3 rounded-md px-3 py-2"
        style="background-color: var(--bg-sidebar); border: 1px solid var(--border-color)"
      >
        <div class="min-w-0 flex-1">
          <div class="text-xs font-mono truncate" style="color: var(--text-main)">
            {{ m.id }}
          </div>
          <div class="text-[11px]" style="color: var(--text-mute)">
            {{ m.enabled ? '已启用' : '已禁用' }}
          </div>
        </div>

        <Switch
          :model-value="m.enabled"
          :aria-label="`Toggle model ${m.id}`"
          @update:model-value="(v) => emit('toggle', m.id, !!v)"
        />

        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          title="移除模型"
          @click="emit('remove', m.id)"
        />
      </div>
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
</style>

