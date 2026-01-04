<script setup lang="ts">
import type { TabItem } from '~/composables/useTabs'

const {
  openTabs,
  activeTabId,
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  closeTabsToLeft,
  closeAllTabs,
  switchTab,
  showTabInExplorer,
  copyTabPath,
} = useTabs()

// 为每个标签页生成右键菜单项
const getContextMenuItems = (tab: TabItem) => {
  const tabIndex = openTabs.value.findIndex(t => t.id === tab.id)
  
  return [
    [
      {
        label: '关闭',
        icon: 'i-lucide-x',
        onSelect: () => closeTab(tab.id)
      },
      {
        label: '关闭其他',
        icon: 'i-lucide-x-circle',
        disabled: openTabs.value.length <= 1,
        onSelect: () => closeOtherTabs(tab.id)
      },
    ],
    [
      {
        label: '关闭左侧',
        icon: 'i-lucide-arrow-left-to-line',
        disabled: tabIndex === 0,
        onSelect: () => closeTabsToLeft(tab.id)
      },
      {
        label: '关闭右侧',
        icon: 'i-lucide-arrow-right-to-line',
        disabled: tabIndex === openTabs.value.length - 1,
        onSelect: () => closeTabsToRight(tab.id)
      },
      {
        label: '关闭全部',
        icon: 'i-lucide-x-square',
        onSelect: () => closeAllTabs()
      },
    ],
    [
      {
        label: '复制路径',
        icon: 'i-lucide-link',
        onSelect: () => copyTabPath(tab.id)
      },
      {
        label: '在资源管理器中显示',
        icon: 'i-lucide-folder-open',
        onSelect: () => showTabInExplorer(tab.id)
      },
    ],
  ]
}

// 获取显示名称（去除 .md 后缀）
const getDisplayName = (name: string) => {
  return name.replace(/\.md$/i, '')
}
</script>

<template>
  <div class="tabs-container">
    <!-- 空状态 -->
    <div v-if="openTabs.length === 0" class="tabs-empty">
      <span>暂无打开的文件</span>
    </div>

    <!-- 标签页列表 -->
    <div v-else class="tabs-list">
      <UContextMenu
        v-for="tab in openTabs"
        :key="tab.id"
        :items="getContextMenuItems(tab)"
      >
        <div
          class="tab-item"
          :class="{ 'tab-item--active': tab.id === activeTabId }"
          @click="switchTab(tab.id)"
        >
          <!-- 文件图标 -->
          <UIcon name="i-lucide-file-text" class="tab-icon" />
          
          <!-- 文件名 -->
          <span class="tab-name">{{ getDisplayName(tab.name) }}</span>
          
          <!-- 修改指示器 / 关闭按钮 -->
          <div class="tab-actions ml-3">
            <UIcon 
              v-if="tab.isModified" 
              name="i-lucide-circle" 
              class="modified-indicator"
            />
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-x"
              class="close-btn"
              :class="{ 'close-btn--visible': !tab.isModified }"
              @click.stop="closeTab(tab.id)"
            />
          </div>
        </div>
      </UContextMenu>
    </div>
  </div>
</template>

<style scoped>
.tabs-container {
  display: flex;
  align-items: center;
  height: 36px;
  background-color: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  overflow-y: hidden;
}

.tabs-container::-webkit-scrollbar {
  height: 3px;
}

.tabs-container::-webkit-scrollbar-thumb {
  background-color: var(--border-color);
  border-radius: 3px;
}

.tabs-empty {
  padding: 0 1rem;
  font-size: 0.75rem;
  color: var(--text-mute);
}

.tabs-list {
  display: flex;
  align-items: stretch;
  height: 100%;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.75rem;
  height: 100%;
  min-width: 0;
  max-width: 180px;
  cursor: pointer;
  border-right: 1px solid var(--border-color);
  background-color: transparent;
  transition: background-color 0.15s ease;
  position: relative;
}

.tab-item:hover {
  background-color: var(--bg-app);
}

.tab-item--active {
  background-color: var(--bg-paper);
}

/* 激活标签页底部高亮线 */
.tab-item--active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--accent-color);
}

.tab-icon {
  width: 14px;
  height: 14px;
  color: var(--text-mute);
  flex-shrink: 0;
}

.tab-item--active .tab-icon {
  color: var(--accent-color);
}

.tab-name {
  font-size: 0.8125rem;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.tab-item--active .tab-name {
  font-weight: 500;
}

.tab-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  position: relative;
}

.modified-indicator {
  width: 8px;
  height: 8px;
  color: var(--accent-color);
  position: absolute;
  left: -10px;
  margin: auto;
}

.close-btn {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.close-btn--visible {
  opacity: 0;
}

.tab-item:hover .close-btn {
  opacity: 1;
}

.tab-item:hover .modified-indicator {
  display: none;
}
</style>
