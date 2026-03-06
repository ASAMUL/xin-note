<script setup lang="ts">
import type { HtmlHTMLAttributes } from 'vue'
import {
  Collapsible,
  CollapsibleTrigger,
} from '~/components/ui/collapsible'
import { cn } from '~/lib/utils'
import { ChevronDownIcon } from 'lucide-vue-next'
import { useChainOfThought } from './context'

const props = defineProps<{
  isComplete?: boolean
  class?: HtmlHTMLAttributes['class']
}>()

const { isOpen, setIsOpen } = useChainOfThought()
</script>

<template>
  <Collapsible :open="isOpen" @update:open="setIsOpen">
    <CollapsibleTrigger
      :class="
        cn(
          'group flex w-full items-center gap-1 text-sm transition-colors cursor-pointer select-none',
          props.class,
        )
      "
      :style="{ color: 'var(--text-mute)' }"
      v-bind="$attrs"
    >
      <span class="flex-1 text-left">
        <slot>{{ props.isComplete ? '思考完毕' : '正在思考…' }}</slot>
      </span>
      <ChevronDownIcon
        :class="
          cn(
            'size-3.5 transition-transform duration-200',
            isOpen ? 'rotate-180' : 'rotate-0',
          )
        "
        :style="{ color: 'var(--text-mute)' }"
      />
    </CollapsibleTrigger>
  </Collapsible>
</template>
