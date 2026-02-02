<script setup lang="ts">
// 控制启动画面的显示状态
const isLoaded = ref(false);
onNuxtReady(() => {
  isLoaded.value = true;
});
</script>

<template>
  <Transition name="launch-fade">
    <div v-if="!isLoaded" class="launch-screen">
      <!-- 背景渐变遮罩 -->
      <div class="launch-backdrop" />

      <!-- 中心内容 -->
      <div class="launch-content" :class="{ loaded: isLoaded }">
        <!-- Logo 容器 -->
        <div class="launch-logo">
          <UIcon name="i-lucide-feather" class="logo-icon" />
        </div>

        <!-- 品牌名称 -->
        <h1 class="launch-title">xin-note</h1>

        <!-- 副标题 -->
        <p class="launch-subtitle">思绪流转，灵感永驻</p>

        <!-- 加载指示器 -->
        <div class="launch-loader">
          <div class="loader-dot" />
          <div class="loader-dot" />
          <div class="loader-dot" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.launch-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-app);
  overflow: hidden;
}

/* 背景渐变效果 */
.launch-backdrop {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, var(--bg-paper) 0%, var(--bg-app) 70%);
  opacity: 0.8;
}

/* 中心内容 */
.launch-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.launch-content.loaded {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Logo */
.launch-logo {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  border-radius: 20px;
  box-shadow: 0 10px 40px -10px var(--accent-color), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
  animation: logo-pulse 2s ease-in-out infinite;
}

.logo-icon {
  width: 40px;
  height: 40px;
  color: white;
}

/* Logo 脉冲动画 */
@keyframes logo-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 10px 40px -10px var(--accent-color), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 15px 50px -10px var(--accent-color), 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  }
}

/* 标题 */
.launch-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.03em;
  margin: 0;
  background: linear-gradient(135deg, var(--text-main) 0%, var(--accent-color) 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* 副标题 */
.launch-subtitle {
  font-size: 0.875rem;
  color: var(--text-mute);
  margin: 0;
  letter-spacing: 0.1em;
}

/* 加载指示器 */
.launch-loader {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.loader-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--accent-color);
  opacity: 0.3;
  animation: loader-wave 1.4s ease-in-out infinite;
}

.loader-dot:nth-child(1) {
  animation-delay: 0s;
}
.loader-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.loader-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes loader-wave {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  30% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 启动画面淡出过渡 */
.launch-fade-enter-active,
.launch-fade-leave-active {
  transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.launch-fade-enter-from,
.launch-fade-leave-to {
  opacity: 0;
}

/* 深色模式微调 */
.dark .launch-backdrop {
  background: radial-gradient(ellipse at center, var(--bg-paper) 0%, var(--bg-app) 60%);
  opacity: 1;
}

.dark .launch-logo {
  box-shadow: 0 10px 40px -10px var(--accent-color), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}
</style>
