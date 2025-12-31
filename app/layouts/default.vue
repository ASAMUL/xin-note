<script setup lang="ts">
const { isAiSidebarOpen } = useLayoutState()
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col" style="background-color: var(--bg-app); color: var(--text-main);">
    <!-- Top Navbar -->
    <AppNavbar />

    <!-- Main Content Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar -->
      <aside class="w-64 flex-shrink-0">
        <AppSidebar />
      </aside>

      <!-- Center Content -->
      <main class="flex-1 min-w-0 flex flex-col relative z-0">
        <slot />
      </main>

      <!-- Right Sidebar (AI) -->
      <aside 
        v-if="isAiSidebarOpen" 
        class="w-80 flex-shrink-0 transition-all duration-300 ease-in-out"
        style="border-left: 1px solid var(--border-color);"
      >
        <AiAssistant />
      </aside>
    </div>
  </div>
</template>
