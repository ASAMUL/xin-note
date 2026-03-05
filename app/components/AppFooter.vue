<script setup lang="ts">
/**
 * 全局底部状态栏组件
 * 始终显示帮助图标，有打开的标签页时显示字数统计和时间信息
 */

const { activeTab, hasOpenTabs } = useTabs();

// 帮助菜单选项
const helpMenuItems = ref([
  [
    {
      label: '用户指南',
      icon: 'i-lucide-book-open',
      click: () => {
        // 占位功能
        console.log('打开用户指南');
      },
    },
    {
      label: '问题反馈',
      icon: 'i-lucide-message-square',
      click: () => {
        // 占位功能
        console.log('问题反馈');
      },
    },
  ],
  [
    {
      label: '开发者工具',
      icon: 'i-lucide-settings',
      click: () => {
        // 占位功能
        console.log('打开开发者工具');
      },
    },
  ],
  [
    {
      label: '访问官方网站',
      icon: 'i-lucide-globe',
      click: () => {
        // 占位功能
        console.log('访问官方网站');
      },
    },
    {
      label: '访问 GitHub 项目',
      icon: 'i-simple-icons-github',
      click: () => {
        // 占位功能
        console.log('访问 GitHub');
      },
    },
  ],
]);

// 计算字符数（包括空格）
const charCount = computed(() => {
  if (!activeTab.value?.content) return 0;
  return activeTab.value.content.length;
});

// 计算字数（中文按字算，英文按单词算）
const wordCount = computed(() => {
  if (!activeTab.value?.content) return 0;
  const content = activeTab.value.content.trim();
  if (!content) return 0;

  // 中文字符
  const chineseChars = content.match(/[\u4e00-\u9fa5]/g) || [];
  // 英文单词（连续的英文字母）
  const englishWords = content.match(/[a-zA-Z]+/g) || [];

  return chineseChars.length + englishWords.length;
});

// 计算行数
const lineCount = computed(() => {
  if (!activeTab.value?.content) return 0;
  return activeTab.value.content.split('\n').length;
});

// 格式化时间显示
const formatTime = (isoString?: string): string => {
  if (!isoString) return '未知';
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 创建时间显示
const createdAtText = computed(() => {
  return formatTime(activeTab.value?.createdAt);
});

// 修改时间显示
const modifiedAtText = computed(() => {
  return formatTime(activeTab.value?.modifiedAt);
});
</script>

<template>
  <footer class="status-bar">
    <!-- 左侧：字数统计（仅在有打开标签页时显示） -->
    <div class="status-left">
      <template v-if="hasOpenTabs && activeTab">
        <span class="status-item">字符 {{ charCount }}</span>
        <span class="status-divider">·</span>
        <span class="status-item">字 {{ wordCount }}</span>
        <span class="status-divider">·</span>
        <span class="status-item">行 {{ lineCount }}</span>
      </template>
    </div>

    <!-- 右侧：时间信息和帮助图标 -->
    <div class="status-right">
      <!-- 时间信息（仅在有打开标签页时显示） -->
      <template v-if="hasOpenTabs && activeTab">
        <span class="status-time">创建于 {{ createdAtText }}</span>
        <span class="status-divider">·</span>
        <span class="status-time">修改于 {{ modifiedAtText }}</span>
      </template>

      <!-- 帮助图标（始终显示） -->
      <UDropdownMenu :items="helpMenuItems">
        <UTooltip text="帮助" :delay-duration="300">
          <UButton
            icon="i-lucide-help-circle"
            variant="ghost"
            color="neutral"
            size="xs"
            class="help-button"
          />
        </UTooltip>
      </UDropdownMenu>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  background-color: var(--color-soft);
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-mute);
  flex-shrink: 0;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-item,
.status-time {
  white-space: nowrap;
}

.status-divider {
  opacity: 0.5;
}

.help-button {
  height: 1.25rem;
  width: 1.25rem;
  padding: 0;
}
</style>
