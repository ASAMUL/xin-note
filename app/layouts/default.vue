<script setup lang="ts">
import { useAppLocale } from '~/composables/i18n/useAppLocale';
import { useAppTheme } from '~/composables/theme/useAppTheme';

const { isAiSidebarOpen, isLeftSidebarOpen, isZenMode } = useLayoutState();

// 将 settings.json 中的 locale 同步到 i18n（并提供 setLocale 给设置页使用）
useAppLocale();
// 将 settings.json 中的主题模式 + 主题配置同步到 DOM
useAppTheme();

// 控制主内容区淡入
const isAppReady = ref(false);

// 在 app 完全初始化后触发
onNuxtReady(() => {
  isAppReady.value = true;
});
</script>

<template>
  <div class="h-screen w-screen overflow-hidden">
    <!-- 启动画面 -->
    <AppLaunchScreen />

    <div
      class="h-screen w-screen overflow-hidden flex flex-col app-container"
      :class="{ 'app-ready': isAppReady }"
      style="background-color: var(--bg-app); color: var(--text-main)"
    >
      <!-- Top Navbar -->
      <AppNavbar />
      <!-- 透明无边框窗口：边缘拖拽缩放热区 -->
      <AppWindowResizeHandles />

      <!-- Main Content Area -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Sidebar -->
        <Transition name="slide-fade-left">
          <aside v-if="isLeftSidebarOpen && !isZenMode" class="w-64 shrink-0">
            <AppSidebar />
          </aside>
        </Transition>

        <!-- Center Content -->
        <main class="flex-1 min-w-0 flex flex-col relative z-0">
          <slot />
        </main>

        <!-- Right Sidebar (AI) -->
        <Transition name="slide-fade-right">
          <aside
            v-if="isAiSidebarOpen && !isZenMode"
            class="w-100 shrink-0"
            style="border-left: 1px solid var(--border-color)"
          >
            <AiAssistant />
          </aside>
        </Transition>
      </div>

      <!-- Global Footer -->
      <AppFooter />
    </div>
  </div>
</template>

<style scoped>
/* 主容器淡入效果 */
.app-container {
  opacity: 0;
  transform: scale(0.98);
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.app-container.app-ready {
  opacity: 1;
  transform: scale(1);
}

/* AI 侧边栏滑入效果 */
.slide-fade-left-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-fade-left-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.slide-fade-left-enter-from,
.slide-fade-left-leave-to {
  opacity: 0;
  transform: translateX(-40px);
}

.slide-fade-right-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-fade-right-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.slide-fade-right-enter-from,
.slide-fade-right-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>
