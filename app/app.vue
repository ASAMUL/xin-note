<script setup lang="ts">
import 'highlight.js/styles/github.css';

const { toggleAiSidebar } = useLayoutState();

// 全局初始化字体设置（从 settings.json 恢复用户选择的字体）
useFontManager();

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
