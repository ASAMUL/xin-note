<script setup lang="ts">
/**
 * 自定义代码块 NodeView 组件（Notion 风格）
 * 工具栏默认隐藏，鼠标悬浮时浮现在代码块右上角
 */
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'
import type { NodeViewProps } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

// 复制状态
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

// 常用编程语言列表（与 lowlight common 对齐）
const languages = [
  { value: '', label: 'auto' },
  { value: 'bash', label: 'Bash' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'diff', label: 'Diff' },
  { value: 'go', label: 'Go' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'ini', label: 'INI' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'less', label: 'Less' },
  { value: 'lua', label: 'Lua' },
  { value: 'makefile', label: 'Makefile' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'objectivec', label: 'Objective-C' },
  { value: 'perl', label: 'Perl' },
  { value: 'php', label: 'PHP' },
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'python', label: 'Python' },
  { value: 'r', label: 'R' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'rust', label: 'Rust' },
  { value: 'scss', label: 'SCSS' },
  { value: 'shell', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'swift', label: 'Swift' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'vbnet', label: 'VB.Net' },
  { value: 'wasm', label: 'WebAssembly' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
]

// 当前选中的语言（显示名称）
const selectedLanguage = computed({
  get: () => props.node.attrs.language || '',
  set: (val: string) => {
    props.updateAttributes({ language: val })
  },
})

// 获取语言显示名称
const languageLabel = computed(() => {
  const lang = languages.find(l => l.value === selectedLanguage.value)
  return lang?.label || selectedLanguage.value || 'auto'
})

/**
 * 复制代码块内容到剪贴板
 */
async function copyCode() {
  const text = props.node.textContent
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true

    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch (err) {
    console.error('复制失败:', err)
  }
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <NodeViewWrapper class="cb-wrapper" data-type="codeBlock">
    <!-- 浮动工具栏：默认隐藏，鼠标悬浮显示 -->
    <div class="cb-toolbar" contenteditable="false">
      <!-- 语言选择器 -->
      <select
        v-model="selectedLanguage"
        class="cb-lang-select"
      >
        <option
          v-for="lang in languages"
          :key="lang.value"
          :value="lang.value"
        >
          {{ lang.label }}
        </option>
      </select>

      <!-- 复制按钮 -->
      <button
        class="cb-copy-btn"
        :class="{ 'cb-copied': copied }"
        :title="copied ? '已复制' : '复制代码'"
        @click="copyCode"
      >
        <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-clipboard'" class="size-3.5" />
      </button>
    </div>

    <!-- 代码内容区域 -->
    <NodeViewContent as="pre" class="cb-pre" />
  </NodeViewWrapper>
</template>

<style scoped>
/* 整体容器 */
.cb-wrapper {
  position: relative;
  border-radius: 6px;
  margin: 0.5rem 0;
  background-color: var(--bg-code);
}

/* ======== 浮动工具栏（Notion 风格） ======== */
.cb-toolbar {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background-color: var(--bg-popup);
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 4px var(--shadow-color);

  /* 默认隐藏 */
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

/* 鼠标悬浮时显示 */
.cb-wrapper:hover .cb-toolbar {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

/* 语言选择下拉 */
.cb-lang-select {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-mute);
  font-size: 0.7rem;
  font-family: inherit;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  transition: all 0.12s ease;
}

.cb-lang-select:hover {
  background-color: var(--bg-app);
  color: var(--text-main);
}

/* 复制按钮 */
.cb-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-mute);
  padding: 3px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.cb-copy-btn:hover {
  background-color: var(--bg-app);
  color: var(--text-main);
}

.cb-copy-btn.cb-copied {
  color: var(--color-success);
}

/* 代码内容 */
.cb-pre {
  margin: 0;
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
