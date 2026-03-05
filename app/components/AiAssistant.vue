<script setup lang="ts">
import type { DynamicToolUIPart } from 'ai';
import type {
  PromptInputContext,
  PromptInputMessage,
  PromptInputReference,
} from '~/components/ai-elements/prompt-input';
import type { NoteItem } from '~/composables/useNotes';
import type {
  AiAssistantErrorInfo,
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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '~/components/ai-elements/tool';
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '~/components/ai-elements/confirmation';

import AiAssistantChatModelPicker from '~/components/ai-assistant/AiAssistantChatModelPicker.vue';
import AiAssistantErrorNotice from '~/components/ai-assistant/AiAssistantErrorNotice.vue';
import { useAiAssistantChat } from '~/composables/ai/useAiAssistantChat';
import { useAiAssistantErrorLog } from '~/composables/ai/useAiAssistantErrorLog';
import { useNoteContentSearch } from '~/composables/search/useNoteContentSearch';
import { useNotes } from '~/composables/useNotes';
import { useSettings } from '~/composables/useSettings';
import { useTabs } from '~/composables/useTabs';

const {
  resolved,
  messages,
  groupedSessions,
  sessionCount,
  activeSessionId,
  activeSessionTitle,
  status,
  error: chatError,
  isBusy,
  sendMessage,
  respondToolApproval,
  abort,
  clear,
  createSession,
  switchSession,
  deleteSession,
} = useAiAssistantChat();

const { locale, t } = useI18n();
const { notesDirectory } = useSettings();
const { notes, loadNotes } = useNotes();
const { openTabs } = useTabs();
const { errorLogs } = useAiAssistantErrorLog();

const historyOpen = ref(false);
const errorDetailOpen = ref(false);
const activeErrorDetail = ref<AiAssistantErrorInfo | null>(null);
const latestErrorLog = computed(() => errorLogs.value[0] || null);

const quickSuggestions = [
  '帮我把这段内容润色得更自然一些。',
  '基于我正在写的内容，给我 3 个续写灵感。',
  '把下面内容提炼成要点清单。',
];

interface PromptCursorChangePayload {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

interface MentionRange {
  start: number;
  end: number;
  query: string;
}

interface AiAssistantMentionCandidate {
  docId: string;
  fileName: string;
  relativePath: string;
  snippet?: string;
}

interface MentionCandidateGroup {
  key: string;
  label: string;
  candidates: AiAssistantMentionCandidate[];
}

interface MentionDropdownData {
  visibleGroups: MentionCandidateGroup[];
  flatCandidates: AiAssistantMentionCandidate[];
  totalCount: number;
  moreCount: number;
}

const MENTION_MAX_VISIBLE = 8;

const mentionSearchTerm = ref('');
const mentionOpen = ref(false);
const mentionQuery = ref('');
const mentionRange = ref<MentionRange | null>(null);
const mentionActiveIndex = ref(0);

const { results: mentionSearchResults, loading: mentionSearchLoading } = useNoteContentSearch({
  searchTerm: mentionSearchTerm,
  notesDirectory,
  limit: 24,
  debounceMs: 180,
});

watch(
  () => notesDirectory.value,
  (dir) => {
    if (!dir) return;
    void loadNotes();
  },
  { immediate: true },
);

const normalizePath = (filePath: string) => (filePath || '').replace(/\\/g, '/');

const fileNameFromPath = (filePath: string) => {
  const normalized = normalizePath(filePath);
  return normalized.split('/').pop() || normalized;
};

const normalizeDocId = (docId: string) => normalizePath(docId).toLowerCase();

const getRelativePath = (filePath: string) => {
  const root = normalizePath(notesDirectory.value || '');
  const normalized = normalizePath(filePath);
  if (!root || !normalized.startsWith(root)) {
    return normalized;
  }
  const relative = normalized.slice(root.length).replace(/^\/+/, '');
  return relative || fileNameFromPath(normalized);
};

const flattenNotes = (noteList: NoteItem[]): NoteItem[] => {
  const result: NoteItem[] = [];
  for (const note of noteList) {
    if (!note.isFolder) {
      result.push(note);
    }
    if (note.children?.length) {
      result.push(...flattenNotes(note.children));
    }
  }
  return result;
};

const allNoteMentionCandidates = computed<AiAssistantMentionCandidate[]>(() => {
  const dedupe = new Set<string>();
  const flatNotes = flattenNotes(notes.value);
  const candidates: AiAssistantMentionCandidate[] = [];

  for (const note of flatNotes) {
    const docId = (note.path || '').trim();
    if (!docId) continue;
    const normalizedDocId = normalizeDocId(docId);
    if (dedupe.has(normalizedDocId)) continue;
    dedupe.add(normalizedDocId);

    candidates.push({
      docId,
      fileName: note.name || fileNameFromPath(docId),
      relativePath: getRelativePath(docId),
    });
  }

  return candidates;
});

const openedTabMentionCandidates = computed<AiAssistantMentionCandidate[]>(() => {
  const dedupe = new Set<string>();
  const candidates: AiAssistantMentionCandidate[] = [];

  for (const tab of openTabs.value) {
    const docId = (tab.path || '').trim();
    if (!docId) continue;
    const normalizedDocId = normalizeDocId(docId);
    if (dedupe.has(normalizedDocId)) continue;
    dedupe.add(normalizedDocId);

    candidates.push({
      docId,
      fileName: tab.name || fileNameFromPath(docId),
      relativePath: getRelativePath(docId),
    });
  }

  return candidates;
});

const resetMentionState = () => {
  mentionOpen.value = false;
  mentionQuery.value = '';
  mentionSearchTerm.value = '';
  mentionRange.value = null;
  mentionActiveIndex.value = 0;
};

const getPromptReferences = (context: PromptInputContext): PromptInputReference[] => {
  const rawReferences = (context as any)?.references;
  if (Array.isArray(rawReferences)) {
    return rawReferences as PromptInputReference[];
  }
  if (rawReferences && Array.isArray(rawReferences.value)) {
    return rawReferences.value as PromptInputReference[];
  }
  return [];
};

const getPromptTextInputValue = (context: PromptInputContext) => {
  const rawTextInput = (context as any)?.textInput;
  if (typeof rawTextInput === 'string') {
    return rawTextInput;
  }
  if (rawTextInput && typeof rawTextInput.value === 'string') {
    return rawTextInput.value;
  }
  return '';
};

const matchMentionCandidate = (candidate: AiAssistantMentionCandidate, query: string) => {
  if (!query) return true;
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return (
    candidate.fileName.toLowerCase().includes(normalizedQuery) ||
    candidate.relativePath.toLowerCase().includes(normalizedQuery) ||
    normalizePath(candidate.docId).toLowerCase().includes(normalizedQuery)
  );
};

const parseMentionRange = (text: string, caretIndex: number): MentionRange | null => {
  const value = text || '';
  const safeCaret = Math.max(0, Math.min(caretIndex, value.length));
  const prefix = value.slice(0, safeCaret);
  const atIndex = prefix.lastIndexOf('@');
  if (atIndex < 0) return null;

  const charBeforeAt = atIndex === 0 ? '' : prefix[atIndex - 1];
  if (charBeforeAt && !/[\s([{,，。；;、]/.test(charBeforeAt)) {
    return null;
  }

  const query = prefix.slice(atIndex + 1);
  if (/\s/.test(query) || query.includes('@')) {
    return null;
  }

  return {
    start: atIndex,
    end: safeCaret,
    query,
  };
};

/**
 * 构建分组的候选列表（无数量限制），返回「当前页面 / 链接到页面 / 搜索结果」分组
 */
const buildMentionGroups = (context: PromptInputContext): MentionCandidateGroup[] => {
  const normalizedQuery = mentionQuery.value.trim().toLowerCase();
  const selectedDocIds = new Set(getPromptReferences(context).map((r) => normalizeDocId(r.docId)));
  const globalDedupe = new Set<string>();
  const groups: MentionCandidateGroup[] = [];

  const filterAndDedupe = (
    candidates: AiAssistantMentionCandidate[],
  ): AiAssistantMentionCandidate[] => {
    return candidates.filter((c) => {
      const id = normalizeDocId(c.docId);
      if (selectedDocIds.has(id) || globalDedupe.has(id)) return false;
      globalDedupe.add(id);
      return true;
    });
  };

  if (normalizedQuery.length === 0) {
    const opened = filterAndDedupe(openedTabMentionCandidates.value);
    if (opened.length > 0) {
      groups.push({
        key: 'current',
        label: t('aiAssistant.references.currentPage'),
        candidates: opened,
      });
    }
    const allNotes = filterAndDedupe(allNoteMentionCandidates.value);
    if (allNotes.length > 0) {
      groups.push({
        key: 'all',
        label: t('aiAssistant.references.linkToPage'),
        candidates: allNotes,
      });
    }
  } else {
    const matchedOpened = filterAndDedupe(
      openedTabMentionCandidates.value.filter((c) => matchMentionCandidate(c, normalizedQuery)),
    );
    const matchedAll = filterAndDedupe(
      allNoteMentionCandidates.value.filter((c) => matchMentionCandidate(c, normalizedQuery)),
    );
    const matchedSearch = filterAndDedupe(
      mentionSearchResults.value
        .filter((hit) => (hit.path || '').trim())
        .map((hit) => ({
          docId: hit.path.trim(),
          fileName: hit.name || fileNameFromPath(hit.path.trim()),
          relativePath: getRelativePath(hit.path.trim()),
          snippet: (hit.snippet || '').trim(),
        })),
    );

    const combined = [...matchedOpened, ...matchedAll, ...matchedSearch];
    if (combined.length > 0) {
      groups.push({
        key: 'search',
        label: t('aiAssistant.references.searchResults'),
        candidates: combined,
      });
    }
  }

  return groups;
};

/**
 * 将分组裁剪到 MENTION_MAX_VISIBLE 条以内，并返回扁平列表、总数、剩余数
 */
const computeMentionDropdownData = (context: PromptInputContext): MentionDropdownData => {
  const allGroups = buildMentionGroups(context);
  const totalCount = allGroups.reduce((sum, g) => sum + g.candidates.length, 0);

  let remaining = MENTION_MAX_VISIBLE;
  const visibleGroups: MentionCandidateGroup[] = [];
  for (const group of allGroups) {
    if (remaining <= 0) break;
    const limited = group.candidates.slice(0, remaining);
    if (limited.length > 0) {
      visibleGroups.push({ ...group, candidates: limited });
      remaining -= limited.length;
    }
  }

  const flatCandidates = visibleGroups.flatMap((g) => g.candidates);
  const moreCount = Math.max(0, totalCount - flatCandidates.length);

  return { visibleGroups, flatCandidates, totalCount, moreCount };
};

/**
 * 计算某个候选项在扁平列表中的全局索引（跨分组）
 */
const getGlobalMentionIndex = (
  groups: MentionCandidateGroup[],
  groupKey: string,
  localIndex: number,
): number => {
  let offset = 0;
  for (const group of groups) {
    if (group.key === groupKey) return offset + localIndex;
    offset += group.candidates.length;
  }
  return -1;
};

const getMentionFileIcon = (candidate: AiAssistantMentionCandidate): string => {
  const ext = (candidate.fileName.split('.').pop() || '').toLowerCase();
  if (['md', 'mdx', 'txt'].includes(ext)) return 'i-lucide-file-text';
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) return 'i-lucide-file-code';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'i-lucide-file-image';
  return 'i-lucide-file-text';
};

const handlePromptCursorChange = (payload: PromptCursorChangePayload) => {
  if (payload.selectionStart !== payload.selectionEnd) {
    resetMentionState();
    return;
  }

  const nextMention = parseMentionRange(payload.value, payload.selectionStart);
  if (!nextMention) {
    resetMentionState();
    return;
  }

  const wasOpen = mentionOpen.value;
  const queryChanged = nextMention.query !== mentionQuery.value;

  mentionOpen.value = true;
  mentionRange.value = nextMention;
  mentionQuery.value = nextMention.query;
  mentionSearchTerm.value = nextMention.query;

  // 仅在菜单首次打开或搜索词变化时重置索引，避免覆盖上下键导航
  if (!wasOpen || queryChanged) {
    mentionActiveIndex.value = 0;
  }

  if (notesDirectory.value && notes.value.length === 0) {
    void loadNotes();
  }
};

const syncMentionFromTextarea = (context: PromptInputContext, target?: EventTarget | null) => {
  if (target instanceof HTMLTextAreaElement) {
    handlePromptCursorChange({
      value: target.value,
      selectionStart: target.selectionStart ?? target.value.length,
      selectionEnd: target.selectionEnd ?? target.value.length,
    });
    return;
  }

  const value = getPromptTextInputValue(context);
  handlePromptCursorChange({
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
  });
};

const selectMentionCandidate = (
  candidate: AiAssistantMentionCandidate,
  context: PromptInputContext,
) => {
  const added = context.addReference({
    docId: candidate.docId,
    fileName: candidate.fileName,
  });
  if (!added) {
    resetMentionState();
    return;
  }

  const currentText = getPromptTextInputValue(context);
  const currentMentionRange = mentionRange.value;
  if (currentMentionRange) {
    const before = currentText.slice(0, currentMentionRange.start);
    const after = currentText.slice(currentMentionRange.end);
    const needsSpace =
      before.length > 0 && after.length > 0 && !/\s$/.test(before) && !/^\s/.test(after);
    context.setTextInput(`${before}${needsSpace ? ' ' : ''}${after}`);
  }

  resetMentionState();
};

const handlePromptKeyDown = (event: KeyboardEvent, context: PromptInputContext) => {
  const shouldSyncMention =
    event.key.length === 1 ||
    event.key === 'Backspace' ||
    event.key === 'Delete' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'Home' ||
    event.key === 'End';

  if (shouldSyncMention) {
    setTimeout(() => {
      syncMentionFromTextarea(context, event.target);
    }, 0);
  }

  if (!mentionOpen.value) return;

  const { flatCandidates: candidates } = computeMentionDropdownData(context);
  if (event.key === 'Escape') {
    event.preventDefault();
    resetMentionState();
    return;
  }

  if (candidates.length === 0) {
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
    }
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    mentionActiveIndex.value = (mentionActiveIndex.value + 1) % candidates.length;
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    mentionActiveIndex.value =
      mentionActiveIndex.value === 0 ? candidates.length - 1 : mentionActiveIndex.value - 1;
    return;
  }

  if (event.key === 'Tab' || event.key === 'Enter') {
    event.preventDefault();
    const candidate = candidates[mentionActiveIndex.value] || candidates[0];
    if (candidate) {
      selectMentionCandidate(candidate, context);
    }
  }
};

const removePromptReference = (referenceId: string, context: PromptInputContext) => {
  context.removeReference(referenceId);
};

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

const getMessageReferences = (message: AiAssistantMessage): PromptInputReference[] => {
  const metadata = (message.metadata || {}) as AiAssistantMessageMeta;
  return Array.isArray(metadata.referencedDocs) ? metadata.referencedDocs : [];
};

const getMessageError = (message: AiAssistantMessage): AiAssistantErrorInfo | null => {
  const metadata = (message.metadata || {}) as AiAssistantMessageMeta;
  const error = metadata.error;
  if (!error || typeof error !== 'object') return null;
  if (typeof error.summary !== 'string' || error.summary.trim().length === 0) return null;
  return error as AiAssistantErrorInfo;
};

const openErrorDetail = (message: AiAssistantMessage) => {
  const messageError = getMessageError(message);
  if (!messageError) return;
  activeErrorDetail.value = messageError;
  errorDetailOpen.value = true;
};

const openLatestErrorDetail = () => {
  if (!latestErrorLog.value) return;
  activeErrorDetail.value = latestErrorLog.value;
  errorDetailOpen.value = true;
};

type AssistantToolApproval = {
  id: string;
  approved?: boolean;
  reason?: string;
};

type AssistantToolPart = DynamicToolUIPart & {
  approval?: AssistantToolApproval;
};

const validToolStates = new Set([
  'input-streaming',
  'input-available',
  'approval-requested',
  'approval-responded',
  'output-available',
  'output-error',
  'output-denied',
]);

const isAssistantToolPart = (part: any): part is AssistantToolPart => {
  return (
    part &&
    typeof part === 'object' &&
    part.type === 'dynamic-tool' &&
    typeof part.toolCallId === 'string' &&
    part.toolCallId.trim().length > 0 &&
    typeof part.toolName === 'string' &&
    part.toolName.trim().length > 0 &&
    typeof part.state === 'string' &&
    validToolStates.has(part.state)
  );
};

const getToolParts = (message: AiAssistantMessage): AssistantToolPart[] => {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const filtered = parts.filter((part) => isAssistantToolPart(part));
  const seen = new Set<string>();
  return filtered.filter((part) => {
    if (seen.has(part.toolCallId)) return false;
    seen.add(part.toolCallId);
    return true;
  });
};

const isToolApprovalPending = (toolPart: AssistantToolPart) =>
  toolPart.state === 'approval-requested' && !!toolPart.approval?.id;

const handleToolApproval = async (toolPart: AssistantToolPart, approved: boolean) => {
  if (!toolPart.approval?.id) return;
  await respondToolApproval({
    approvalId: toolPart.approval.id,
    approved,
    reason: approved ? '用户已批准执行工具' : '用户拒绝执行该工具',
  });
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
  const textStreaming = parts.some(
    (part: any) => part?.type === 'text' && part?.state === 'streaming',
  );

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
  const completedStatus: ChainOfThoughtStepStatus =
    !isStreaming && hasText ? 'complete' : 'pending';

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
    const images =
      assistantImages.length > 0
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
  const localeValue = locale.value === 'en' ? 'en-US' : 'zh-CN';
  return new Intl.DateTimeFormat(localeValue, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const handleSubmit = async (payload: PromptInputMessage) => {
  resetMentionState();
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

    <div
      v-if="chatError"
      class="mx-4 mt-3 rounded-md px-3 py-2 flex items-start justify-between gap-3"
      style="
        background-color: var(--color-error-bg-subtle);
        border: 1px solid var(--color-error-bg);
      "
    >
      <div class="min-w-0">
        <div class="text-xs font-semibold" style="color: var(--color-error)">
          {{ $t('aiAssistant.error.titles.unknown') }}
        </div>
        <div
          class="text-xs mt-0.5 whitespace-pre-wrap wrap-break-word"
          style="color: var(--text-main)"
        >
          {{ chatError }}
        </div>
      </div>

      <UButton
        v-if="latestErrorLog"
        size="xs"
        variant="soft"
        color="neutral"
        icon="i-lucide-file-warning"
        @click="openLatestErrorDetail"
      >
        {{ $t('aiAssistant.error.actions.viewDetail') }}
      </UButton>
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
                  style="background-color: var(--bg-popup); border: 1px solid var(--border-color)"
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
                      <div class="text-[11px] font-medium" style="color: var(--text-mute)">
                        检索结果
                      </div>
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
                      <div class="text-[11px] font-medium" style="color: var(--text-mute)">
                        逐步思考
                      </div>
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
                      <div class="text-[11px] font-medium" style="color: var(--text-mute)">
                        图像
                      </div>
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
                        />
                      </ChainOfThoughtImage>
                    </div>
                  </ChainOfThoughtContent>
                </ChainOfThought>

                <div v-if="getToolParts(message).length > 0" class="mb-2 space-y-2">
                  <Tool
                    v-for="toolPart in getToolParts(message)"
                    :key="`${message.id}-${toolPart.toolCallId}`"
                    :default-open="true"
                  >
                    <ToolHeader
                      type="dynamic-tool"
                      :state="toolPart.state"
                      :tool-name="toolPart.toolName"
                    />

                    <ToolContent>
                      <ToolInput :input="toolPart.input" />

                      <Confirmation
                        v-if="toolPart.approval"
                        :approval="toolPart.approval"
                        :state="toolPart.state"
                        class="mx-4 mb-4"
                      >
                        <ConfirmationTitle>该工具将修改笔记内容，是否允许执行？</ConfirmationTitle>

                        <ConfirmationRequest>
                          <ConfirmationActions>
                            <ConfirmationAction
                              :disabled="!isToolApprovalPending(toolPart)"
                              @click="handleToolApproval(toolPart, true)"
                            >
                              批准
                            </ConfirmationAction>
                            <ConfirmationAction
                              variant="outline"
                              :disabled="!isToolApprovalPending(toolPart)"
                              @click="handleToolApproval(toolPart, false)"
                            >
                              拒绝
                            </ConfirmationAction>
                          </ConfirmationActions>
                        </ConfirmationRequest>

                        <ConfirmationAccepted>
                          <div class="text-xs">
                            审批通过{{
                              toolPart.approval?.reason ? `：${toolPart.approval?.reason}` : ''
                            }}
                          </div>
                        </ConfirmationAccepted>

                        <ConfirmationRejected>
                          <div class="text-xs">
                            审批拒绝{{
                              toolPart.approval?.reason ? `：${toolPart.approval?.reason}` : ''
                            }}
                          </div>
                        </ConfirmationRejected>
                      </Confirmation>

                      <ToolOutput :output="toolPart.output" :error-text="toolPart.errorText" />
                    </ToolContent>
                  </Tool>
                </div>

                <MessageResponse :content="getMessageText(message)" />

                <AiAssistantErrorNotice
                  v-if="getMessageError(message)"
                  :error="getMessageError(message)"
                  @view-detail="openErrorDetail(message)"
                />

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
                        background-color: var(--bg-popup);
                        border: 1px solid var(--border-color);
                      "
                    >
                      <div class="text-xs font-medium" style="color: var(--text-main)">
                        {{ source.fileName }}
                      </div>
                      <div
                        class="text-[11px] mt-1 whitespace-pre-wrap"
                        style="color: var(--text-mute)"
                      >
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
                <div class="whitespace-pre-wrap wrap-break-word">
                  {{ getMessageText(message) }}
                </div>
                <div
                  v-if="getMessageReferences(message).length > 0"
                  class="mt-2 flex flex-wrap gap-1.5"
                >
                  <span
                    v-for="reference in getMessageReferences(message)"
                    :key="reference.id"
                    class="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
                    style="
                      background-color: var(--bg-popup);
                      border: 1px solid var(--border-color);
                      color: var(--text-mute);
                    "
                  >
                    @{{ reference.fileName }}
                  </span>
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
        v-slot="{ context }"
        :max-files="4"
        accept="image/*"
        :global-drop="true"
        class="w-full"
        @submit="handleSubmit"
      >
        <div
          v-if="getPromptReferences(context).length > 0"
          class="flex flex-wrap items-center gap-2 px-3 pt-3 pb-1"
        >
          <button
            v-for="reference in getPromptReferences(context)"
            :key="reference.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
            style="
              background-color: var(--bg-popup);
              border: 1px solid var(--border-color);
              color: var(--text-main);
            "
            :title="reference.docId"
            @click.prevent="removePromptReference(reference.id, context)"
          >
            <span class="truncate max-w-[200px]">@{{ reference.fileName }}</span>
            <UIcon name="i-lucide-x" class="w-3 h-3" />
          </button>
        </div>

        <PromptInputAttachments>
          <template #default="{ file }">
            <PromptInputAttachment :file="file" />
          </template>
        </PromptInputAttachments>

        <PromptInputBody>
          <PromptInputTextarea
            :placeholder="t('aiAssistant.references.placeholder')"
            :disabled="!resolved.isConfigured || isBusy"
            @cursor-change="handlePromptCursorChange"
            @keydown="(event) => handlePromptKeyDown(event, context)"
            @blur="resetMentionState"
          />
        </PromptInputBody>

        <div
          v-if="mentionOpen"
          class="absolute inset-x-0 bottom-full z-50 mb-1 rounded-lg shadow-lg"
          style="background-color: var(--bg-sidebar); border: 1px solid var(--border-color)"
          @mousedown.prevent
        >
          <template v-for="md in [computeMentionDropdownData(context)]" :key="'mention'">
            <div v-if="md.totalCount > 0" class="max-h-72 overflow-y-auto py-1">
              <template v-for="group in md.visibleGroups" :key="group.key">
                <div
                  class="px-3.5 pt-3 pb-1.5 text-[11px] font-medium first:pt-1.5"
                  style="color: var(--text-mute)"
                >
                  {{ group.label }}
                </div>
                <div
                  v-for="(candidate, localIdx) in group.candidates"
                  :key="candidate.docId"
                  class="mx-1 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 cursor-pointer transition-colors"
                  :style="{
                    backgroundColor:
                      getGlobalMentionIndex(md.visibleGroups, group.key, localIdx) ===
                      mentionActiveIndex
                        ? 'var(--bg-popup)'
                        : 'transparent',
                  }"
                  @click.prevent="selectMentionCandidate(candidate, context)"
                  @pointerenter="
                    mentionActiveIndex = getGlobalMentionIndex(
                      md.visibleGroups,
                      group.key,
                      localIdx,
                    )
                  "
                >
                  <UIcon
                    :name="getMentionFileIcon(candidate)"
                    class="w-5 h-5 shrink-0 rounded"
                    style="color: var(--text-mute)"
                  />
                  <span class="truncate text-sm" style="color: var(--text-main)">
                    {{ candidate.fileName }}
                  </span>
                </div>
              </template>

              <div
                v-if="md.moreCount > 0"
                class="mx-1 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[11px]"
                style="color: var(--text-mute)"
              >
                <span class="w-5 text-center tracking-widest">···</span>
                <span>{{ t('aiAssistant.references.moreResults', { count: md.moreCount }) }}</span>
              </div>
            </div>

            <div v-else class="px-3.5 py-3 text-xs" style="color: var(--text-mute)">
              {{
                mentionSearchLoading
                  ? t('aiAssistant.references.searching')
                  : t('aiAssistant.references.noResults')
              }}
            </div>
          </template>
        </div>

        <PromptInputFooter>
          <div class="flex items-center gap-2">
            <AiAssistantChatModelPicker :disabled="isBusy" />
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
                          <span class="text-sm truncate" style="color: var(--text-main)">
                            {{ session.title }}
                          </span>
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

    <UModal v-model:open="errorDetailOpen">
      <template #content>
        <div class="p-4 w-[760px] max-w-[96vw]">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-semibold leading-5" style="color: var(--text-main)">
                {{ activeErrorDetail?.title || $t('aiAssistant.error.detailModal.title') }}
              </h3>
              <p
                class="text-xs mt-1 leading-5 whitespace-pre-wrap wrap-break-word"
                style="color: var(--text-mute)"
              >
                {{ activeErrorDetail?.summary || $t('aiAssistant.error.detailModal.empty') }}
              </p>
            </div>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              @click="errorDetailOpen = false"
            />
          </div>

          <div
            class="mt-3 rounded-md p-3 max-h-[58vh] overflow-auto whitespace-pre-wrap wrap-break-word text-xs leading-5 font-mono"
            style="
              background-color: var(--bg-popup);
              border: 1px solid var(--border-color);
              color: var(--text-main);
            "
          >
            {{ activeErrorDetail?.detail || $t('aiAssistant.error.detailModal.empty') }}
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
