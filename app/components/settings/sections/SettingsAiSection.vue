<script setup lang="ts">
/**
 * 设置 - AI 配置
 */

import AiModelManagerDialog from '../ai/AiModelManagerDialog.vue';
import AiModelsPoolCard from '../ai/AiModelsPoolCard.vue';
import AiRoleModelsCard from '../ai/AiRoleModelsCard.vue';
import { parseAiBaseUrl, toModelsListUrl, toOpenAiChatCompletionsUrl } from '~/utils/ai/baseUrl';
import { useAiModelPoolSettings } from '~/composables/ai/useAiModelPoolSettings';

const props = defineProps<{ open?: boolean }>();

const { aiApiKey, aiBaseUrl, setAiApiKey, setAiBaseUrl } = useSettings();

const {
  pool,
  poolModelIds,
  enabledModelIds,
  aiChatModelId,
  aiFastModelId,
  aiCompletionModelId,
  addToPool,
  setEnabled,
  removeFromPool,
  setRoleModel,
} = useAiModelPoolSettings();

const toast = useToast();

// 用草稿值编辑，点击保存后写入 settings.json
const aiKeyDraft = ref('');
const aiBaseUrlDraft = ref('');
const showAiKey = ref(false);
const isSaving = ref(false);
const showModelManager = ref(false);

const draftApiKey = computed(() => (aiKeyDraft.value || '').trim() || null);
const previewChatCompletionsUrl = computed(() => toOpenAiChatCompletionsUrl(aiBaseUrlDraft.value));
const previewModelsUrl = computed(() => toModelsListUrl(aiBaseUrlDraft.value));
const disableAutoV1 = computed(() => parseAiBaseUrl(aiBaseUrlDraft.value).disableAutoAppendV1);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    aiKeyDraft.value = aiApiKey.value || '';
    aiBaseUrlDraft.value = aiBaseUrl.value || 'https://api.openai.com';
  },
  { immediate: true },
);

const saveAiSettings = async () => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    await setAiBaseUrl(aiBaseUrlDraft.value);
    await setAiApiKey(aiKeyDraft.value);
    toast.add({ title: $t('settings.ai.toast.saved'), color: 'primary' });
  } catch (e) {
    console.error('保存 AI 设置失败:', e);
    toast.add({ title: $t('settings.ai.toast.saveFailed'), color: 'error' });
  } finally {
    isSaving.value = false;
  }
};

const handleModelSelect = async (modelId: string) => {
  const ok = await addToPool(modelId);
  if (!ok) {
    toast.add({
      title: $t('settings.ai.toast.addModelFailed'),
      description: modelId,
      color: 'error',
    });
    return;
  }
  toast.add({ title: $t('settings.ai.toast.addedToPool'), description: modelId, color: 'primary' });
};

const handleToggleModel = async (modelId: string, enabled: boolean) => {
  await setEnabled(modelId, enabled);
};

const handleRemoveModel = async (modelId: string) => {
  await removeFromPool(modelId);
};

const handleRoleSelect = async (role: 'chat' | 'fast' | 'completion', modelId: string | null) => {
  const ok = await setRoleModel(role, modelId);
  if (!ok) {
    toast.add({ title: $t('settings.ai.toast.roleModelNotEnabled'), color: 'neutral' });
  }
};
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h4 class="text-sm font-semibold" style="color: var(--text-main)">
        {{ $t('settings.ai.title') }}
      </h4>
      <p class="text-xs" style="color: var(--text-mute)">
        {{ $t('settings.ai.description') }}
      </p>
    </div>

    <div class="section-card space-y-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
        <span class="text-sm font-medium" style="color: var(--text-main)">
          {{ $t('settings.ai.connection.title') }}
        </span>
      </div>

      <UInput
        v-model="aiBaseUrlDraft"
        size="sm"
        icon="i-lucide-link"
        :placeholder="$t('settings.ai.connection.baseUrlPlaceholder')"
      />

      <div class="-mt-2 space-y-0.5 text-xs">
        <div style="color: var(--text-mute)">
          {{ $t('settings.ai.connection.previewChat') }}：
          <span class="font-mono">{{ previewChatCompletionsUrl || '—' }}</span>
        </div>
        <div style="color: var(--text-mute)">
          {{ $t('settings.ai.connection.previewModels') }}：
          <span class="font-mono">{{ previewModelsUrl || '—' }}</span>
        </div>
        <div style="color: var(--text-mute)">
          {{ $t('settings.ai.connection.hintPrefix') }}：{{
            disableAutoV1
              ? $t('settings.ai.connection.hintAutoV1Disabled')
              : $t('settings.ai.connection.hintAutoV1Enabled')
          }}
        </div>
      </div>

      <UInput
        v-model="aiKeyDraft"
        size="sm"
        :type="showAiKey ? 'text' : 'password'"
        icon="i-lucide-key"
        :placeholder="$t('settings.ai.connection.apiKeyPlaceholder')"
      >
        <template #trailing>
          <UButton
            :icon="showAiKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="showAiKey = !showAiKey"
          />
        </template>
      </UInput>

      <div class="flex justify-end gap-2 pt-1">
        <UButton
          variant="soft"
          color="primary"
          size="sm"
          icon="i-lucide-save"
          :loading="isSaving"
          @click="saveAiSettings"
        >
          {{ $t('common.save') }}
        </UButton>
      </div>
    </div>

    <AiModelsPoolCard :models="pool" @toggle="handleToggleModel" @remove="handleRemoveModel">
      <template #actions>
        <UButton
          variant="soft"
          color="neutral"
          size="sm"
          icon="i-lucide-settings-2"
          @click="showModelManager = true"
        >
          {{ $t('common.manage') }}
        </UButton>
      </template>
    </AiModelsPoolCard>

    <AiRoleModelsCard
      :enabled-model-ids="enabledModelIds"
      :chat-model-id="aiChatModelId"
      :fast-model-id="aiFastModelId"
      :completion-model-id="aiCompletionModelId"
      @select="handleRoleSelect"
    />
  </div>

  <AiModelManagerDialog
    v-model:open="showModelManager"
    :base-url="aiBaseUrlDraft"
    :api-key="draftApiKey"
    :current-model="aiChatModelId || undefined"
    :selected-models="poolModelIds"
    @select="handleModelSelect"
  />
</template>

<style scoped>
.section-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  background-color: var(--bg-app);
}
</style>
