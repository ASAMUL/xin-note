<script setup lang="ts">
/**
 * 思维链步骤组件 — Notion 风格
 * 每个步骤以纯文本展示，使用淡入动画逐步出现
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="
      cn(
        'text-sm leading-relaxed animate-in fade-in-0 duration-300',
        props.class,
      )
    "
    :style="{ color: 'var(--text-mute)' }"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
