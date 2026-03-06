<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  Collapsible,
  CollapsibleContent,
} from '~/components/ui/collapsible'
import { cn } from '~/lib/utils'
import { useChainOfThought } from './context'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { isOpen } = useChainOfThought()
</script>

<template>
  <Collapsible :open="isOpen">
    <CollapsibleContent
      :class="
        cn(
          'pl-3 space-y-1.5 overflow-hidden',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          props.class,
        )
      "
      :style="{
        borderLeft: '2px solid var(--border-color)',
      }"
      v-bind="$attrs"
    >
      <slot />
    </CollapsibleContent>
  </Collapsible>
</template>
