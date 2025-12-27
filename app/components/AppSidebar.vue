<script setup lang="ts">
const items = ref([
  {
    label: 'My Notes',
    defaultExpanded: true,
    children: [
      {
        label: 'Ideas',
        children: [
          { label: 'Novel Plot.md', icon: 'i-heroicons-document-text' },
          { label: 'Characters.md', icon: 'i-heroicons-document-text' }
        ]
      },
      {
        label: 'Journal',
        children: [
          { label: '2024-12-26.md', icon: 'i-heroicons-document-text' }
        ]
      }
    ]
  },
  {
    label: 'Trash',
    icon: 'i-heroicons-trash'
  }
])
</script>

<template>
  <div class="h-full overflow-y-auto" style="background-color: var(--bg-sidebar); border-right: 1px solid var(--border-color);">
    <div class="p-4">
      <h2 class="text-sm font-semibold mb-4 uppercase tracking-wider" style="color: var(--text-mute);">Explorer</h2>
      <UTree :items="items" />
    </div>
  </div>
</template>
