<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { InputGroupTextarea } from '~/components/ui/input-group'
import { cn } from '~/lib/utils'
import { computed, ref } from 'vue'
import { usePromptInput } from './context'

type PromptInputTextareaProps = InstanceType<typeof InputGroupTextarea>['$props']

interface Props extends /* @vue-ignore */ PromptInputTextareaProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'keydown', event: KeyboardEvent): void
  (e: 'cursor-change', payload: { value: string, selectionStart: number, selectionEnd: number }): void
  (e: 'blur', event: FocusEvent): void
}>()

const {
  textInput,
  setTextInput,
  submitForm,
  addFiles,
  files,
  removeFile,
  references,
  removeReference,
} = usePromptInput()
const isComposing = ref(false)

function emitCursorChange(target: EventTarget | null) {
  if (!(target instanceof HTMLTextAreaElement)) {
    return
  }
  emit('cursor-change', {
    value: target.value,
    selectionStart: target.selectionStart ?? target.value.length,
    selectionEnd: target.selectionEnd ?? target.value.length,
  })
}

function handleKeyDown(e: KeyboardEvent) {
  emit('keydown', e)
  if (e.defaultPrevented) {
    return
  }

  if (e.key === 'Enter') {
    if (isComposing.value || e.shiftKey)
      return
    e.preventDefault()
    submitForm()
  }

  // Remove last attachment/reference on backspace if input is empty
  if (e.key === 'Backspace' && textInput.value === '') {
    const lastFile = files.value[files.value.length - 1]
    if (lastFile) {
      removeFile(lastFile.id)
      return
    }

    const lastReference = references.value[references.value.length - 1]
    if (lastReference) {
      removeReference(lastReference.id)
    }
  }
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items)
    return

  const pastedFiles: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file)
        pastedFiles.push(file)
    }
  }

  if (pastedFiles.length > 0) {
    e.preventDefault()
    addFiles(pastedFiles)
  }
}

function handleInput(e: Event) {
  emitCursorChange(e.target)
}

function handleCursorEvent(e: Event) {
  emitCursorChange(e.target)
}

function handleBlur(e: FocusEvent) {
  emit('blur', e)
}

const modelValue = computed({
  get: () => textInput.value,
  set: val => setTextInput(val),
})
</script>

<template>
  <InputGroupTextarea
    v-model="modelValue"
    placeholder="What would you like to know?"
    name="message"
    :class="cn('field-sizing-content max-h-48 min-h-16', props.class)"
    v-bind="props"
    @keydown="handleKeyDown"
    @keyup="handleCursorEvent"
    @input="handleInput"
    @click="handleCursorEvent"
    @focus="handleCursorEvent"
    @blur="handleBlur"
    @paste="handlePaste"
    @compositionstart="isComposing = true"
    @compositionend="isComposing = false"
  />
</template>
