<script setup lang="ts">
import type { UIMessage } from 'ai';
import type { PromptInputMessage } from '~/components/ai-elements/prompt-input';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '~/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '~/components/ai-elements/message';
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '~/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '~/components/ai-elements/suggestion';

import { useAiAssistantChat } from '~/composables/ai/useAiAssistantChat';

const { resolved, messages, status, error, sendMessage, abort, clear } = useAiAssistantChat();

const quickSuggestions = [
  '帮我把这一段润色得更自然一点',
  '基于我正在写的内容，给我 3 个续写灵感',
  '把下面内容提炼成要点清单',
];

const isBusy = computed(() => status.value === 'submitted' || status.value === 'streaming');

const getMessageText = (msg: UIMessage) => {
  const parts = Array.isArray(msg.parts) ? msg.parts : [];
  return parts
    .filter((p: any) => p?.type === 'text')
    .map((p: any) => p.text || '')
    .join('');
};

const handleSubmit = async (payload: PromptInputMessage) => {
  await sendMessage(payload);
};
</script>

<template>
  <div
    class="h-full flex flex-col"
    style="background-color: var(--bg-sidebar); border-left: 1px solid var(--border-color)"
  >
    <div
      class="p-4 flex items-center justify-between"
      style="border-bottom: 1px solid var(--border-color)"
    >
      <div class="flex flex-col gap-0.5">
        <h2 class="font-semibold leading-tight" style="color: var(--text-main)">ai助理</h2>
        <p class="text-xs leading-tight" style="color: var(--text-mute)">
          <span v-if="!resolved.isConfigured">请先在设置中配置 AI Key / 模型</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-trash-2"
          :disabled="messages.length === 0 || isBusy"
          title="清空对话"
          @click="clear"
        />
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <Conversation class="h-full">
        <ConversationScrollButton />

        <template v-if="messages.length === 0">
          <ConversationEmptyState
            :title="resolved.isConfigured ? '我能帮你做什么？' : 'AI 未配置'"
            :description="
              resolved.isConfigured
                ? '你可以提问、让它润色、总结、生成续写灵感'
                : resolved.warnings[0] || '请在右上角设置里填写 Key / Model'
            "
          >
            <template #default>
              <div class="w-full flex flex-col items-center gap-3">
                <div class="text-xs" style="color: var(--text-mute)">试试这些快捷指令：</div>
                <Suggestions class="justify-center">
                  <Suggestion
                    v-for="s in quickSuggestions"
                    :key="s"
                    :suggestion="s"
                    @click="sendMessage({ text: s, files: [] })"
                  />
                </Suggestions>
              </div>
            </template>
          </ConversationEmptyState>
        </template>

        <ConversationContent v-else class="pb-6">
          <Message v-for="m in messages" :key="m.id" :from="m.role">
            <MessageContent class="max-w-full">
              <template v-if="m.role === 'assistant'">
                <MessageResponse :content="getMessageText(m)" />
              </template>
              <template v-else>
                <div class="whitespace-pre-wrap wrap-break-word">
                  {{ getMessageText(m) }}
                </div>
              </template>

              <div
                v-if="m.role === 'assistant' && status === 'streaming'"
                class="text-xs mt-2"
                style="color: var(--text-mute)"
              >
                正在生成中…（可停止）
              </div>
            </MessageContent>
          </Message>
        </ConversationContent>
      </Conversation>
    </div>

    <div class="p-4" style="border-top: 1px solid var(--border-color)">
      <div v-if="error" class="text-xs mb-2" style="color: var(--color-error)">
        {{ error }}
      </div>

      <PromptInput
        :max-files="4"
        accept="image/*"
        :global-drop="true"
        class="w-full"
        @submit="handleSubmit"
      >
        <PromptInputAttachments>
          <template #default="{ file }">
            <PromptInputAttachment :file="file" />
          </template>
        </PromptInputAttachments>

        <PromptInputBody>
          <PromptInputTextarea
            placeholder="问我点什么…（Enter 发送，Shift+Enter 换行，支持拖拽/粘贴图片）"
            :disabled="!resolved.isConfigured || isBusy"
          />
        </PromptInputBody>

        <PromptInputFooter>
          <div class="flex items-center gap-2">
            <UButton
              v-if="status === 'streaming'"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-square"
              title="停止生成"
              @click="abort"
            >
              停止
            </UButton>
          </div>

          <div class="flex items-center gap-2">
            <PromptInputSubmit :status="status" :disabled="!resolved.isConfigured || isBusy" />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  </div>
</template>
