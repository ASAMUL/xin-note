<script setup lang="ts">
import SettingsNotesSection from './sections/SettingsNotesSection.vue';
import SettingsAiSection from './sections/SettingsAiSection.vue';

type SettingsSectionId = 'notes' | 'ai';

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

const sections = [
  { id: 'notes' as const, label: '笔记', icon: 'i-lucide-folder' },
  { id: 'ai' as const, label: 'AI 配置', icon: 'i-lucide-sparkles' },
];

const active = ref<SettingsSectionId>('notes');
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-5xl' }">
    <template #content>
      <div class="settings-shell">
        <!-- 顶部栏 -->
        <div class="settings-topbar">
          <div class="flex items-center gap-3">
            <div class="settings-icon">
              <UIcon name="i-lucide-settings" class="w-5 h-5" />
            </div>
            <div class="flex flex-col">
              <h3 class="text-base font-semibold" style="color: var(--text-main)">设置</h3>
              <p class="text-xs" style="color: var(--text-mute)">应用偏好与 AI 连接配置</p>
            </div>
          </div>

          <UButton variant="ghost" color="neutral" icon="i-lucide-x" @click="isOpen = false">
            关闭
          </UButton>
        </div>

        <!-- 主体：左侧菜单 + 右侧内容 -->
        <div class="settings-body">
          <aside class="settings-nav">
            <div class="flex flex-col gap-1">
              <UButton
                v-for="item in sections"
                :key="item.id"
                :variant="active === item.id ? 'soft' : 'ghost'"
                :color="active === item.id ? 'primary' : 'neutral'"
                size="sm"
                :icon="item.icon"
                class="w-full justify-start"
                @click="active = item.id"
              >
                {{ item.label }}
              </UButton>
            </div>
          </aside>

          <section class="settings-content">
            <div class="settings-content-inner">
              <SettingsNotesSection v-if="active === 'notes'" :open="isOpen" />
              <SettingsAiSection v-else :open="isOpen" />
            </div>
          </section>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.settings-shell {
  height: 80vh;
  min-height: 520px;
  display: flex;
  flex-direction: column;
}

.settings-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-popup);
}

.settings-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-color), var(--accent-hover));
  color: white;
}

.settings-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  overflow: hidden;
  background-color: var(--bg-popup);
}

.settings-nav {
  padding: 12px;
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
}

.settings-content {
  overflow: hidden;
  background-color: var(--bg-popup);
}

.settings-content-inner {
  height: 100%;
  overflow: auto;
  padding: 16px;
}

@media (max-width: 760px) {
  .settings-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .settings-nav {
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
}
</style>
