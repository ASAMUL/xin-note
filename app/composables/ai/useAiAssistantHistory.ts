import type { UIMessage } from 'ai';

import type {
  AiAssistantMessage,
  AiAssistantMessageMeta,
  AiAssistantRagSource,
  AiAssistantSession,
  AiAssistantSessionGroup,
  AiAssistantSessionGroupKey,
} from '~/types/ai-assistant';
import { toJsonSafeValue } from '~/utils/serialization/ipcSafe';

const HISTORY_FILE_NAME = 'ai-assistant-history.json';
const HISTORY_VERSION = 2;
const SAVE_DEBOUNCE_MS = 500;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SESSION_TITLE = '新会话';

interface PersistedHistoryStore {
  version: number;
  updatedAt: string;
  activeSessionId: string | null;
  sessions: PersistedSession[];
}

type PersistedMessagePart =
  | {
      type: 'text' | 'reasoning';
      text: string;
      state?: 'streaming' | 'done';
    }
  | {
      type: 'file';
      url: string;
      mediaType: string;
      filename?: string;
    }
  | {
      type: 'dynamic-tool';
      toolName: string;
      toolCallId: string;
      input: Record<string, any>;
      output?: unknown;
      errorText?: string;
      state?:
        | 'input-streaming'
        | 'input-available'
        | 'approval-requested'
        | 'approval-responded'
        | 'output-available'
        | 'output-error'
        | 'output-denied';
      approval?: {
        id: string;
        approved?: boolean;
        reason?: string;
      };
    };

interface PersistedMessage {
  id: string;
  role: UIMessage['role'];
  parts: PersistedMessagePart[];
  metadata?: Partial<AiAssistantMessageMeta>;
}

interface PersistedSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: PersistedMessage[];
}

interface PersistedLegacyHistory {
  version?: number;
  updatedAt?: string;
  messages?: PersistedMessage[];
}

export interface AiAssistantHistoryState {
  sessions: AiAssistantSession[];
  activeSessionId: string | null;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDateString(value: unknown) {
  const raw = typeof value === 'string' ? value : '';
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    return new Date().toISOString();
  }
  return new Date(ms).toISOString();
}

function normalizeSessionTitle(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || DEFAULT_SESSION_TITLE;
}

function sanitizeSources(raw: unknown): AiAssistantRagSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const sources = raw
    .map((item) => {
      const docId = typeof item?.docId === 'string' ? item.docId : '';
      const fileName = typeof item?.fileName === 'string' ? item.fileName : '';
      const snippet = typeof item?.snippet === 'string' ? item.snippet : '';
      const chunkId = typeof item?.chunkId === 'string' ? item.chunkId : '';
      if (!docId || !fileName) return null;
      return {
        docId,
        fileName,
        snippet,
        chunkId,
      } satisfies AiAssistantRagSource;
    })
    .filter((item): item is AiAssistantRagSource => !!item);

  return sources.length > 0 ? sources : undefined;
}

function sanitizeMessageParts(raw: unknown): PersistedMessagePart[] {
  if (!Array.isArray(raw)) return [];

  const parsed = raw
    .map<PersistedMessagePart | null>((part) => {
      if (!part || typeof part !== 'object') return null;
      const item = part as any;

      if (item.type === 'text' || item.type === 'reasoning') {
        return {
          type: item.type,
          text: (item.text || '').toString(),
          state:
            item.state === 'streaming' ? 'streaming' : item.state === 'done' ? 'done' : undefined,
        } satisfies PersistedMessagePart;
      }

      if (item.type === 'file') {
        return {
          type: 'file',
          url: (item.url || '').toString(),
          mediaType: (item.mediaType || '').toString(),
          filename: item.filename ? item.filename.toString() : undefined,
        } satisfies PersistedMessagePart;
      }

      if (item.type === 'dynamic-tool') {
        const toolName = (item.toolName || '').toString().trim();
        const toolCallId = (item.toolCallId || '').toString().trim();
        if (!toolName || !toolCallId) {
          return null;
        }

        const toolStates = [
          'input-streaming',
          'input-available',
          'approval-requested',
          'approval-responded',
          'output-available',
          'output-error',
          'output-denied',
        ] as const;

        const state = (
          toolStates
        ).includes(item.state as any)
          ? (item.state as (typeof toolStates)[number])
          : 'input-available';

        const approval =
          item.approval && typeof item.approval === 'object' && typeof item.approval.id === 'string'
            ? {
                id: item.approval.id,
                approved:
                  typeof item.approval.approved === 'boolean'
                    ? item.approval.approved
                    : undefined,
                reason: typeof item.approval.reason === 'string' ? item.approval.reason : undefined,
              }
            : undefined;

        const safeInput = toJsonSafeValue(item.input ?? {});
        const safeOutput = toJsonSafeValue(item.output);

        return {
          type: 'dynamic-tool',
          toolName,
          toolCallId,
          input:
            safeInput && typeof safeInput === 'object' && !Array.isArray(safeInput)
              ? (safeInput as Record<string, any>)
              : {},
          output: safeOutput,
          errorText:
            typeof item.errorText === 'string' && item.errorText.trim().length > 0
              ? item.errorText
              : undefined,
          state,
          approval,
        } satisfies PersistedMessagePart;
      }

      return null;
    })
    .filter((part): part is PersistedMessagePart => part !== null);

  // 同一条消息里 dynamic-tool 的 toolCallId 视为唯一键，避免重复 key 触发渲染异常。
  const seenToolCallIds = new Set<string>();
  const deduped: PersistedMessagePart[] = [];
  for (const part of parsed) {
    if (part.type !== 'dynamic-tool') {
      deduped.push(part);
      continue;
    }
    if (seenToolCallIds.has(part.toolCallId)) continue;
    seenToolCallIds.add(part.toolCallId);
    deduped.push(part);
  }
  return deduped;
}

function normalizeMessage(raw: unknown): AiAssistantMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as any;

  const role = item.role;
  if (role !== 'system' && role !== 'user' && role !== 'assistant') {
    return null;
  }

  const parts = sanitizeMessageParts(item.parts);
  if (parts.length === 0) {
    return null;
  }

  const meta = item.metadata as Partial<AiAssistantMessageMeta> | undefined;

  const metadata: AiAssistantMessageMeta = {
    createdAt: normalizeDateString(meta?.createdAt),
    ragSources: sanitizeSources(meta?.ragSources),
    ragWarning:
      typeof meta?.ragWarning === 'string' && meta.ragWarning.trim().length > 0
        ? meta.ragWarning.trim()
        : undefined,
  };

  return {
    id: typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : createId('msg'),
    role,
    parts: parts as any,
    metadata,
  } as AiAssistantMessage;
}

function getTextFromMessage(message: AiAssistantMessage) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter((part: any) => part?.type === 'text')
    .map((part: any) => (part.text || '').toString())
    .join('')
    .trim();
}

export function buildSessionTitleFromFirstMessage(text: string, fallback = DEFAULT_SESSION_TITLE) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
}

function inferSessionTitle(messages: AiAssistantMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) return DEFAULT_SESSION_TITLE;

  return buildSessionTitleFromFirstMessage(getTextFromMessage(firstUserMessage), DEFAULT_SESSION_TITLE);
}

export function createEmptySession(seed?: Partial<AiAssistantSession>): AiAssistantSession {
  const now = new Date().toISOString();
  return {
    id: typeof seed?.id === 'string' && seed.id.trim().length > 0 ? seed.id : createId('session'),
    title: normalizeSessionTitle(seed?.title),
    createdAt: normalizeDateString(seed?.createdAt || now),
    updatedAt: normalizeDateString(seed?.updatedAt || now),
    messages: Array.isArray(seed?.messages) ? seed.messages : [],
  };
}

function normalizeSession(raw: unknown): AiAssistantSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as any;

  const messagesRaw: unknown[] = Array.isArray(item.messages) ? item.messages : [];
  const messages = messagesRaw
    .map((message) => normalizeMessage(message))
    .filter((message): message is AiAssistantMessage => !!message);

  const messageIdSet = new Set<string>();
  const normalizedMessages = messages.map((message, index) => {
    const baseId = (message.id || '').toString().trim() || createId('msg');
    let nextId = baseId;
    if (messageIdSet.has(nextId)) {
      let suffix = 1;
      while (messageIdSet.has(`${baseId}-${suffix}`)) suffix += 1;
      nextId = `${baseId}-${suffix}`;
    }
    messageIdSet.add(nextId);
    if (nextId === message.id) return message;
    return {
      ...message,
      id: nextId || `msg-${index}`,
    };
  });

  const createdAt = normalizeDateString(item.createdAt);
  const updatedAt = normalizeDateString(item.updatedAt || createdAt);

  return {
    id: typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : createId('session'),
    title: normalizeSessionTitle(item.title || inferSessionTitle(messages)),
    createdAt,
    updatedAt,
    messages: normalizedMessages,
  };
}

function toPersistedMessage(message: AiAssistantMessage): PersistedMessage {
  const metadata = (message.metadata || {}) as AiAssistantMessageMeta;

  return {
    id: typeof message.id === 'string' && message.id.trim().length > 0 ? message.id : createId('msg'),
    role: message.role,
    parts: sanitizeMessageParts(message.parts),
    metadata: {
      createdAt: normalizeDateString(metadata.createdAt),
      ragSources: sanitizeSources(metadata.ragSources),
      ragWarning:
        typeof metadata.ragWarning === 'string' && metadata.ragWarning.trim().length > 0
          ? metadata.ragWarning.trim()
          : undefined,
    },
  };
}

function toPersistedSession(session: AiAssistantSession): PersistedSession {
  return {
    id: typeof session.id === 'string' && session.id.trim().length > 0 ? session.id : createId('session'),
    title: normalizeSessionTitle(session.title),
    createdAt: normalizeDateString(session.createdAt),
    updatedAt: normalizeDateString(session.updatedAt),
    messages: (Array.isArray(session.messages) ? session.messages : []).map(toPersistedMessage),
  };
}

function sortSessions(sessions: AiAssistantSession[]) {
  return [...sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function buildStorePayload(state: AiAssistantHistoryState): PersistedHistoryStore {
  return {
    version: HISTORY_VERSION,
    updatedAt: new Date().toISOString(),
    activeSessionId: state.activeSessionId,
    sessions: state.sessions.map(toPersistedSession),
  };
}

function migrateLegacyHistory(raw: PersistedLegacyHistory | PersistedMessage[] | null): AiAssistantHistoryState {
  const messagesRaw: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as PersistedLegacyHistory | null)?.messages)
      ? ((raw as PersistedLegacyHistory).messages as unknown[])
      : [];

  const messages = messagesRaw
    .map((item) => normalizeMessage(item))
    .filter((item): item is AiAssistantMessage => !!item);

  if (messages.length === 0) {
    const session = createEmptySession();
    return {
      sessions: [session],
      activeSessionId: session.id,
    };
  }

  const updatedAt = normalizeDateString((raw as PersistedLegacyHistory | null)?.updatedAt);
  const session = createEmptySession({
    title: inferSessionTitle(messages),
    createdAt: messages[0]?.metadata?.createdAt || updatedAt,
    updatedAt,
    messages,
  });

  return {
    sessions: [session],
    activeSessionId: session.id,
  };
}

function startOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value.getTime();
}

function getSessionGroupKey(session: AiAssistantSession, now = Date.now()): AiAssistantSessionGroupKey {
  const updatedAt = Date.parse(session.updatedAt || '');
  if (Number.isNaN(updatedAt)) return 'earlier';

  const todayStart = startOfLocalDay(new Date(now));
  const yesterdayStart = todayStart - DAY_IN_MS;

  if (updatedAt >= todayStart) return 'today';
  if (updatedAt >= yesterdayStart) return 'yesterday';
  return 'earlier';
}

export function useAiAssistantHistory() {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let latestState: AiAssistantHistoryState = {
    sessions: [],
    activeSessionId: null,
  };

  const writeState = async (state: AiAssistantHistoryState) => {
    if (!window.ipcRenderer) return false;

    try {
      // Electron IPC 使用 structured clone；先转成纯 JSON 结构，避免 Proxy/循环引用导致保存失败。
      const payload = toJsonSafeValue(buildStorePayload(state)) as PersistedHistoryStore;
      const ok = await window.ipcRenderer.invoke('config-write', {
        fileName: HISTORY_FILE_NAME,
        data: payload,
      });
      return !!ok;
    } catch (error) {
      console.error('[useAiAssistantHistory] save failed:', error);
      return false;
    }
  };

  const loadState = async (): Promise<AiAssistantHistoryState> => {
    if (!window.ipcRenderer) {
      const session = createEmptySession();
      return { sessions: [session], activeSessionId: session.id };
    }

    try {
      const raw = (await window.ipcRenderer.invoke('config-read', HISTORY_FILE_NAME)) as
        | PersistedHistoryStore
        | PersistedLegacyHistory
        | PersistedMessage[]
        | null;

      if (raw && !Array.isArray(raw) && Array.isArray((raw as PersistedHistoryStore).sessions)) {
        const sessions = (raw as PersistedHistoryStore).sessions
          .map((session) => normalizeSession(session))
          .filter((session): session is AiAssistantSession => !!session);

        const sortedSessions = sortSessions(sessions);
        const activeSessionId =
          typeof (raw as PersistedHistoryStore).activeSessionId === 'string' &&
          sortedSessions.some((session) => session.id === (raw as PersistedHistoryStore).activeSessionId)
            ? (raw as PersistedHistoryStore).activeSessionId
            : sortedSessions[0]?.id || null;

        if (sortedSessions.length > 0) {
          return {
            sessions: sortedSessions,
            activeSessionId,
          };
        }
      }

      return migrateLegacyHistory(raw as PersistedLegacyHistory | PersistedMessage[] | null);
    } catch (error) {
      console.error('[useAiAssistantHistory] load failed:', error);
      const session = createEmptySession();
      return {
        sessions: [session],
        activeSessionId: session.id,
      };
    }
  };

  const scheduleSave = (state: AiAssistantHistoryState) => {
    latestState = {
      sessions: sortSessions(state.sessions),
      activeSessionId: state.activeSessionId,
    };

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      void writeState(latestState);
    }, SAVE_DEBOUNCE_MS);
  };

  const flushSave = async (state: AiAssistantHistoryState) => {
    latestState = {
      sessions: sortSessions(state.sessions),
      activeSessionId: state.activeSessionId,
    };

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    await writeState(latestState);
  };

  const groupSessionsByDate = (sessions: AiAssistantSession[]): AiAssistantSessionGroup[] => {
    const sorted = sortSessions(sessions);

    const buckets: Record<AiAssistantSessionGroupKey, AiAssistantSession[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };

    for (const session of sorted) {
      buckets[getSessionGroupKey(session)].push(session);
    }

    const defs: Array<{ key: AiAssistantSessionGroupKey; label: string }> = [
      { key: 'today', label: '今天' },
      { key: 'yesterday', label: '昨天' },
      { key: 'earlier', label: '更早' },
    ];

    return defs
      .map((def) => ({
        key: def.key,
        label: def.label,
        sessions: buckets[def.key],
      }))
      .filter((group) => group.sessions.length > 0);
  };

  onBeforeUnmount(() => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
  });

  return {
    loadState,
    scheduleSave,
    flushSave,
    groupSessionsByDate,
  };
}
