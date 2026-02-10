<script setup lang="ts">
import { useAppLocale } from '~/composables/i18n/useAppLocale';
/**
 * 设置 - 通用
 * - 语言切换：写入 settings.json，并同步到 i18n
 */

defineProps<{ open?: boolean }>();

const { locale, setLocale } = useAppLocale();
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h4 class="text-sm font-semibold" style="color: var(--text-main)">
        {{ $t('settings.general.title') }}
      </h4>
      <p class="text-xs" style="color: var(--text-mute)">
        {{ $t('settings.general.description') }}
      </p>
    </div>

    <div class="section-card space-y-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-languages" class="w-4 h-4" />
        <span class="text-sm font-medium" style="color: var(--text-main)">
          {{ $t('settings.general.language.title') }}
        </span>
      </div>

      <p class="text-xs -mt-2" style="color: var(--text-mute)">
        {{ $t('settings.general.language.description') }}
      </p>

      <div class="flex items-center gap-2">
        <UButton
          size="sm"
          :variant="locale === 'zh-CN' ? 'soft' : 'ghost'"
          :color="locale === 'zh-CN' ? 'primary' : 'neutral'"
          icon="i-lucide-check"
          :ui="{ leadingIcon: locale === 'zh-CN' ? '' : 'opacity-0' }"
          @click="setLocale('zh-CN')"
        >
          {{ $t('settings.general.language.zhCN') }}
        </UButton>

        <UButton
          size="sm"
          :variant="locale === 'en' ? 'soft' : 'ghost'"
          :color="locale === 'en' ? 'primary' : 'neutral'"
          icon="i-lucide-check"
          :ui="{ leadingIcon: locale === 'en' ? '' : 'opacity-0' }"
          @click="setLocale('en')"
        >
          {{ $t('settings.general.language.en') }}
        </UButton>
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
