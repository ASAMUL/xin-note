<script setup lang="ts">
/**
 * 简易使用说明（后续你给 URL 可改成外链）
 */

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="p-4 flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-book-open" class="w-5 h-5" />
            <h3 class="text-base font-semibold" style="color: var(--text-main)">文档</h3>
          </div>
          <UButton variant="ghost" color="neutral" icon="i-lucide-x" @click="isOpen = false" />
        </div>

        <div class="text-sm leading-6 space-y-4" style="color: var(--text-main)">
          <section class="space-y-2">
            <h4 class="text-sm font-semibold">快速开始</h4>
            <ul class="list-disc pl-5 space-y-1 text-sm" style="color: var(--text-mute)">
              <li>首次使用先在设置里选择“笔记存储目录”（也可通过菜单「文件 → 打开文件夹…」）。</li>
              <li>用「Ctrl+N」或菜单「文件 → 新建笔记」创建笔记。</li>
              <li>用「Ctrl+P」搜索并打开笔记。</li>
              <li>编辑会自动保存；也可用「Ctrl+S」手动保存。</li>
            </ul>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">AI 助手</h4>
            <ul class="list-disc pl-5 space-y-1 text-sm" style="color: var(--text-mute)">
              <li>在设置中填写 API Key / Base URL / 模型。</li>
              <li>编辑器内按 Tab 触发 AI 续写候选；再次 Tab 接受；Esc 取消。</li>
              <li>右侧 AI 面板可用「Ctrl+L」打开/关闭。</li>
            </ul>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">图片与资源</h4>
            <ul class="list-disc pl-5 space-y-1 text-sm" style="color: var(--text-mute)">
              <li>
                支持粘贴图片到编辑器，图片会写入笔记目录的
                <code>assets/</code>
                并以相对路径保存。
              </li>
            </ul>
          </section>
        </div>

        <div class="flex justify-end">
          <UButton color="primary" variant="soft" @click="isOpen = false">关闭</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
