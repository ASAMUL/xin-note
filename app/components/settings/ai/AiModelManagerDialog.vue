<script setup lang="ts">
import {
  ModelSelectorContent,
  ModelSelectorDialog,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorSeparator,
} from '~/components/ai-elements/model-selector';

import { useAiModelsList } from '~/composables/ai/useAiModelsList';

const props = withDefaults(
  defineProps<{
    open: boolean;
    baseUrl: string;
    apiKey: string | null;
    currentModel?: string;
  }>(),
  {
    apiKey: null,
    currentModel: undefined,
  },
);

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'select', modelId: string): void;
}>();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});

const toast = useToast();
const { isLoading, error, models, listModels } = useAiModelsList();

const normalizedBaseUrl = computed(() => (props.baseUrl || '').trim());
const normalizedCurrentModel = computed(() => (props.currentModel || '').trim());

const loadModels = async () => {
  const baseURL = normalizedBaseUrl.value;
  if (!baseURL) {
    toast.add({ title: '请先填写 Base URL', color: 'neutral' });
    return;
  }

  try {
    await listModels({
      baseURL,
      apiKey: props.apiKey,
    });
  } catch (e) {
    toast.add({
      title: '获取模型列表失败',
      description: (e as Error).message,
      color: 'error',
    });
  }
};

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;
    void loadModels();
  },
);

const groupedModels = computed(() => {
  const map = new Map<string, string[]>();
  for (const raw of models.value) {
    const id = (raw || '').trim();
    if (!id) continue;
    const provider = id.includes('/') ? id.split('/')[0] || '' : '其它';
    if (!map.has(provider)) map.set(provider, []);
    map.get(provider)!.push(id);
  }

  const result = Array.from(map.entries()).map(([provider, ids]) => ({
    provider,
    ids: Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b)),
  }));

  result.sort((a, b) => {
    if (a.provider === '其它') return 1;
    if (b.provider === '其它') return -1;
    return a.provider.localeCompare(b.provider);
  });

  return result;
});

const handleSelect = (modelId: string) => {
  emit('select', modelId);
  isOpen.value = false;
};
</script>

<template>
  <ModelSelectorDialog v-model:open="isOpen">
    <ModelSelectorContent title="模型管理" class="max-w-2xl">
      <!-- 头部：展示 baseURL + 刷新 -->
      <div class="px-3 pt-3 pb-2 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-medium" style="color: var(--text-main)">选择模型</div>
          <div class="text-xs truncate" style="color: var(--text-mute)">
            {{ normalizedBaseUrl || '（未填写 Base URL）' }}
          </div>
        </div>

        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-refresh-cw"
          :loading="isLoading"
          @click="loadModels"
        >
          刷新
        </UButton>
      </div>

      <ModelSelectorInput placeholder="搜索模型..." />

      <div v-if="error" class="px-3 py-2 text-xs" style="color: var(--color-error)">
        {{ error }}
      </div>

      <ModelSelectorList class="max-h-[60vh]">
        <ModelSelectorEmpty>
          <div class="py-6 text-center text-sm" style="color: var(--text-mute)">
            {{ isLoading ? '正在获取模型列表…' : '没有找到可用模型' }}
          </div>
        </ModelSelectorEmpty>

        <template v-for="(group, idx) in groupedModels" :key="group.provider">
          <ModelSelectorGroup :heading="group.provider">
            <ModelSelectorItem
              v-for="id in group.ids"
              :key="id"
              :value="id"
              @select="handleSelect(id)"
            >
              <div class="flex items-center gap-2 w-full">
                <ModelSelectorLogo
                  v-if="group.provider !== '其它'"
                  :provider="group.provider"
                  class="size-4"
                />
                <ModelSelectorName>{{ id }}</ModelSelectorName>

                <UIcon
                  v-if="normalizedCurrentModel && id === normalizedCurrentModel"
                  name="i-lucide-check"
                  class="ml-auto size-4"
                  style="color: var(--accent-color)"
                />
              </div>
            </ModelSelectorItem>
          </ModelSelectorGroup>

          <ModelSelectorSeparator v-if="idx !== groupedModels.length - 1" />
        </template>
      </ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelectorDialog>
</template>
