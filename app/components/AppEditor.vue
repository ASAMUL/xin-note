<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const { activeTab, updateTabContent, saveTab } = useTabs()
const { autoSaveDelay } = useSettings()

// 自动保存定时器
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

// 保存状态
const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved')

// 上次保存时间
const lastSavedTime = ref<Date | null>(null)

// 是否正在通过 setContent 设置内容（用于防止误判为用户修改）
let isSettingContent = false

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
    
    // 如果是程序设置内容，不视为用户修改
    if (isSettingContent) return
    
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
  
  // 更新上次保存时间
  if (success) {
    lastSavedTime.value = new Date()
  }
}

// 监听活动标签页变化，加载内容
watch(activeTab, (tab) => {
  if (tab && editor.value) {
    // 设置标志位，防止 setContent 触发的 onUpdate 被误判为用户修改
    isSettingContent = true
    editor.value.commands.setContent(tab.content || '')
    saveStatus.value = tab.isModified ? 'unsaved' : 'saved'
    // 重置上次保存时间（切换标签页时）
    lastSavedTime.value = tab.isModified ? null : new Date()
    // 使用 nextTick 确保在编辑器更新完成后重置标志位
    nextTick(() => {
      isSettingContent = false
    })
  } else if (editor.value) {
    isSettingContent = true
    editor.value.commands.setContent('')
    saveStatus.value = 'saved'
    lastSavedTime.value = null
    nextTick(() => {
      isSettingContent = false
    })
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

// 格式化上次保存时间
const formatLastSavedTime = (date: Date): string => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (seconds < 60) {
    return '刚刚保存'
  } else if (minutes < 60) {
    return `${minutes} 分钟前保存`
  } else if (hours < 24) {
    return `${hours} 小时前保存`
  } else {
    // 显示具体日期时间
    return `上次编辑 ${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
}

// 保存状态图标和文字
const saveStatusInfo = computed(() => {
  switch (saveStatus.value) {
    case 'saved': {
      const timeText = lastSavedTime.value 
        ? formatLastSavedTime(lastSavedTime.value) 
        : '已保存'
      return { icon: '', text: timeText, color: 'text-(--text-mute)' }
    }
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
    <!-- 标签页栏（包含保存状态） -->
    <EditorTabs :save-status-info="saveStatusInfo" :save-status="saveStatus" />

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
