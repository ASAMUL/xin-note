<script setup lang="ts">
/**
 * 透明无边框窗口“边缘拖拽缩放”的渲染层热区：
 * - 四边 + 四角共 8 个透明区域
 * - pointerdown 时通过 IPC 通知主进程开始 resize
 * - pointerup / blur 时通知停止
 *
 * 为什么要这样做？
 * - Electron 官方限制：transparent 窗口无法原生 resize
 * - 但主进程可以 setBounds，所以我们用热区模拟“拖边缘缩放”
 */

type WindowEdgeResizeDirection =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

const enabled = ref(false);
const isResizing = ref(false);

const startResize = (direction: WindowEdgeResizeDirection, e: PointerEvent) => {
  if (!enabled.value) return;
  if (e.button !== 0) return; // 只响应左键

  e.preventDefault();
  e.stopPropagation();

  isResizing.value = true;
  document.documentElement.classList.add('is-window-edge-resizing');

  const el = e.currentTarget as HTMLElement | null;
  if (el) {
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // 忽略（部分环境/时机可能不支持）
    }
  }

  window.ipcRenderer.send('window-edge-resize-start', direction);
};

const stopResize = () => {
  if (!enabled.value || !isResizing.value) return;

  isResizing.value = false;
  document.documentElement.classList.remove('is-window-edge-resizing');
  window.ipcRenderer.send('window-edge-resize-stop');
};

onMounted(() => {
  enabled.value = typeof window !== 'undefined' && !!window.ipcRenderer;
  if (!enabled.value) return;

  // 指针抬起/取消、窗口失焦时都要停止 resize，避免“卡住一直在缩放”
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
  window.addEventListener('blur', stopResize);
});

onBeforeUnmount(() => {
  if (!enabled.value) return;
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
  window.removeEventListener('blur', stopResize);
});
</script>

<template>
  <!-- pointer-events-none：不影响内容交互；具体 handle 自己开 pointer-events-auto -->
  <div v-if="enabled" class="fixed inset-0 z-999999 pointer-events-none">
    <!-- 四边 -->
    <div
      class="handle fixed top-0 left-0 right-0 h-2 pointer-events-auto"
      style="cursor: ns-resize"
      @pointerdown="startResize('top', $event)"
    />
    <div
      class="handle fixed bottom-0 left-0 right-0 h-2 pointer-events-auto"
      style="cursor: ns-resize"
      @pointerdown="startResize('bottom', $event)"
    />
    <div
      class="handle fixed left-0 top-0 bottom-0 w-2 pointer-events-auto"
      style="cursor: ew-resize"
      @pointerdown="startResize('left', $event)"
    />
    <div
      class="handle fixed right-0 top-0 bottom-0 w-2 pointer-events-auto"
      style="cursor: ew-resize"
      @pointerdown="startResize('right', $event)"
    />

    <!-- 四角（放在最后，覆盖边缘交叉区域，优先命中角拖拽） -->
    <div
      class="handle fixed top-0 left-0 w-3 h-3 pointer-events-auto"
      style="cursor: nwse-resize"
      @pointerdown="startResize('top-left', $event)"
    />
    <div
      class="handle fixed top-0 right-0 w-3 h-3 pointer-events-auto"
      style="cursor: nesw-resize"
      @pointerdown="startResize('top-right', $event)"
    />
    <div
      class="handle fixed bottom-0 left-0 w-3 h-3 pointer-events-auto"
      style="cursor: nesw-resize"
      @pointerdown="startResize('bottom-left', $event)"
    />
    <div
      class="handle fixed bottom-0 right-0 w-3 h-3 pointer-events-auto"
      style="cursor: nwse-resize"
      @pointerdown="startResize('bottom-right', $event)"
    />
  </div>
</template>

<style scoped>
.handle {
  /* 关键：避免被当成窗口拖动区域 */
  -webkit-app-region: no-drag;
  user-select: none;
  touch-action: none;
}
</style>
