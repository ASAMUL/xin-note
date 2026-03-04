<script setup lang="ts">
import type { AiAssistantErrorInfo } from '~/types/ai-assistant';

const props = defineProps<{
  error: AiAssistantErrorInfo | null;
}>();

const emit = defineEmits<{
  (e: 'view-detail'): void;
}>();

const { t, locale } = useI18n();

const categoryLabel = computed(() =>
  t(`aiAssistant.error.categories.${props.error?.category || 'unknown'}`),
);

const createdAtLabel = computed(() => {
  if (!props.error) return '--';
  const localeValue = locale.value === 'en' ? 'en-US' : 'zh-CN';
  const date = new Date(props.error.createdAt);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat(localeValue, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
});
</script>

<template>
  <div
    class="mt-3 rounded-md px-3 py-2"
    style="
      background-color: var(--color-error-bg-subtle);
      border: 1px solid var(--color-error-bg);
    "
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-2 min-w-0">
        <UIcon
          name="i-lucide-triangle-alert"
          class="w-4 h-4 mt-0.5 shrink-0"
          style="color: var(--color-error)"
        />
        <div class="min-w-0">
          <div class="text-xs font-semibold leading-5" style="color: var(--color-error)">
            {{ props.error?.title || $t('aiAssistant.error.titles.unknown') }}
          </div>
          <div class="text-xs leading-5 mt-0.5 whitespace-pre-wrap wrap-break-word" style="color: var(--text-main)">
            {{ props.error?.summary || $t('aiAssistant.error.summaries.unknown') }}
          </div>
        </div>
      </div>

      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        icon="i-lucide-file-warning"
        @click="emit('view-detail')"
      >
        {{ $t('aiAssistant.error.actions.viewDetail') }}
      </UButton>
    </div>

    <div class="text-[11px] mt-2 flex items-center gap-2 flex-wrap" style="color: var(--text-mute)">
      <span>{{ categoryLabel }}</span>
      <span v-if="typeof props.error?.statusCode === 'number'">HTTP {{ props.error?.statusCode }}</span>
      <span>{{ createdAtLabel }}</span>
    </div>
  </div>
</template>
