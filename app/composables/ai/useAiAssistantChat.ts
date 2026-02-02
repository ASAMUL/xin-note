import type { ChatStatus, FileUIPart, UIMessage } from 'ai';
import { nanoid } from 'nanoid';
import { useAiGatewayModel } from './useAiGatewayModel';

/**
 * 右侧 AI 助手的“对话状态 + 流式回复”封装。
 *
 * 约束：
 * - 当前项目是 Electron 渲染进程直连（不走主进程代理）
 * - 仅使用文本 + 附件（FileUIPart）两类 UI part
 * - 采用 AI SDK 的 streamText 进行流式更新（把 delta 追加到最后一条 assistant message）
 */
export function useAiAssistantChat() {
  const { aiApiKey, aiBaseUrl, aiModel, resolved } = useAiGatewayModel();

  // 使用 useState 让侧边栏关闭/打开时也能保留对话
  const messages = useState<UIMessage[]>('ai-assistant:messages', () => []);
  const status = useState<ChatStatus>('ai-assistant:status', () => 'ready');
  const error = useState<string | null>('ai-assistant:error', () => null);

  // 当前流式请求的 streamId（由 main process 分配）
  const activeStreamId = ref<string | null>(null);
  const activeAssistantId = ref<string | null>(null);
  const activeText = ref('');

  const listenersReady = ref(false);

  const onDelta = (_event: unknown, payload: { streamId: string; delta: string }) => {
    if (!payload?.streamId) return;
    if (payload.streamId !== activeStreamId.value) return;
    activeText.value += payload.delta || '';
    if (activeAssistantId.value) {
      setAssistantText(activeAssistantId.value, activeText.value, 'streaming');
    }
  };

  const onEnd = (_event: unknown, payload: { streamId: string }) => {
    if (!payload?.streamId) return;
    if (payload.streamId !== activeStreamId.value) return;
    if (activeAssistantId.value) {
      setAssistantText(activeAssistantId.value, activeText.value, 'done');
    }
    activeStreamId.value = null;
    activeAssistantId.value = null;
    activeText.value = '';
    status.value = 'ready';
  };

  const onError = (_event: unknown, payload: { streamId: string; message: string }) => {
    if (!payload?.streamId) return;
    if (payload.streamId !== activeStreamId.value) return;
    error.value = payload.message || '请求失败';
    status.value = 'error';
    if (activeAssistantId.value) {
      const fallback =
        activeText.value ||
        `请求失败：${error.value || '未知错误'}\n\n提示：检查 API Key / Model / 网络连接。`;
      setAssistantText(activeAssistantId.value, fallback, 'done');
    }
    activeStreamId.value = null;
    activeAssistantId.value = null;
    activeText.value = '';
  };

  const ensureListeners = () => {
    if (listenersReady.value) return;
    if (!window.ipcRenderer) return;
    window.ipcRenderer.on('ai:chat-stream-delta', onDelta as any);
    window.ipcRenderer.on('ai:chat-stream-end', onEnd as any);
    window.ipcRenderer.on('ai:chat-stream-error', onError as any);
    listenersReady.value = true;
  };

  const toIpcSafeMessages = (input: Array<Omit<UIMessage, 'id'>>) => {
    // 重点：避免把 Vue reactive Proxy 直接传进 IPC（会触发 “An object could not be cloned”）
    return input.map((m) => {
      const parts = Array.isArray((m as any).parts) ? (m as any).parts : [];

      const safeParts = parts
        .map((p: any) => {
          if (!p || typeof p !== 'object') return undefined;
          if (p.type === 'text') {
            return {
              type: 'text' as const,
              text: (p.text || '').toString(),
              state: p.state,
            };
          }
          if (p.type === 'file') {
            return {
              type: 'file' as const,
              url: (p.url || '').toString(),
              mediaType: (p.mediaType || '').toString(),
              filename: p.filename ? p.filename.toString() : undefined,
            };
          }
          // 当前 UI 只用 text/file；其它 part 先忽略，避免序列化风险
          return undefined;
        })
        .filter(Boolean);

      return {
        role: (m as any).role,
        parts: safeParts,
      };
    });
  };

  const abort = () => {
    const streamId = activeStreamId.value;
    if (!streamId) return;
    if (window.ipcRenderer) {
      void window.ipcRenderer.invoke('ai:chat-stream-abort', { streamId });
    }
    if (activeAssistantId.value) {
      setAssistantText(activeAssistantId.value, activeText.value, 'done');
    }
    activeStreamId.value = null;
    activeAssistantId.value = null;
    activeText.value = '';
    status.value = 'ready';
  };

  const clear = () => {
    abort();
    messages.value = [];
    status.value = 'ready';
    error.value = null;
  };

  const getTextFromMessage = (msg: UIMessage) => {
    return (msg.parts || [])
      .filter((p): p is { type: 'text'; text: string } => (p as any)?.type === 'text')
      .map((p) => p.text || '')
      .join('');
  };

  const setAssistantText = (
    assistantId: string,
    nextText: string,
    state?: 'streaming' | 'done',
  ) => {
    const idx = messages.value.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;
    const current = messages.value[idx];
    if (!current || current.role !== 'assistant') return;

    const parts = Array.isArray(current.parts) ? current.parts : [];
    const firstTextIndex = parts.findIndex((p: any) => p?.type === 'text');

    const nextParts = [...parts];
    if (firstTextIndex >= 0) {
      const prev = nextParts[firstTextIndex] as any;
      nextParts[firstTextIndex] = { ...prev, text: nextText, state: state ?? prev?.state };
    } else {
      nextParts.unshift({ type: 'text', text: nextText, state: state ?? 'streaming' } as any);
    }

    messages.value[idx] = { ...current, parts: nextParts } as UIMessage;
  };

  const sendMessage = async (payload: { text: string; files?: FileUIPart[] }) => {
    const text = (payload.text || '').trim();
    const files = payload.files || [];

    if (!text && files.length === 0) return;
    if (status.value === 'streaming') return;

    error.value = null;

    if (!resolved.value.isConfigured) {
      error.value = resolved.value.warnings[0] || '请先在设置中配置 AI Key / Model。';
      status.value = 'error';
      return;
    }

    ensureListeners();
    if (!window.ipcRenderer) {
      error.value = '当前环境缺少 ipcRenderer，无法调用 AI。';
      status.value = 'error';
      return;
    }

    const userMessage: UIMessage = {
      id: nanoid(),
      role: 'user',
      parts: [
        ...(text ? ([{ type: 'text', text }] as any[]) : []),
        // 只保留可序列化字段（避免把 File/Blob 对象塞进 IPC）
        ...(files.map((f) => ({
          type: 'file' as const,
          url: (f as any).url,
          mediaType: (f as any).mediaType,
          filename: (f as any).filename,
        })) as any[]),
      ],
    };

    const assistantId = nanoid();
    const assistantMessage: UIMessage = {
      id: assistantId,
      role: 'assistant',
      parts: [{ type: 'text', text: '', state: 'streaming' } as any],
    };

    messages.value = [...messages.value, userMessage, assistantMessage];

    status.value = 'submitted';

    try {
      status.value = 'streaming';

      // 发送给模型的历史：排除“占位的 assistant 空消息”
      const history = messages.value.slice(0, -1).map(({ id, ...rest }) => rest);
      const historyForIpc = toIpcSafeMessages(history as any);
      const system =
        '你是 Xin-Note 的写作与笔记助手。回答要简洁、结构清晰，必要时给出可执行的步骤。' +
        '当用户在写作续写时，优先保持原文语气与风格。';

      activeStreamId.value = null;
      activeAssistantId.value = assistantId;
      activeText.value = '';

      const res = (await window.ipcRenderer.invoke('ai:chat-stream-start', {
        settings: {
          apiKey: aiApiKey.value,
          baseURL: aiBaseUrl.value,
          model: aiModel.value,
        },
        messages: historyForIpc,
        system,
      })) as { streamId?: string } | null;

      if (!res?.streamId) {
        throw new Error('启动流式请求失败：未返回 streamId');
      }
      activeStreamId.value = res.streamId;
    } catch (e: any) {
      console.error('[useAiAssistantChat] stream failed:', e);
      error.value = e instanceof Error ? e.message : String(e);
      status.value = 'error';

      // 保底：把错误写进最后一条 assistant（避免 UI 空白）
      const fallback =
        getTextFromMessage(assistantMessage) ||
        `请求失败：${error.value || '未知错误'}\n\n提示：检查 API Key / Model / 网络连接。`;
      setAssistantText(assistantId, fallback, 'done');
    }
  };

  onBeforeUnmount(() => {
    if (!window.ipcRenderer) return;
    if (!listenersReady.value) return;
    window.ipcRenderer.off('ai:chat-stream-delta', onDelta as any);
    window.ipcRenderer.off('ai:chat-stream-end', onEnd as any);
    window.ipcRenderer.off('ai:chat-stream-error', onError as any);
    listenersReady.value = false;
  });

  return {
    resolved,
    messages,
    status,
    error,
    sendMessage,
    abort,
    clear,
  };
}
