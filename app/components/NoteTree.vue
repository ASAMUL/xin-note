<script setup lang="ts">
/**
 * NoteTree 组件 - 使用 vuedraggable 实现 VSCode 风格的拖拽树形结构
 * 核心思路：每个文件夹展开时子项作为独立的 draggable 列表
 * 未展开的文件夹使用原生拖放事件支持拖入
 */
import draggable from 'vuedraggable';
import type { NoteItem } from '~/composables/useNotes';

// Props
interface Props {
  items: NoteItem[];
  activeTabPath?: string;
  depth?: number;
  parentFolderPath?: string;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  activeTabPath: '',
  parentFolderPath: '',
});

// Emits
const emit = defineEmits<{
  (e: 'select', note: NoteItem): void;
  (e: 'contextmenu', event: MouseEvent, note: NoteItem): void;
  (e: 'move', note: NoteItem, targetFolderPath: string): void;
}>();

// 本地可编辑的列表（用于拖拽）
const localItems = ref<NoteItem[]>([]);

// 根容器（用于定位并滚动到激活项）
const treeContainerRef = ref<HTMLElement | null>(null);

// 同步 props.items 到 localItems
watch(
  () => props.items,
  (newItems) => {
    localItems.value = [...newItems];
  },
  { immediate: true, deep: true },
);

// 展开状态管理
const expandedFolders = useState<Set<string>>('note-tree-expanded', () => new Set());

// 当前拖拽悬停的文件夹路径（用于高亮显示）
const dragOverFolderPath = useState<string | null>('note-tree-dragover', () => null);

// 当前正在拖拽的项目（全局共享）
const currentDraggingItem = useState<NoteItem | null>('note-tree-dragging', () => null);

// 路径比较：兼容 Windows 下 \ / 和大小写差异
const normalizePathForCompare = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

// 当前项是否为激活文件（用于高亮）
const isActive = (notePath: string) => {
  if (!props.activeTabPath) return false;
  return normalizePathForCompare(notePath) === normalizePathForCompare(props.activeTabPath);
};

// 切换文件夹展开状态
const toggleExpand = (note: NoteItem, event?: MouseEvent) => {
  if (!note.isFolder) return;
  event?.stopPropagation();

  if (expandedFolders.value.has(note.path)) {
    expandedFolders.value.delete(note.path);
  } else {
    expandedFolders.value.add(note.path);
  }
};

// 判断文件夹是否展开
const isExpanded = (note: NoteItem) => {
  return note.isFolder && expandedFolders.value.has(note.path);
};

/**
 * 根据当前树结构递归查找：激活文件所在的“父文件夹链路”
 * 返回值示例：['F:\\notes\\A', 'F:\\notes\\A\\B']
 */
const findFolderChainByActivePath = (
  items: NoteItem[],
  activeNorm: string,
  parents: string[] = [],
): string[] | null => {
  for (const item of items) {
    const itemNorm = normalizePathForCompare(item.path);
    if (itemNorm === activeNorm) {
      return parents;
    }
    if (item.isFolder && item.children && item.children.length > 0) {
      const res = findFolderChainByActivePath(item.children, activeNorm, [...parents, item.path]);
      if (res) return res;
    }
  }
  return null;
};

/**
 * 兜底：直接根据路径字符串逐级回溯父目录
 * 注意：该函数不会验证父目录是否真实存在于当前树结构中。
 */
const collectParentPaths = (filePath: string): string[] => {
  const res: string[] = [];
  let cur = getParentPath(filePath);
  while (cur) {
    res.push(cur);
    // Windows 盘符根（如 F:）到此为止
    if (/^[a-zA-Z]:$/.test(cur)) break;
    const next = getParentPath(cur);
    if (!next || next === cur) break;
    cur = next;
  }
  return res.reverse();
};

/**
 * 自动在目录树中“揭示”激活文件：
 * - 展开其父文件夹链路（即使之前未展开）
 * - 将激活项滚动到可视区域（仅根组件执行一次）
 */
const revealActiveInTree = async (activePath: string) => {
  if (!activePath) return;

  // 1) 优先用当前树结构精确计算父文件夹链路（确保加入 Set 的路径格式与 NoteItem.path 一致）
  const activeNorm = normalizePathForCompare(activePath);
  const folderChain = findFolderChainByActivePath(props.items, activeNorm);

  if (folderChain && folderChain.length > 0) {
    for (const folderPath of folderChain) expandedFolders.value.add(folderPath);
  } else {
    // 2) 兜底：无法在树中找到激活项时，按字符串父路径逐级展开（尽力而为）
    for (const folderPath of collectParentPaths(activePath)) expandedFolders.value.add(folderPath);
  }

  // 等待 DOM 更新（包含递归子树渲染）
  await nextTick();

  // 仅根组件负责滚动定位，避免递归组件重复滚动
  if (props.depth !== 0) return;
  const activeEl = treeContainerRef.value?.querySelector<HTMLElement>('.note-tree-item--active');
  activeEl?.scrollIntoView({ block: 'nearest' });
};

// 仅在根组件监听：切换标签页时自动展开父文件夹并定位
watch(
  () => props.activeTabPath,
  (p) => {
    if (props.depth !== 0) return;
    if (!p) return;
    void revealActiveInTree(p);
  },
  { immediate: true },
);

// 笔记树数据刷新后（例如移动/重命名/启动加载），再尝试揭示一次激活文件
watch(
  () => props.items,
  () => {
    if (props.depth !== 0) return;
    if (!props.activeTabPath) return;
    void revealActiveInTree(props.activeTabPath);
  },
  { immediate: true },
);

// 处理项目点击
const handleItemClick = (note: NoteItem) => {
  if (note.isFolder) {
    toggleExpand(note);
  } else {
    emit('select', note);
  }
};

// 处理右键菜单
const handleContextMenu = (event: MouseEvent, note: NoteItem) => {
  event.preventDefault();
  event.stopPropagation();
  emit('contextmenu', event, note);
};

// 拖拽配置 - 所有列表使用同一个 group 实现跨列表拖拽
const dragOptions = computed(() => ({
  animation: 200,
  group: 'note-tree',
  ghostClass: 'note-tree-ghost',
  chosenClass: 'note-tree-chosen',
  dragClass: 'note-tree-drag',
  fallbackOnBody: true,
  swapThreshold: 0.65,
}));

// 拖拽开始处理 - 记录当前拖拽的项目
const onDragStart = (evt: any) => {
  document.body.classList.add('is-dragging');
  // 记录当前正在拖拽的项目
  if (evt.item?.__draggable_context?.element) {
    currentDraggingItem.value = evt.item.__draggable_context.element;
  }
};

// 拖拽结束处理
const onDragEnd = () => {
  document.body.classList.remove('is-dragging');
  dragOverFolderPath.value = null;
  currentDraggingItem.value = null;
};

// 处理列表变化（检测跨列表移动）
const onListChange = (evt: any) => {
  // 当有元素被添加到这个列表时
  if (evt.added) {
    const addedItem = evt.added.element as NoteItem;
    if (props.parentFolderPath && addedItem.path) {
      const originalParent = getParentPath(addedItem.path);
      // 只有当原始父目录与目标父目录不同时才触发移动
      if (originalParent !== props.parentFolderPath) {
        emit('move', addedItem, props.parentFolderPath);
      }
    }
  }
};

// 获取文件的父目录路径（用 function 声明，避免被 immediate watch 提前调用时触发 TDZ）
function getParentPath(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return separatorIndex > 0 ? filePath.substring(0, separatorIndex) : '';
}

// 计算缩进样式
const getIndentStyle = (extraDepth: number = 0) => ({
  paddingLeft: `${(props.depth + extraDepth) * 12}px`,
});

// ========== 未展开文件夹的原生拖放处理 ==========

/**
 * 处理拖拽进入未展开的文件夹
 * 设置高亮状态
 */
const handleFolderDragEnter = (event: DragEvent, folder: NoteItem) => {
  event.preventDefault();
  event.stopPropagation();

  // 不能拖到自己里面
  if (currentDraggingItem.value?.path === folder.path) return;
  // 如果是文件夹，不能拖到自己的子文件夹里
  if (currentDraggingItem.value?.isFolder && folder.path.startsWith(currentDraggingItem.value.path))
    return;

  dragOverFolderPath.value = folder.path;
};

/**
 * 处理拖拽悬停在未展开的文件夹上
 * 必须阻止默认行为才能接收 drop 事件
 */
const handleFolderDragOver = (event: DragEvent, folder: NoteItem) => {
  event.preventDefault();
  event.stopPropagation();

  // 不能拖到自己里面
  if (currentDraggingItem.value?.path === folder.path) return;
  // 如果是文件夹，不能拖到自己的子文件夹里
  if (currentDraggingItem.value?.isFolder && folder.path.startsWith(currentDraggingItem.value.path))
    return;

  // 设置允许移动操作
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
};

/**
 * 处理拖拽离开未展开的文件夹
 */
const handleFolderDragLeave = (event: DragEvent, folder: NoteItem) => {
  event.preventDefault();
  event.stopPropagation();

  // 检查是否真的离开了文件夹区域（而不是进入子元素）
  const relatedTarget = event.relatedTarget as HTMLElement | null;
  const currentTarget = event.currentTarget as HTMLElement;

  if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
    if (dragOverFolderPath.value === folder.path) {
      dragOverFolderPath.value = null;
    }
  }
};

/**
 * 处理拖放到未展开的文件夹
 */
const handleFolderDrop = (event: DragEvent, folder: NoteItem) => {
  event.preventDefault();
  event.stopPropagation();

  dragOverFolderPath.value = null;

  // 获取正在拖拽的项目
  const draggingItem = currentDraggingItem.value;
  if (!draggingItem) return;

  // 不能拖到自己里面
  if (draggingItem.path === folder.path) return;
  // 如果是文件夹，不能拖到自己的子文件夹里
  if (draggingItem.isFolder && folder.path.startsWith(draggingItem.path)) return;

  // 检查是否已经在目标文件夹内
  const originalParent = getParentPath(draggingItem.path);
  if (originalParent === folder.path) return;

  // 触发移动事件
  emit('move', draggingItem, folder.path);
};
</script>

<template>
  <div ref="treeContainerRef">
    <draggable
      v-model="localItems"
      v-bind="dragOptions"
      item-key="id"
      tag="div"
      class="note-tree-list"
      @start="onDragStart"
      @end="onDragEnd"
      @change="onListChange"
    >
      <!-- 每个 item 只有一个根元素 -->
      <template #item="{ element }">
        <div class="note-tree-item-wrapper">
          <!-- 笔记项 / 文件夹项 -->
          <!-- 未展开的文件夹添加原生拖放事件，允许直接拖入 -->
          <div
            class="note-tree-item"
            :class="{
              'note-tree-item--active': isActive(element.path),
              'note-tree-item--folder': element.isFolder,
              'note-tree-item--drag-over':
                element.isFolder && !isExpanded(element) && dragOverFolderPath === element.path,
            }"
            :style="getIndentStyle()"
            @click="handleItemClick(element)"
            @contextmenu="(e) => handleContextMenu(e, element)"
            @dragenter="
              element.isFolder && !isExpanded(element)
                ? handleFolderDragEnter($event, element)
                : undefined
            "
            @dragover="
              element.isFolder && !isExpanded(element)
                ? handleFolderDragOver($event, element)
                : undefined
            "
            @dragleave="
              element.isFolder && !isExpanded(element)
                ? handleFolderDragLeave($event, element)
                : undefined
            "
            @drop="
              element.isFolder && !isExpanded(element)
                ? handleFolderDrop($event, element)
                : undefined
            "
          >
            <!-- 展开/折叠箭头 -->
            <UIcon
              v-if="element.isFolder"
              :name="isExpanded(element) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="note-tree-arrow"
              @click.stop="toggleExpand(element)"
            />
            <span v-else class="note-tree-arrow-placeholder" />

            <!-- 图标 -->
            <UIcon
              :name="element.isFolder ? 'i-lucide-folder' : 'i-lucide-file-text'"
              class="note-tree-icon"
              :class="{ 'note-tree-icon--folder': element.isFolder }"
            />

            <!-- 名称 -->
            <span class="note-tree-label">
              {{ element.name.replace('.md', '') }}
            </span>

            <!-- 拖放提示图标 - 仅在拖拽悬停时显示 -->
            <UIcon
              v-if="element.isFolder && !isExpanded(element) && dragOverFolderPath === element.path"
              name="i-lucide-arrow-down-to-line"
              class="note-tree-drop-hint"
            />
          </div>

          <!-- 文件夹展开时的子项 -->
          <div v-if="element.isFolder && isExpanded(element)" class="note-tree-children">
            <NoteTree
              :items="element.children || []"
              :active-tab-path="activeTabPath"
              :depth="depth + 1"
              :parent-folder-path="element.path"
              @select="(note) => emit('select', note)"
              @contextmenu="(e, note) => emit('contextmenu', e, note)"
              @move="(note, folder) => emit('move', note, folder)"
            />
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped>
.note-tree-list {
  display: flex;
  flex-direction: column;
  min-height: 4px;
}

.note-tree-item-wrapper {
  user-select: none;
}

.note-tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
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

.note-tree-arrow {
  width: 16px;
  height: 16px;
  color: var(--text-mute);
  flex-shrink: 0;
  transition: transform 0.15s ease;
  cursor: pointer;
}

.note-tree-arrow:hover {
  color: var(--text-main);
}

.note-tree-arrow-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.note-tree-icon {
  width: 16px;
  height: 16px;
  color: var(--text-mute);
  flex-shrink: 0;
}

.note-tree-icon--folder {
  color: var(--accent-color);
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
  border-left: 1px solid var(--border-color);
  margin-left: 8px;
}

/* 文件夹拖拽悬停高亮状态 */
.note-tree-item--drag-over {
  background-color: var(--highlight-bg);
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
}

.note-tree-item--drag-over .note-tree-icon--folder {
  color: var(--accent-color-hover);
  transform: scale(1.1);
}

.note-tree-item--drag-over .note-tree-label {
  color: var(--accent-color);
  font-weight: 500;
}

/* 拖放提示图标 */
.note-tree-drop-hint {
  width: 14px;
  height: 14px;
  color: var(--accent-color);
  flex-shrink: 0;
  margin-left: auto;
  animation: drop-hint-pulse 0.6s ease-in-out infinite alternate;
}

@keyframes drop-hint-pulse {
  from {
    opacity: 0.6;
    transform: translateY(0);
  }
  to {
    opacity: 1;
    transform: translateY(2px);
  }
}

/* 拖拽样式 */
.note-tree-ghost {
  opacity: 0.4;
  background-color: var(--highlight-bg);
  border-radius: 6px;
}

.note-tree-chosen {
  background-color: var(--bg-sidebar);
}

.note-tree-drag {
  opacity: 1;
  background-color: var(--bg-paper);
  box-shadow: 0 4px 12px var(--shadow-color-strong);
  border-radius: 6px;
}

/* 全局拖拽状态 */
:global(body.is-dragging) {
  cursor: grabbing !important;
}

:global(body.is-dragging *) {
  cursor: grabbing !important;
}
</style>
