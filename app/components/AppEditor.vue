<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const editor = useEditor({
  content: '<h2>Start writing your next masterpiece...</h2><p>Just start typing!</p>',
  extensions: [
    StarterKit,
  ],
  editorProps: {
    attributes: {
      class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[calc(100vh-4rem)] p-8'
    }
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div class="h-full overflow-y-auto" style="background-color: var(--bg-paper);">
    <ClientOnly>
      <editor-content :editor="editor" />
    </ClientOnly>
  </div>
</template>
