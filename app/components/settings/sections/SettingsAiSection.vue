<script setup lang="ts">
/**
 * 设置 - AI 配置
 * 与原 `AppNavbar.vue` 的 AI 设置保持一致，但把 UI 与逻辑独立出来，方便后续扩展（如模型管理弹窗）。
 */

import AiModelManagerDialog from '../ai/AiModelManagerDialog.vue';
import { parseAiBaseUrl, toModelsListUrl, toOpenAiChatCompletionsUrl } from '~/utils/ai/baseUrl';

const props = defineProps<{ open?: boolean }>();

const { aiApiKey, aiBaseUrl, aiModel, setAiApiKey, setAiBaseUrl, setAiModel } = useSettings();

const toast = useToast();

// 用草稿值编辑，点击保存后写入 settings.json
const aiKeyDraft = ref('');
const aiBaseUrlDraft = ref('');
const aiModelDraft = ref('');
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
    aiModelDraft.value = aiModel.value || 'openai/gpt-4o-mini';
  },
  { immediate: true },
);

const saveAiSettings = async () => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    await setAiBaseUrl(aiBaseUrlDraft.value);
    await setAiModel(aiModelDraft.value);
    await setAiApiKey(aiKeyDraft.value);
    toast.add({ title: 'AI 设置已保存', color: 'primary' });
  } catch (e) {
    console.error('保存 AI 设置失败:', e);
    toast.add({ title: '保存失败，请重试', color: 'error' });
  } finally {
    isSaving.value = false;
  }
};

const handleModelSelect = (modelId: string) => {
  aiModelDraft.value = modelId;
  toast.add({ title: '已选择模型', description: modelId, color: 'primary' });
};
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h4 class="text-sm font-semibold" style="color: var(--text-main)">AI 配置</h4>
      <p class="text-xs" style="color: var(--text-mute)">
        配置 API Key、Base URL 与默认模型（仅保存在本地 settings.json）
      </p>
    </div>

    <div class="section-card space-y-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
        <span class="text-sm font-medium" style="color: var(--text-main)">连接配置</span>
      </div>

      <UInput
        v-model="aiBaseUrlDraft"
        size="sm"
        icon="i-lucide-link"
        placeholder="API 地址（Base URL，例如 https://api.deepseek.com；末尾加 # 可禁用自动追加 /v1）"
      />

      <div class="-mt-2 space-y-0.5 text-xs">
        <div style="color: var(--text-mute)">
          预览（Chat Completions）：
          <span class="font-mono">{{ previewChatCompletionsUrl || '—' }}</span>
        </div>
        <div style="color: var(--text-mute)">
          预览（Models）：
          <span class="font-mono">{{ previewModelsUrl || '—' }}</span>
        </div>
        <div style="color: var(--text-mute)">
          提示：{{
            disableAutoV1
              ? '已禁用自动追加 /v1（因为 Base URL 末尾包含 #）'
              : '默认会自动追加 /v1（末尾加 # 可禁用）'
          }}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UInput
          v-model="aiModelDraft"
          size="sm"
          icon="i-lucide-box"
          class="flex-1"
          placeholder="模型（例如 openai/gpt-4o-mini / anthropic/claude-3-5-haiku-latest / google/gemini-2.0-flash / openai-compatible/google/gemini-3-flash-preview）"
        />
        <UButton
          variant="soft"
          color="neutral"
          size="sm"
          icon="i-lucide-settings-2"
          @click="showModelManager = true"
        >
          管理
        </UButton>
      </div>

      <UInput
        v-model="aiKeyDraft"
        size="sm"
        :type="showAiKey ? 'text' : 'password'"
        icon="i-lucide-key"
        placeholder="API Key（随模型供应商切换；仅保存在本地 settings.json）"
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
          保存
        </UButton>
      </div>
    </div>
  </div>

  <AiModelManagerDialog
    v-model:open="showModelManager"
    :base-url="aiBaseUrlDraft"
    :api-key="draftApiKey"
    :current-model="aiModelDraft"
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
