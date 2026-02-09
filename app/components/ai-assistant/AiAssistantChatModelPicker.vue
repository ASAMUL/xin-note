<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from '~/components/ai-elements/prompt-input';

import { cn } from '~/lib/utils';
import { useAiModelPoolSettings } from '~/composables/ai/useAiModelPoolSettings';

const props = defineProps<{
  disabled?: boolean;
  class?: HTMLAttributes['class'];
}>();

const { enabledModelIds, aiChatModelId, setRoleModel } = useAiModelPoolSettings();

const normalizedCurrent = computed(() => (aiChatModelId.value || '').trim());

const hasEnabledModels = computed(() => enabledModelIds.value.length > 0);

const modelValue = computed(() => {
  const current = normalizedCurrent.value;
  // SelectRoot 的 model-value 建议为 string；为空时传 undefined 走 placeholder
  return current || undefined;
});

const handleUpdateModelValue = async (value: unknown) => {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) return;
  // 只会从 enabledModelIds 中选择，这里理论上一定成功
  await setRoleModel('chat', id);
};
</script>

<template>
  <div :class="cn('min-w-0', props.class)">
    <PromptInputSelect
      :model-value="modelValue"
      :disabled="!!props.disabled || !hasEnabledModels"
      @update:model-value="handleUpdateModelValue"
    >
      <PromptInputSelectTrigger
        class="h-7 px-2 text-xs max-w-[260px]"
        :title="
          normalizedCurrent
            ? normalizedCurrent
            : hasEnabledModels
              ? '未选择聊天模型（将禁用聊天入口）'
              : '暂无可用模型：请先在设置中添加并启用模型'
        "
      >
        <PromptInputSelectValue
          :placeholder="hasEnabledModels ? '选择聊天模型' : '无可用模型'"
          class="font-mono"
        />
      </PromptInputSelectTrigger>

      <PromptInputSelectContent class="w-[560px] max-h-[50vh]">
        <PromptInputSelectItem
          v-for="id in enabledModelIds"
          :key="id"
          :value="id"
        >
          <div class="flex items-center gap-2 w-full">
            <UIcon name="i-lucide-box" class="size-4" />
            <span class="font-mono text-xs truncate">{{ id }}</span>
          </div>
        </PromptInputSelectItem>
      </PromptInputSelectContent>
    </PromptInputSelect>
  </div>
</template>

