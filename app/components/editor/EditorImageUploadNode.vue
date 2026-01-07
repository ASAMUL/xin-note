<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper } from '@tiptap/vue-3';

const props = defineProps<NodeViewProps>();

const { activeTab } = useTabs();

const file = ref<File | null>(null);
const loading = ref(false);
const errorMessage = ref<string | null>(null);

function sanitizeFileName(name: string) {
  // 保留常见安全字符，其他统一替换为下划线，避免路径注入/特殊字符导致写入失败
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getFileExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 10) return fromName;

  // 简单从 mime 推断
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  return map[file.type] || 'png';
}

watch(file, async (newFile) => {
  if (!newFile) return;

  errorMessage.value = null;

  if (!activeTab.value?.path) {
    errorMessage.value = '未找到当前笔记文件路径，无法保存图片。';
    file.value = null;
    return;
  }
  if (!window.ipcRenderer) {
    errorMessage.value = 'ipcRenderer 不可用，无法保存图片。';
    file.value = null;
    return;
  }

  loading.value = true;
  try {
    const arrayBuffer = await newFile.arrayBuffer();

    const ext = getFileExt(newFile);
    const baseName = sanitizeFileName(newFile.name.replace(/\.[^/.]+$/, '')) || 'image';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${unique}-${baseName}.${ext}`;

    const result = await window.ipcRenderer.invoke('asset-write', {
      notePath: activeTab.value.path,
      fileName,
      data: new Uint8Array(arrayBuffer),
    });

    if (!result?.ok || !result?.relativePath) {
      throw new Error('写入图片失败');
    }

    const pos = props.getPos();
    if (typeof pos !== 'number') {
      throw new Error('无法定位图片插入位置');
    }

    // TipTap 命令的 TS 类型依赖于 extension 的声明合并；在 Nuxt UI 的打包类型下可能拿不到 setImage 的类型
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props.editor as any)
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .setImage({
        src: result.relativePath,
        alt: newFile.name,
      })
      .run();
  } catch (e) {
    console.error(e);
    errorMessage.value = e instanceof Error ? e.message : '图片上传失败';
  } finally {
    loading.value = false;
    file.value = null;
  }
});
</script>

<template>
  <NodeViewWrapper>
    <div class="my-5">
      <UFileUpload
        v-model="file"
        accept="image/*"
        :preview="false"
        label="上传图片"
        description="会保存到当前笔记同目录的 assets/ 文件夹"
        class="min-h-48"
      >
        <template #leading>
          <UAvatar
            :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-image'"
            size="xl"
            :ui="{ icon: [loading && 'animate-spin'] }"
          />
        </template>
      </UFileUpload>

      <p v-if="errorMessage" class="mt-2 text-xs" style="color: var(--color-error)">
        {{ errorMessage }}
      </p>
    </div>
  </NodeViewWrapper>
</template>
