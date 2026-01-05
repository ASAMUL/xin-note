<script setup lang="ts">
import type { NoteItem } from '~/composables/useNotes'

// Props 定义
interface Props {
  notes: NoteItem[]
  activeTabPath?: string
}

const props = defineProps<Props>()

// Emits 定义
const emit = defineEmits<{
  (e: 'select', note: NoteItem): void
  (e: 'contextmenu', event: MouseEvent, note: NoteItem): void
  (e: 'move', source: NoteItem, target: NoteItem): void
}>()

// 定义树形项类型
interface NoteTreeItem {
  label: string
  icon: string
  value: NoteItem
  defaultExpanded: boolean
  disabled: boolean
  children?: NoteTreeItem[]
}

/**
 * 将 NoteItem 转换为 UTree 所需的 TreeItem 格式
 */
const convertToTreeItem = (note: NoteItem): NoteTreeItem => ({
  label: note.name.replace('.md', ''),
  icon: note.isFolder ? 'i-lucide-folder' : 'i-lucide-file-text',
  value: note,
  defaultExpanded: note.isFolder, // 文件夹默认可展开
  disabled: false,
  children: note.children?.map(convertToTreeItem)
})

// 转换笔记数据为 UTree 格式
const treeItems = computed<NoteTreeItem[]>(() => props.notes.map(convertToTreeItem))

// 展开状态管理
const expandedPaths = ref<Set<string>>(new Set())

/**
 * 切换文件夹展开/收起状态
 */
const toggleExpand = (item: NoteTreeItem) => {
  const path = item.value.path
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path)
  } else {
    expandedPaths.value.add(path)
  }
  // 触发响应式更新
  expandedPaths.value = new Set(expandedPaths.value)
}

/**
 * 检查文件夹是否展开
 */
const isExpanded = (item: NoteTreeItem): boolean => {
  return expandedPaths.value.has(item.value.path)
}

/**
 * 处理树形项点击事件
 */
const handleItemClick = (item: NoteTreeItem) => {
  const note = item.value
  if (note.isFolder) {
    // 文件夹：切换展开/收起
    toggleExpand(item)
  } else {
    // 文件：触发选择事件
    emit('select', note)
  }
}

/**
 * 右键菜单处理
 */
const handleItemContextMenu = (event: MouseEvent, item: NoteTreeItem) => {
  if (item.value) {
    emit('contextmenu', event, item.value)
  }
}

/**
 * 判断某个项是否为当前激活项
 */
const isItemActive = (item: NoteTreeItem): boolean => {
  return item.value?.path === props.activeTabPath
}

// ========== 拖拽功能 ==========
const draggedItem = ref<NoteTreeItem | null>(null)
const dragOverItem = ref<NoteTreeItem | null>(null)

/**
 * 开始拖拽
 */
const handleDragStart = (event: DragEvent, item: NoteTreeItem) => {
  draggedItem.value = item
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.value.path)
  }
}

/**
 * 拖拽经过
 */
const handleDragOver = (event: DragEvent, item: NoteTreeItem) => {
  event.preventDefault()
  // 只允许拖拽到文件夹上
  if (item.value.isFolder && draggedItem.value && draggedItem.value.value.path !== item.value.path) {
    dragOverItem.value = item
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }
}

/**
 * 拖拽离开
 */
const handleDragLeave = () => {
  dragOverItem.value = null
}

/**
 * 拖拽结束
 */
const handleDragEnd = () => {
  draggedItem.value = null
  dragOverItem.value = null
}

/**
 * 放置
 */
const handleDrop = (event: DragEvent, targetItem: NoteTreeItem) => {
  event.preventDefault()
  
  if (draggedItem.value && targetItem.value.isFolder && draggedItem.value.value.path !== targetItem.value.path) {
    // 不能将文件夹拖拽到自己的子文件夹中
    const sourcePath = draggedItem.value.value.path
    const targetPath = targetItem.value.path
    
    if (!targetPath.startsWith(sourcePath)) {
      emit('move', draggedItem.value.value, targetItem.value)
    }
  }
  
  draggedItem.value = null
  dragOverItem.value = null
}

/**
 * 检查是否为拖拽目标
 */
const isDragOver = (item: NoteTreeItem): boolean => {
  return dragOverItem.value?.value.path === item.value.path
}
</script>

<template>
  <div class="note-tree">
    <!-- 递归渲染树形结构 -->
    <template v-for="item in treeItems" :key="item.value.id">
      <div
        class="note-tree-item"
        :class="{
          'note-tree-item--active': isItemActive(item),
          'note-tree-item--drag-over': isDragOver(item),
          'note-tree-item--dragging': draggedItem?.value.path === item.value.path
        }"
        draggable="true"
        @click="handleItemClick(item)"
        @contextmenu.prevent="handleItemContextMenu($event, item)"
        @dragstart="handleDragStart($event, item)"
        @dragover="handleDragOver($event, item)"
        @dragleave="handleDragLeave"
        @dragend="handleDragEnd"
        @drop="handleDrop($event, item)"
      >
        <!-- 文件夹展开/收起图标 -->
        <UIcon
          v-if="item.children?.length"
          :name="isExpanded(item) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="note-tree-toggle"
        />
        <span v-else class="note-tree-toggle-placeholder" />
        
        <!-- 文件/文件夹图标 -->
        <UIcon
          :name="item.icon"
          class="note-tree-icon"
        />
        <span class="note-tree-label">{{ item.label }}</span>
      </div>
      
      <!-- 子项（当展开时显示） -->
      <div
        v-if="item.children?.length && isExpanded(item)"
        class="note-tree-children"
      >
        <template v-for="child in item.children" :key="child.value.id">
          <div
            class="note-tree-item note-tree-item--child"
            :class="{
              'note-tree-item--active': isItemActive(child),
              'note-tree-item--drag-over': isDragOver(child),
              'note-tree-item--dragging': draggedItem?.value.path === child.value.path
            }"
            draggable="true"
            @click="handleItemClick(child)"
            @contextmenu.prevent="handleItemContextMenu($event, child)"
            @dragstart="handleDragStart($event, child)"
            @dragover="handleDragOver($event, child)"
            @dragleave="handleDragLeave"
            @dragend="handleDragEnd"
            @drop="handleDrop($event, child)"
          >
            <!-- 文件夹展开/收起图标 -->
            <UIcon
              v-if="child.children?.length"
              :name="isExpanded(child) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="note-tree-toggle"
            />
            <span v-else class="note-tree-toggle-placeholder" />
            
            <!-- 文件/文件夹图标 -->
            <UIcon
              :name="child.icon"
              class="note-tree-icon"
            />
            <span class="note-tree-label">{{ child.label }}</span>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.note-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.note-tree-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.note-tree-item:hover {
  background-color: var(--bg-app);
}

.note-tree-item--active {
  background-color: var(--highlight-bg);
}

.note-tree-item--active .note-tree-icon {
  color: var(--accent-color);
}

.note-tree-item--active .note-tree-label {
  color: var(--accent-color);
  font-weight: 500;
}

.note-tree-item--child {
  padding-left: 1.75rem;
}

.note-tree-item--drag-over {
  background-color: var(--accent-color);
  opacity: 0.2;
}

.note-tree-item--dragging {
  opacity: 0.5;
}

.note-tree-toggle {
  width: 1rem;
  height: 1rem;
  color: var(--text-mute);
  flex-shrink: 0;
  opacity: 0.6;
}

.note-tree-toggle-placeholder {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.note-tree-icon {
  width: 1rem;
  height: 1rem;
  color: var(--text-mute);
  flex-shrink: 0;
}

.note-tree-label {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-tree-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
