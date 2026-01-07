<script setup lang="ts"></script>

<template>
  <div
    class="h-full flex flex-col"
    style="background-color: var(--bg-sidebar); border-left: 1px solid var(--border-color)"
  >
    <div class="p-4" style="border-bottom: 1px solid var(--border-color)">
      <h2 class="font-semibold" style="color: var(--text-main)">AI Assistant</h2>
    </div>

    <div class="flex-1 p-4 overflow-y-auto">
      <div class="text-sm text-center mt-10" style="color: var(--text-mute)">
        How can I help you today?
      </div>
    </div>

    <div class="p-4" style="border-top: 1px solid var(--border-color)">
      <UInput placeholder="Ask AI..." icon="i-heroicons-sparkles" />
    </div>
  </div>
</template>
