<script setup lang="ts">
import type { PromptInputMessage } from '~/components/ai-elements/prompt-input';
import type {
  AiAssistantMessage,
  AiAssistantMessageMeta,
  AiAssistantRagSource,
  AiAssistantSession,
} from '~/types/ai-assistant';

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
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '~/components/ai-elements/queue';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtImage,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '~/components/ai-elements/chain-of-thought';
import { Sources, SourcesContent, SourcesTrigger } from '~/components/ai-elements/sources';
import { Suggestion, Suggestions } from '~/components/ai-elements/suggestion';

import { useAiAssistantChat } from '~/composables/ai/useAiAssistantChat';

const {
  resolved,
  messages,
  groupedSessions,
  sessionCount,
  activeSessionId,
  activeSessionTitle,
  status,
  isBusy,
  sendMessage,
  abort,
  clear,
  createSession,
  switchSession,
  deleteSession,
} = useAiAssistantChat();

const historyOpen = ref(false);

const quickSuggestions = [
  '帮我把这段内容润色得更自然一些。',
  '基于我正在写的内容，给我 3 个续写灵感。',
  '把下面内容提炼成要点清单。',
];

const getMessageText = (message: AiAssistantMessage) => {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => part.text || '')
    .join('');
};

const getReasoningText = (message: AiAssistantMessage) => {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter((part: any) => part?.type === 'reasoning')
    .map((part: any) => part.text || '')
    .join('');
};

const getMessageSources = (message: AiAssistantMessage): AiAssistantRagSource[] => {
  const metadata = (message.metadata || {}) as AiAssistantMessageMeta;
  return Array.isArray(metadata.ragSources) ? metadata.ragSources : [];
};

const getRagWarning = (message: AiAssistantMessage) => {
  const metadata = (message.metadata || {}) as AiAssistantMessageMeta;
  return typeof metadata.ragWarning === 'string' ? metadata.ragWarning : '';
};

const isMessageStreaming = (message: AiAssistantMessage) => {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts.some(
    (part: any) =>
      (part?.type === 'text' || part?.type === 'reasoning') && part?.state === 'streaming',
  );
};


type ChainOfThoughtStepStatus = 'complete' | 'active' | 'pending';

interface ChainOfThoughtProgressStepData {
  key: 'retrieval' | 'reasoning' | 'response' | 'completed';
  label: string;
  description: string;
  status: ChainOfThoughtStepStatus;
}

interface ChainOfThoughtImageData {
  src: string;
  caption: string;
}

interface ChainOfThoughtViewModel {
  shouldShow: boolean;
  progressSteps: ChainOfThoughtProgressStepData[];
  reasoningSteps: string[];
  searchResults: string[];
  images: ChainOfThoughtImageData[];
}

const getMessageParts = (message: AiAssistantMessage): any[] => {
  return Array.isArray(message.parts) ? (message.parts as any[]) : [];
};

const toReasoningSteps = (reasoningText: string) => {
  return reasoningText
    .split(/\n+/)
    .map((step) => step.trim())
    .filter(Boolean);
};

const isImageMediaType = (mediaType: unknown) => {
  return typeof mediaType === 'string' && mediaType.startsWith('image/');
};

const resolveImageSrc = (part: any) => {
  if (typeof part?.url === 'string' && part.url) {
    return part.url;
  }

  if (typeof part?.base64 === 'string' && part.base64 && isImageMediaType(part?.mediaType)) {
    return `data:${part.mediaType};base64,${part.base64}`;
  }

  return '';
};

const getSearchResultTags = (message: AiAssistantMessage): string[] => {
  const fileNames = getMessageSources(message)
    .map((source) => (source.fileName || '').trim())
    .filter(Boolean);

  return Array.from(new Set(fileNames));
};

const getAssistantImageParts = (message: AiAssistantMessage): ChainOfThoughtImageData[] => {
  return getMessageParts(message)
    .map((part: any, index: number) => {
      if (part?.type === 'file' && isImageMediaType(part?.mediaType)) {
        const src = resolveImageSrc(part);
        if (!src) return null;

        return {
          src,
          caption: `模型图像 · ${part.filename || `图片 ${index + 1}`}`,
        };
      }

      if (part?.type === 'image' || part?.type === 'experimental_generated-image') {
        const src = resolveImageSrc(part);
        if (!src) return null;

        return {
          src,
          caption: `模型图像 · 图片 ${index + 1}`,
        };
      }

      return null;
    })
    .filter((item): item is ChainOfThoughtImageData => Boolean(item));
};

const getNearestUserImageParts = (
  currentMessages: AiAssistantMessage[],
  assistantIndex: number,
): ChainOfThoughtImageData[] => {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = currentMessages[index];
    if (!message || message.role !== 'user') continue;

    return getMessageParts(message)
      .filter((part: any) => part?.type === 'file' && isImageMediaType(part?.mediaType))
      .map((part: any, imageIndex: number) => {
        const src = resolveImageSrc(part);
        if (!src) return null;

        return {
          src,
          caption: `用户上传 · ${part.filename || `图片 ${imageIndex + 1}`}`,
        };
      })
      .filter((item): item is ChainOfThoughtImageData => Boolean(item));
  }

  return [];
};

const getProgressSteps = (
  message: AiAssistantMessage,
  reasoningSteps: string[],
): ChainOfThoughtProgressStepData[] => {
  const parts = getMessageParts(message);
  const isStreaming = isMessageStreaming(message);
  const sourceCount = getMessageSources(message).length;
  const hasReasoning = reasoningSteps.length > 0;
  const hasText = getMessageText(message).trim().length > 0;

  const reasoningStreaming = parts.some(
    (part: any) => part?.type === 'reasoning' && part?.state === 'streaming',
  );
  const textStreaming = parts.some((part: any) => part?.type === 'text' && part?.state === 'streaming');

  const retrievalStatus: ChainOfThoughtStepStatus =
    sourceCount > 0 || hasReasoning || hasText || !isStreaming ? 'complete' : 'active';
  const reasoningStatus: ChainOfThoughtStepStatus = reasoningStreaming
    ? 'active'
    : hasReasoning || (!isStreaming && hasText)
      ? 'complete'
      : 'pending';
  const responseStatus: ChainOfThoughtStepStatus = textStreaming
    ? 'active'
    : hasText
      ? 'complete'
      : 'pending';
  const completedStatus: ChainOfThoughtStepStatus = !isStreaming && hasText ? 'complete' : 'pending';

  return [
    {
      key: 'retrieval',
      label: '检索上下文',
      description: sourceCount > 0 ? `命中 ${sourceCount} 条结果` : '未命中检索片段',
      status: retrievalStatus,
    },
    {
      key: 'reasoning',
      label: '推理分析',
      description: hasReasoning ? `已产出 ${reasoningSteps.length} 个步骤` : '等待推理内容',
      status: reasoningStatus,
    },
    {
      key: 'response',
      label: '生成回答',
      description: textStreaming ? '正在生成回答内容' : hasText ? '回答内容已生成' : '等待回答内容',
      status: responseStatus,
    },
    {
      key: 'completed',
      label: '完成',
      description: completedStatus === 'complete' ? '当前轮次已完成' : '等待生成结束',
      status: completedStatus,
    },
  ];
};

const chainOfThoughtByMessageId = computed<Record<string, ChainOfThoughtViewModel>>(() => {
  const currentMessages = messages.value;
  const result: Record<string, ChainOfThoughtViewModel> = {};

  currentMessages.forEach((message, messageIndex) => {
    if (message.role !== 'assistant') return;

    const reasoningSteps = toReasoningSteps(getReasoningText(message));
    const searchResults = getSearchResultTags(message);

    const assistantImages = getAssistantImageParts(message);
    const images = assistantImages.length > 0
      ? assistantImages
      : getNearestUserImageParts(currentMessages, messageIndex);

    const progressSteps = getProgressSteps(message, reasoningSteps);
    const shouldShow =
      isMessageStreaming(message) ||
      reasoningSteps.length > 0 ||
      searchResults.length > 0 ||
      images.length > 0;

    result[message.id] = {
      shouldShow,
      progressSteps,
      reasoningSteps,
      searchResults,
      images,
    };
  });

  return result;
});

const getChainOfThought = (message: AiAssistantMessage) => {
  return chainOfThoughtByMessageId.value[message.id];
};

const shouldShowChainOfThought = (message: AiAssistantMessage) => {
  return Boolean(getChainOfThought(message)?.shouldShow);
};

const getChainProgressSteps = (message: AiAssistantMessage): ChainOfThoughtProgressStepData[] => {
  return getChainOfThought(message)?.progressSteps || [];
};

const getChainSearchResults = (message: AiAssistantMessage): string[] => {
  return getChainOfThought(message)?.searchResults || [];
};

const getChainReasoningSteps = (message: AiAssistantMessage): string[] => {
  return getChainOfThought(message)?.reasoningSteps || [];
};

const getChainImages = (message: AiAssistantMessage): ChainOfThoughtImageData[] => {
  return getChainOfThought(message)?.images || [];
};
const getSessionPreview = (session: AiAssistantSession) => {
  const firstUserMessage = session.messages.find((message) => message.role === 'user');
  if (!firstUserMessage) {
    return '还没有消息';
  }

  const text = getMessageText(firstUserMessage).replace(/\s+/g, ' ').trim();
  if (!text) {
    return '图片或附件会话';
  }

  return text.length > 36 ? `${text.slice(0, 36)}...` : text;
};

const formatSessionTime = (session: AiAssistantSession) => {
  const date = new Date(session.updatedAt);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const handleSubmit = async (payload: PromptInputMessage) => {
  await sendMessage(payload);
};

const handleCreateSession = async () => {
  await createSession();
};

const handleSwitchSession = async (sessionId: string) => {
  await switchSession(sessionId);
  historyOpen.value = false;
};

const handleDeleteSession = async (sessionId: string) => {
  await deleteSession(sessionId);
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
      <div class="flex flex-col gap-0.5 min-w-0">
        <h2 class="font-semibold leading-tight" style="color: var(--text-main)">AI 助手</h2>
        <p class="text-xs leading-tight truncate" style="color: var(--text-mute)">
          当前会话：{{ activeSessionTitle }}
        </p>
        <p class="text-xs leading-tight" style="color: var(--text-mute)">
          <span v-if="!resolved.isConfigured">请先在设置中配置 AI Key / Base URL / 模型</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-plus"
          :disabled="isBusy"
          title="新建会话"
          @click="handleCreateSession"
        />

        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-history"
          :disabled="sessionCount === 0"
          title="历史会话"
          @click="historyOpen = true"
        />

        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-trash-2"
          :disabled="messages.length === 0 || isBusy"
          title="清空当前会话"
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
                ? '你可以提问、润色、总结，或者让 AI 帮你继续写作。'
                : resolved.warnings[0] || '请在设置中填写 Key / Base URL / 模型'
            "
          >
            <template #default>
              <div class="w-full flex flex-col items-center gap-3">
                <div class="text-xs" style="color: var(--text-mute)">试试这些快捷指令：</div>
                <Suggestions class="justify-center">
                  <Suggestion
                    v-for="suggestion in quickSuggestions"
                    :key="suggestion"
                    :suggestion="suggestion"
                    @click="sendMessage({ text: suggestion, files: [] })"
                  />
                </Suggestions>
              </div>
            </template>
          </ConversationEmptyState>
        </template>

        <ConversationContent v-else class="pb-6">
          <Message v-for="message in messages" :key="message.id" :from="message.role">
            <MessageContent class="max-w-full">
              <template v-if="message.role === 'assistant'">
                <ChainOfThought
                  v-if="shouldShowChainOfThought(message)"
                  class="mb-2 rounded-md px-3 py-2"
                  :default-open="true"
                  style="background-color: var(--bg-main); border: 1px solid var(--border-color)"
                >
                  <ChainOfThoughtHeader class="text-xs" style="color: var(--text-mute)">
                    思考过程
                  </ChainOfThoughtHeader>

                  <ChainOfThoughtContent class="space-y-3">
                    <div class="space-y-2">
                      <ChainOfThoughtStep
                        v-for="progressStep in getChainProgressSteps(message)"
                        :key="progressStep.key"
                        :label="progressStep.label"
                        :description="progressStep.description"
                        :status="progressStep.status"
                      >
                        <template #icon>
                          <UIcon
                            :name="
                              progressStep.status === 'complete'
                                ? 'i-lucide-check'
                                : progressStep.status === 'active'
                                  ? 'i-lucide-loader-2'
                                  : 'i-lucide-circle'
                            "
                            class="w-4 h-4"
                            :class="progressStep.status === 'active' ? 'animate-spin' : ''"
                          />
                        </template>
                      </ChainOfThoughtStep>
                    </div>

                    <div v-if="getChainSearchResults(message).length > 0" class="space-y-1">
                      <div class="text-[11px] font-medium" style="color: var(--text-mute)">检索结果</div>
                      <ChainOfThoughtSearchResults>
                        <ChainOfThoughtSearchResult
                          v-for="searchResult in getChainSearchResults(message)"
                          :key="searchResult"
                        >
                          {{ searchResult }}
                        </ChainOfThoughtSearchResult>
                      </ChainOfThoughtSearchResults>
                    </div>

                    <div v-if="getChainReasoningSteps(message).length > 0" class="space-y-2">
                      <div class="text-[11px] font-medium" style="color: var(--text-mute)">逐步思考</div>
                      <ChainOfThoughtStep
                        v-for="(reasoningStep, stepIndex) in getChainReasoningSteps(message)"
                        :key="`${message.id}-reasoning-${stepIndex}`"
                        :label="`步骤 ${stepIndex + 1}`"
                        :description="reasoningStep"
                        status="complete"
                      >
                        <template #icon>
                          <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
                        </template>
                      </ChainOfThoughtStep>
                    </div>

                    <div v-if="getChainImages(message).length > 0" class="space-y-2">
                      <div class="text-[11px] font-medium" style="color: var(--text-mute)">图像</div>
                      <ChainOfThoughtImage
                        v-for="(image, imageIndex) in getChainImages(message)"
                        :key="`${message.id}-image-${imageIndex}`"
                        :caption="image.caption"
                      >
                        <img
                          :src="image.src"
                          :alt="image.caption"
                          class="max-h-56 w-auto rounded-md object-contain"
                          loading="lazy"
                        >
                      </ChainOfThoughtImage>
                    </div>
                  </ChainOfThoughtContent>
                </ChainOfThought>

                <MessageResponse :content="getMessageText(message)" />

                <Sources v-if="getMessageSources(message).length > 0" class="mt-3">
                  <SourcesTrigger :count="getMessageSources(message).length">
                    <span>引用来源（{{ getMessageSources(message).length }}）</span>
                  </SourcesTrigger>

                  <SourcesContent class="w-full">
                    <div
                      v-for="source in getMessageSources(message)"
                      :key="`${source.docId}-${source.chunkId}`"
                      class="rounded-md px-2 py-1.5"
                      style="
                        background-color: var(--bg-main);
                        border: 1px solid var(--border-color);
                      "
                    >
                      <div class="text-xs font-medium" style="color: var(--text-main)">
                        {{ source.fileName }}
                      </div>
                      <div class="text-[11px] mt-1 whitespace-pre-wrap" style="color: var(--text-mute)">
                        {{ source.snippet }}
                      </div>
                    </div>
                  </SourcesContent>
                </Sources>

                <div
                  v-if="getRagWarning(message)"
                  class="text-xs mt-2 whitespace-pre-wrap"
                  style="color: var(--text-mute)"
                >
                  {{ getRagWarning(message) }}
                </div>
              </template>

              <template v-else>
                <div class="whitespace-pre-wrap break-words">
                  {{ getMessageText(message) }}
                </div>
              </template>

              <div
                v-if="message.role === 'assistant' && isMessageStreaming(message)"
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

    <UModal v-model:open="historyOpen">
      <template #content>
        <div class="p-4 w-[560px] max-w-[96vw]">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="text-sm font-semibold" style="color: var(--text-main)">历史会话</h3>
              <p class="text-xs" style="color: var(--text-mute)">点击可切换会话，右侧可删除会话</p>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-plus"
              :disabled="isBusy"
              @click="handleCreateSession"
            >
              新建会话
            </UButton>
          </div>

          <Queue>
            <template v-if="groupedSessions.length === 0">
              <div class="text-xs px-2 py-3" style="color: var(--text-mute)">暂无历史会话</div>
            </template>

            <QueueSection v-for="group in groupedSessions" :key="group.key" :default-open="true">
              <QueueSectionTrigger>
                <QueueSectionLabel :count="group.sessions.length" :label="group.label" />
              </QueueSectionTrigger>

              <QueueSectionContent>
                <QueueList class="max-h-[260px]">
                  <QueueItem
                    v-for="session in group.sessions"
                    :key="session.id"
                    :class="session.id === activeSessionId ? 'bg-muted' : ''"
                  >
                    <div class="flex items-start gap-2">
                      <button
                        class="flex-1 min-w-0 text-left"
                        type="button"
                        :disabled="isBusy"
                        @click="handleSwitchSession(session.id)"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-sm truncate" style="color: var(--text-main)">{{ session.title }}</span>
                          <span class="text-[11px] shrink-0" style="color: var(--text-mute)">
                            {{ formatSessionTime(session) }}
                          </span>
                        </div>
                        <div class="text-xs mt-1 truncate" style="color: var(--text-mute)">
                          {{ getSessionPreview(session) }}
                        </div>
                      </button>

                      <QueueItemActions>
                        <QueueItemAction
                          :disabled="isBusy"
                          title="删除会话"
                          @click.stop="handleDeleteSession(session.id)"
                        >
                          <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" />
                        </QueueItemAction>
                      </QueueItemActions>
                    </div>
                  </QueueItem>
                </QueueList>
              </QueueSectionContent>
            </QueueSection>
          </Queue>
        </div>
      </template>
    </UModal>
  </div>
</template>
