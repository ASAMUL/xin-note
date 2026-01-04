<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const { activeTab, updateTabContent, saveTab } = useTabs()
const { autoSaveDelay } = useSettings()

// 自动保存定时器
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

// 保存状态
const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved')

// 编辑器实例
const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
  ],
  editorProps: {
    attributes: {
      class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[calc(100vh-6rem)] p-8'
    }
  },
  onUpdate: ({ editor }) => {
    if (!activeTab.value) return
    
    // 更新标签页内容
    const content = editor.getHTML()
    updateTabContent(activeTab.value.id, content)
    saveStatus.value = 'unsaved'
    
    // 触发自动保存
    triggerAutoSave()
  }
})

// 触发自动保存
const triggerAutoSave = () => {
  // 清除之前的定时器
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  
  // 设置新的定时器
  autoSaveTimer = setTimeout(async () => {
    await performSave()
  }, autoSaveDelay.value)
}

// 执行保存
const performSave = async () => {
  if (!activeTab.value || !activeTab.value.isModified) return
  
  saveStatus.value = 'saving'
  const success = await saveTab()
  saveStatus.value = success ? 'saved' : 'unsaved'
}

// 监听活动标签页变化，加载内容
watch(activeTab, (tab) => {
  if (tab && editor.value) {
    editor.value.commands.setContent(tab.content || '')
    saveStatus.value = tab.isModified ? 'unsaved' : 'saved'
  } else if (editor.value) {
    editor.value.commands.setContent('')
    saveStatus.value = 'saved'
  }
}, { immediate: true })

// 快捷键保存
defineShortcuts({
  'ctrl+s': () => {
    if (activeTab.value) {
      performSave()
    }
  },
  'meta+s': () => {
    if (activeTab.value) {
      performSave()
    }
  }
})

// 清理定时器
onBeforeUnmount(() => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  editor.value?.destroy()
})

// 保存状态图标和文字
const saveStatusInfo = computed(() => {
  switch (saveStatus.value) {
    case 'saved':
      return { icon: 'i-lucide-check-circle', text: '已保存', color: 'text-green-500' }
    case 'saving':
      return { icon: 'i-lucide-loader-2', text: '保存中...', color: 'text-yellow-500' }
    case 'unsaved':
      return { icon: 'i-lucide-circle', text: '未保存', color: 'text-orange-500' }
    default:
      return { icon: '', text: '', color: '' }
  }
})
</script>

<template>
  <div class="editor-container">
    <!-- 标签页栏 -->
    <EditorTabs />

    <!-- 编辑器状态栏 -->
    <div v-if="activeTab" class="editor-status-bar">
      <div class="editor-status">
        <UIcon 
          :name="saveStatusInfo.icon" 
          class="w-3.5 h-3.5" 
          :class="[saveStatusInfo.color, { 'animate-spin': saveStatus === 'saving' }]"
        />
        <span class="status-text" :class="saveStatusInfo.color">{{ saveStatusInfo.text }}</span>
      </div>
    </div>

    <!-- 编辑器内容区 -->
    <div class="editor-content">
      <!-- 未选择笔记提示 -->
      <div v-if="!activeTab" class="empty-editor">
        <UIcon name="i-lucide-file-text" class="w-16 h-16 empty-icon" />
        <h3 class="empty-title">选择一篇笔记开始编辑</h3>
        <p class="empty-desc">从左侧笔记列表选择，或创建一篇新笔记</p>
      </div>

      <!-- Tiptap 编辑器 -->
      <ClientOnly v-else>
        <EditorContent :editor="editor" class="tiptap-wrapper" />
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-paper);
}

.editor-status-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.25rem 1rem;
  background-color: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
}

.editor-status {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.status-text {
  font-size: 0.75rem;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
}

.tiptap-wrapper {
  height: 100%;
}

/* 空状态 */
.empty-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
}

.empty-icon {
  color: var(--text-mute);
  opacity: 0.3;
}

.empty-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--text-mute);
  margin: 0;
}

/* 深色模式保存状态颜色调整 */
.dark .text-green-500 {
  color: #4ADE80;
}

.dark .text-yellow-500 {
  color: #FACC15;
}

.dark .text-orange-500 {
  color: #FB923C;
}
</style>
