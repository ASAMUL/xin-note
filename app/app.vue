<script setup lang="ts">
import 'highlight.js/styles/github-dark.css';

const { toggleAiSidebar } = useLayoutState();

onMounted(() => {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      toggleAiSidebar();
    }
  });
});
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
