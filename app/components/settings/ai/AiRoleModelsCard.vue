<script setup lang="ts">
import type { DropdownMenuItem } from '#ui/components/DropdownMenu.vue';
import type { HTMLAttributes } from 'vue';
import { cn } from '~/lib/utils';

type Role = 'chat' | 'fast' | 'completion';

const props = defineProps<{
  enabledModelIds: string[];
  chatModelId: string | null;
  fastModelId: string | null;
  completionModelId: string | null;
  class?: HTMLAttributes['class'];
}>();

const emit = defineEmits<{
  (e: 'select', role: Role, modelId: string | null): void;
}>();

const isEmpty = computed(() => props.enabledModelIds.length === 0);

const buildRoleItems = (role: Role, current: string | null) => {
  const items: DropdownMenuItem[][] = [];

  if (isEmpty.value) {
    items.push([{ type: 'label', label: '请先在模型池启用至少一个模型' }]);
    return items;
  }

  items.push([
    { type: 'label', label: '选择已启用模型' },
    ...props.enabledModelIds.map((id) => ({
      label: id,
      icon: current && id === current ? 'i-lucide-check' : 'i-lucide-box',
      onSelect: () => emit('select', role, id),
    })),
  ]);

  items.push([
    { type: 'separator' },
    {
      label: '清空选择',
      icon: 'i-lucide-x',
      onSelect: () => emit('select', role, null),
    },
  ]);

  return items;
};

const chatItems = computed(() => buildRoleItems('chat', props.chatModelId));
const fastItems = computed(() => buildRoleItems('fast', props.fastModelId));
const completionItems = computed(() => buildRoleItems('completion', props.completionModelId));
</script>

<template>
  <div :class="cn('section-card space-y-3', props.class)">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-sliders-horizontal" class="w-4 h-4" />
      <div class="min-w-0">
        <div class="text-sm font-medium truncate" style="color: var(--text-main)">模型配置</div>
        <div class="text-xs truncate" style="color: var(--text-mute)">
          为不同场景分别选择“当前启动模型”（仅可从已启用模型中选择）
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <!-- chat -->
      <div
        class="flex items-center justify-between gap-3 rounded-md px-3 py-2"
        style="background-color: var(--bg-sidebar); border: 1px solid var(--border-color)"
      >
        <div class="min-w-0 flex-1">
          <div class="text-xs font-medium" style="color: var(--text-main)">聊天模型</div>
          <div class="text-[11px] font-mono truncate" style="color: var(--text-mute)">
            {{ props.chatModelId || '未选择（将禁用聊天入口）' }}
          </div>
        </div>

        <UDropdownMenu :items="chatItems" :ui="{ content: 'w-[560px]', label: 'text-xs' }">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-chevrons-up-down"
            :disabled="isEmpty"
          >
            选择
          </UButton>
        </UDropdownMenu>
      </div>

      <!-- fast -->
      <div
        class="flex items-center justify-between gap-3 rounded-md px-3 py-2"
        style="background-color: var(--bg-sidebar); border: 1px solid var(--border-color)"
      >
        <div class="min-w-0 flex-1">
          <div class="text-xs font-medium" style="color: var(--text-main)">快速模型</div>
          <div class="text-[11px] font-mono truncate" style="color: var(--text-mute)">
            {{ props.fastModelId || '未选择' }}
          </div>
        </div>

        <UDropdownMenu :items="fastItems" :ui="{ content: 'w-[560px]', label: 'text-xs' }">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-chevrons-up-down"
            :disabled="isEmpty"
          >
            选择
          </UButton>
        </UDropdownMenu>
      </div>

      <!-- completion -->
      <div
        class="flex items-center justify-between gap-3 rounded-md px-3 py-2"
        style="background-color: var(--bg-sidebar); border: 1px solid var(--border-color)"
      >
        <div class="min-w-0 flex-1">
          <div class="text-xs font-medium" style="color: var(--text-main)">补全模型</div>
          <div class="text-[11px] font-mono truncate" style="color: var(--text-mute)">
            {{ props.completionModelId || '未选择（将禁用 Tab 续写）' }}
          </div>
        </div>

        <UDropdownMenu :items="completionItems" :ui="{ content: 'w-[560px]', label: 'text-xs' }">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-chevrons-up-down"
            :disabled="isEmpty"
          >
            选择
          </UButton>
        </UDropdownMenu>
      </div>

      <div class="text-[11px] pt-1" style="color: var(--text-mute)">
        提示：聊天入口与补全入口会根据对应角色模型是否“已选择且启用”自动禁用。
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

