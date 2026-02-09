import type { ChatStatus, FileUIPart, UIMessage } from 'ai';

import { nanoid } from 'nanoid';

import type { AiAssistantMessage, AiAssistantMessageMeta, AiAssistantSession } from '~/types/ai-assistant';
import { normalizeAiError } from '~/utils/ai/normalizeAiError';

import {
  buildSessionTitleFromFirstMessage,
  createEmptySession,
  useAiAssistantHistory,
} from './useAiAssistantHistory';
import { useAiAssistantRag } from './useAiAssistantRag';
import { useAiRoleModel } from './useAiRoleModel';

function nowIso() {
  return new Date().toISOString();
}

function sortSessionsByUpdatedAt(sessions: AiAssistantSession[]) {
  return [...sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function useAiAssistantChat() {
  const { aiApiKey, aiBaseUrl, modelId, resolved } = useAiRoleModel('chat');
  const { searchNotes } = useAiAssistantRag();
  const { loadState, scheduleSave, flushSave, groupSessionsByDate } = useAiAssistantHistory();

  const sessions = useState<AiAssistantSession[]>('ai-assistant:sessions', () => []);
  const activeSessionId = useState<string | null>('ai-assistant:active-session-id', () => null);

  const status = useState<ChatStatus>('ai-assistant:status', () => 'ready');
  const error = useState<string | null>('ai-assistant:error', () => null);

  const historyReady = useState<boolean>('ai-assistant:history-ready', () => false);
  const historyLoading = useState<boolean>('ai-assistant:history-loading', () => false);

  const activeStreamId = ref<string | null>(null);
  const activeAssistantId = ref<string | null>(null);
  const activeText = ref('');
  const activeStreamSessionId = ref<string | null>(null);

  const listenersReady = ref(false);

  const activeSession = computed(() => {
    if (!activeSessionId.value) return null;
    return sessions.value.find((session) => session.id === activeSessionId.value) || null;
  });

  const activeSessionTitle = computed(() => activeSession.value?.title || '新会话');
  const sessionCount = computed(() => sessions.value.length);
  const groupedSessions = computed(() => groupSessionsByDate(sessions.value));
  const isBusy = computed(() => status.value === 'submitted' || status.value === 'streaming');

  const messages = computed<AiAssistantMessage[]>(() => activeSession.value?.messages || []);

  const getSessionById = (sessionId: string | null) => {
    if (!sessionId) return null;
    return sessions.value.find((session) => session.id === sessionId) || null;
  };

  const updateSessionById = (
    sessionId: string,
    updater: (session: AiAssistantSession) => AiAssistantSession,
  ) => {
    const index = sessions.value.findIndex((session) => session.id === sessionId);
    if (index < 0) return false;

    const current = sessions.value[index];
    if (!current) return false;
    const next = updater(current);

    const nextSessions = [...sessions.value];
    nextSessions[index] = next;
    sessions.value = sortSessionsByUpdatedAt(nextSessions);

    return true;
  };

  const resetActiveStreamState = () => {
    activeStreamId.value = null;
    activeAssistantId.value = null;
    activeText.value = '';
    activeStreamSessionId.value = null;
  };

  const ensureActiveSession = () => {
    const current = getSessionById(activeSessionId.value);
    if (current) return current;

    const session = createEmptySession();
    sessions.value = sortSessionsByUpdatedAt([session, ...sessions.value]);
    activeSessionId.value = session.id;
    return session;
  };

  const initializeHistory = async () => {
    if (historyReady.value || historyLoading.value) return;

    historyLoading.value = true;
    try {
      const state = await loadState();
      sessions.value = sortSessionsByUpdatedAt(state.sessions);
      activeSessionId.value = state.activeSessionId;

      if (sessions.value.length === 0) {
        const created = createEmptySession();
        sessions.value = [created];
        activeSessionId.value = created.id;
      }

      if (!getSessionById(activeSessionId.value)) {
        activeSessionId.value = sessions.value[0]?.id || null;
      }
    } finally {
      historyLoading.value = false;
      historyReady.value = true;
    }
  };

  const updateAssistantMessage = (
    sessionId: string,
    assistantId: string,
    updater: (message: AiAssistantMessage) => AiAssistantMessage,
  ) => {
    updateSessionById(sessionId, (session) => {
      const index = session.messages.findIndex((message) => message.id === assistantId);
      if (index < 0) return session;

      const current = session.messages[index];
      if (!current || current.role !== 'assistant') return session;

      const nextMessages = [...session.messages];
      nextMessages[index] = updater(current);

      return {
        ...session,
        messages: nextMessages,
        updatedAt: nowIso(),
      };
    });
  };

  const setAssistantMeta = (
    sessionId: string,
    assistantId: string,
    patch: Partial<AiAssistantMessageMeta>,
  ) => {
    updateAssistantMessage(sessionId, assistantId, (current) => {
      const currentMeta = (current.metadata || { createdAt: nowIso() }) as AiAssistantMessageMeta;
      return {
        ...current,
        metadata: {
          ...currentMeta,
          ...patch,
          createdAt: currentMeta.createdAt || nowIso(),
        },
      };
    });
  };

  const setAssistantText = (
    sessionId: string,
    assistantId: string,
    nextText: string,
    state: 'streaming' | 'done' = 'streaming',
  ) => {
    updateAssistantMessage(sessionId, assistantId, (current) => {
      const parts = Array.isArray(current.parts) ? [...current.parts] : [];
      const textIndex = parts.findIndex((part: any) => part?.type === 'text');

      if (textIndex >= 0) {
        const prev = parts[textIndex] as any;
        parts[textIndex] = {
          ...prev,
          text: nextText,
          state,
        };
      } else {
        parts.push({
          type: 'text',
          text: nextText,
          state,
        } as any);
      }

      return {
        ...current,
        parts,
      } as AiAssistantMessage;
    });
  };

  const setReasoningState = (
    sessionId: string,
    assistantId: string,
    reasoningId: string,
    patch: { append?: string; state?: 'streaming' | 'done' },
  ) => {
    updateAssistantMessage(sessionId, assistantId, (current) => {
      const parts = Array.isArray(current.parts) ? [...current.parts] : [];
      const reasoningIndex = parts.findIndex(
        (part: any) => part?.type === 'reasoning' && part?.reasoningId === reasoningId,
      );

      if (reasoningIndex < 0) {
        parts.unshift({
          type: 'reasoning',
          reasoningId,
          text: patch.append || '',
          state: patch.state || 'streaming',
        } as any);
      } else {
        const prev = parts[reasoningIndex] as any;
        parts[reasoningIndex] = {
          ...prev,
          text: `${prev.text || ''}${patch.append || ''}`,
          state: patch.state || prev.state || 'streaming',
        };
      }

      return {
        ...current,
        parts,
      } as AiAssistantMessage;
    });
  };

  const markAssistantPartsDone = (sessionId: string, assistantId: string) => {
    updateAssistantMessage(sessionId, assistantId, (current) => {
      const parts = Array.isArray(current.parts) ? [...current.parts] : [];
      const nextParts = parts.map((part: any) => {
        if (part?.type === 'text' || part?.type === 'reasoning') {
          return {
            ...part,
            state: 'done',
          };
        }
        return part;
      });

      return {
        ...current,
        parts: nextParts,
      } as AiAssistantMessage;
    });
  };

  const applyAssistantError = (sessionId: string, assistantId: string, rawError: unknown) => {
    const normalizedError = normalizeAiError(rawError);
    error.value = normalizedError;
    status.value = 'error';

    setAssistantText(sessionId, assistantId, normalizedError, 'done');
    markAssistantPartsDone(sessionId, assistantId);
  };

  const toIpcSafeMessages = (input: Array<Omit<UIMessage, 'id'>>) => {
    return input.map((message) => {
      const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
      const safeParts = parts
        .map((part: any) => {
          if (!part || typeof part !== 'object') return undefined;

          if (part.type === 'text') {
            return {
              type: 'text' as const,
              text: (part.text || '').toString(),
              state: part.state,
            };
          }

          if (part.type === 'file') {
            return {
              type: 'file' as const,
              url: (part.url || '').toString(),
              mediaType: (part.mediaType || '').toString(),
              filename: part.filename ? part.filename.toString() : undefined,
            };
          }

          return undefined;
        })
        .filter(Boolean);

      return {
        role: (message as any).role,
        parts: safeParts,
      };
    });
  };

  const onDelta = (_event: unknown, payload: { streamId: string; delta: string }) => {
    if (!payload?.streamId || payload.streamId !== activeStreamId.value) return;

    const sessionId = activeStreamSessionId.value;
    const assistantId = activeAssistantId.value;
    if (!sessionId || !assistantId) return;

    activeText.value += payload.delta || '';
    setAssistantText(sessionId, assistantId, activeText.value, 'streaming');
  };

  const onReasoningStart = (_event: unknown, payload: { streamId: string; id: string }) => {
    if (!payload?.streamId || payload.streamId !== activeStreamId.value || !payload?.id) return;

    const sessionId = activeStreamSessionId.value;
    const assistantId = activeAssistantId.value;
    if (!sessionId || !assistantId) return;

    setReasoningState(sessionId, assistantId, payload.id, { state: 'streaming' });
  };

  const onReasoningDelta = (
    _event: unknown,
    payload: { streamId: string; id: string; delta: string },
  ) => {
    if (!payload?.streamId || payload.streamId !== activeStreamId.value || !payload?.id) return;

    const sessionId = activeStreamSessionId.value;
    const assistantId = activeAssistantId.value;
    if (!sessionId || !assistantId) return;

    setReasoningState(sessionId, assistantId, payload.id, {
      append: payload.delta || '',
      state: 'streaming',
    });
  };

  const onReasoningEnd = (_event: unknown, payload: { streamId: string; id: string }) => {
    if (!payload?.streamId || payload.streamId !== activeStreamId.value || !payload?.id) return;

    const sessionId = activeStreamSessionId.value;
    const assistantId = activeAssistantId.value;
    if (!sessionId || !assistantId) return;

    setReasoningState(sessionId, assistantId, payload.id, { state: 'done' });
  };

  const onEnd = async (_event: unknown, payload: { streamId: string }) => {
    if (!payload?.streamId || payload.streamId !== activeStreamId.value) return;

    const sessionId = activeStreamSessionId.value;
    const assistantId = activeAssistantId.value;

    if (sessionId && assistantId) {
      setAssistantText(sessionId, assistantId, activeText.value, 'done');
      markAssistantPartsDone(sessionId, assistantId);
    }

    resetActiveStreamState();
    status.value = 'ready';

    await flushSave({
      sessions: sessions.value,
      activeSessionId: activeSessionId.value,
    });
  };

  const onError = async (_event: unknown, payload: { streamId: string; message: string }) => {
    if (!payload?.streamId || payload.streamId !== activeStreamId.value) return;

    const sessionId = activeStreamSessionId.value;
    const assistantId = activeAssistantId.value;

    if (sessionId && assistantId) {
      applyAssistantError(sessionId, assistantId, payload.message || '请求失败');
    } else {
      error.value = normalizeAiError(payload.message || '请求失败');
      status.value = 'error';
    }

    resetActiveStreamState();

    await flushSave({
      sessions: sessions.value,
      activeSessionId: activeSessionId.value,
    });
  };

  const ensureListeners = () => {
    if (listenersReady.value) return;
    if (!window.ipcRenderer) return;

    window.ipcRenderer.on('ai:chat-stream-delta', onDelta as any);
    window.ipcRenderer.on('ai:chat-stream-reasoning-start', onReasoningStart as any);
    window.ipcRenderer.on('ai:chat-stream-reasoning-delta', onReasoningDelta as any);
    window.ipcRenderer.on('ai:chat-stream-reasoning-end', onReasoningEnd as any);
    window.ipcRenderer.on('ai:chat-stream-end', onEnd as any);
    window.ipcRenderer.on('ai:chat-stream-error', onError as any);

    listenersReady.value = true;
  };

  const createSession = async () => {
    await initializeHistory();
    if (isBusy.value) return;

    const session = createEmptySession();
    sessions.value = sortSessionsByUpdatedAt([session, ...sessions.value]);
    activeSessionId.value = session.id;
    status.value = 'ready';
    error.value = null;

    await flushSave({
      sessions: sessions.value,
      activeSessionId: activeSessionId.value,
    });
  };

  const switchSession = async (sessionId: string) => {
    await initializeHistory();
    if (isBusy.value) return;

    if (!sessions.value.some((session) => session.id === sessionId)) return;
    activeSessionId.value = sessionId;
    error.value = null;
  };

  const deleteSession = async (sessionId: string) => {
    await initializeHistory();
    if (isBusy.value) return;

    const exists = sessions.value.some((session) => session.id === sessionId);
    if (!exists) return;

    const rest = sessions.value.filter((session) => session.id !== sessionId);

    if (rest.length === 0) {
      const fallback = createEmptySession();
      sessions.value = [fallback];
      activeSessionId.value = fallback.id;
      status.value = 'ready';
      error.value = null;
    } else {
      sessions.value = sortSessionsByUpdatedAt(rest);

      if (activeSessionId.value === sessionId) {
        activeSessionId.value = sessions.value[0]?.id || null;
      }
    }

    await flushSave({
      sessions: sessions.value,
      activeSessionId: activeSessionId.value,
    });
  };

  const abort = () => {
    const streamId = activeStreamId.value;
    if (!streamId) return;

    if (window.ipcRenderer) {
      void window.ipcRenderer.invoke('ai:chat-stream-abort', { streamId });
    }

    const sessionId = activeStreamSessionId.value;
    const assistantId = activeAssistantId.value;

    if (sessionId && assistantId) {
      markAssistantPartsDone(sessionId, assistantId);
      setAssistantText(sessionId, assistantId, activeText.value, 'done');
    }

    resetActiveStreamState();
    status.value = 'ready';

    void flushSave({
      sessions: sessions.value,
      activeSessionId: activeSessionId.value,
    });
  };

  const clear = async () => {
    await initializeHistory();
    if (isBusy.value) return;

    const current = ensureActiveSession();

    updateSessionById(current.id, (session) => ({
      ...session,
      title: '新会话',
      messages: [],
      updatedAt: nowIso(),
    }));

    status.value = 'ready';
    error.value = null;

    await flushSave({
      sessions: sessions.value,
      activeSessionId: activeSessionId.value,
    });
  };

  const createUserMessage = (text: string, files: FileUIPart[] = []): AiAssistantMessage => {
    const createdAt = nowIso();

    return {
      id: nanoid(),
      role: 'user',
      parts: [
        ...(text ? ([{ type: 'text', text }] as any[]) : []),
        ...(files.map((file) => ({
          type: 'file' as const,
          url: (file as any).url,
          mediaType: (file as any).mediaType,
          filename: (file as any).filename,
        })) as any[]),
      ],
      metadata: {
        createdAt,
      },
    } as AiAssistantMessage;
  };

  const createAssistantMessage = (): AiAssistantMessage => {
    const createdAt = nowIso();

    return {
      id: nanoid(),
      role: 'assistant',
      parts: [{ type: 'text', text: '', state: 'streaming' } as any],
      metadata: {
        createdAt,
      },
    } as AiAssistantMessage;
  };

  const composeSystemPrompt = (ragContext: string) => {
    const basePrompt =
      '你是 Xin-Note 的写作与笔记助手。回答要简洁、结构清晰，并尽量给出可执行建议。' +
      '当用户在续写时，优先保持原文语气与风格。';

    if (!ragContext) {
      return basePrompt;
    }

    return (
      `${basePrompt}\n\n` +
      '以下是从用户笔记中检索到的参考片段。请优先基于这些内容回答，避免捏造。\n\n' +
      ragContext
    );
  };

  const sendMessage = async (payload: { text: string; files?: FileUIPart[] }) => {
    await initializeHistory();

    const text = (payload.text || '').trim();
    const files = payload.files || [];

    if (!text && files.length === 0) return;
    if (isBusy.value) return;

    ensureListeners();

    const session = ensureActiveSession();
    const sessionId = session.id;
    const hasUserMessage = session.messages.some((message) => message.role === 'user');

    const userMessage = createUserMessage(text, files);
    const assistantMessage = createAssistantMessage();
    const assistantId = assistantMessage.id;

    updateSessionById(sessionId, (current) => ({
      ...current,
      title: hasUserMessage
        ? current.title
        : buildSessionTitleFromFirstMessage(text, files.length > 0 ? '图片对话' : '新会话'),
      messages: [...current.messages, userMessage, assistantMessage],
      updatedAt: nowIso(),
    }));

    activeSessionId.value = sessionId;
    error.value = null;

    if (!resolved.value.isConfigured || !modelId.value) {
      applyAssistantError(
        sessionId,
        assistantId,
        resolved.value.warnings[0] || '请先在设置中配置 API Key、Base URL，并启用/选择聊天模型。',
      );
      await flushSave({ sessions: sessions.value, activeSessionId: activeSessionId.value });
      return;
    }

    if (!window.ipcRenderer) {
      applyAssistantError(sessionId, assistantId, '当前环境缺少 ipcRenderer，无法调用 AI。');
      await flushSave({ sessions: sessions.value, activeSessionId: activeSessionId.value });
      return;
    }

    status.value = 'submitted';

    try {
      const ragResult = await searchNotes(text);
      setAssistantMeta(sessionId, assistantId, {
        ragSources: ragResult.sources.length > 0 ? ragResult.sources : undefined,
        ragWarning: ragResult.warning,
      });

      const currentSession = getSessionById(sessionId);
      const historyMessages = currentSession?.messages || [];

      const history = historyMessages.slice(0, -1).map(({ id, ...rest }) => rest);
      const historyForIpc = toIpcSafeMessages(history as Array<Omit<UIMessage, 'id'>>);

      activeStreamSessionId.value = sessionId;
      activeAssistantId.value = assistantId;
      activeText.value = '';

      status.value = 'streaming';

      const result = (await window.ipcRenderer.invoke('ai:chat-stream-start', {
        settings: {
          apiKey: aiApiKey.value,
          baseURL: aiBaseUrl.value,
          model: modelId.value,
        },
        messages: historyForIpc,
        system: composeSystemPrompt(ragResult.contextText),
      })) as { streamId?: string } | null;

      if (!result?.streamId) {
        throw new Error('启动流式请求失败：未返回 streamId');
      }

      activeStreamId.value = result.streamId;
    } catch (streamError) {
      applyAssistantError(sessionId, assistantId, streamError);
      resetActiveStreamState();

      await flushSave({
        sessions: sessions.value,
        activeSessionId: activeSessionId.value,
      });
    }
  };

  watch(
    [sessions, activeSessionId],
    ([nextSessions, nextActiveSessionId]) => {
      if (!historyReady.value) return;

      scheduleSave({
        sessions: nextSessions,
        activeSessionId: nextActiveSessionId,
      });
    },
    { deep: true },
  );

  onMounted(() => {
    void initializeHistory();
  });

  onBeforeUnmount(() => {
    if (window.ipcRenderer && listenersReady.value) {
      window.ipcRenderer.off('ai:chat-stream-delta', onDelta as any);
      window.ipcRenderer.off('ai:chat-stream-reasoning-start', onReasoningStart as any);
      window.ipcRenderer.off('ai:chat-stream-reasoning-delta', onReasoningDelta as any);
      window.ipcRenderer.off('ai:chat-stream-reasoning-end', onReasoningEnd as any);
      window.ipcRenderer.off('ai:chat-stream-end', onEnd as any);
      window.ipcRenderer.off('ai:chat-stream-error', onError as any);
      listenersReady.value = false;
    }

    if (historyReady.value) {
      void flushSave({
        sessions: sessions.value,
        activeSessionId: activeSessionId.value,
      });
    }
  });

  return {
    resolved,
    sessions,
    groupedSessions,
    sessionCount,
    activeSessionId,
    activeSessionTitle,
    messages,
    status,
    error,
    isBusy,
    sendMessage,
    abort,
    clear,
    createSession,
    switchSession,
    deleteSession,
  };
}
