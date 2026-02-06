import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';

import type { LanguageModel, UIMessage } from 'ai';
import {
  Output,
  convertToModelMessages,
  createGateway,
  gateway as defaultGateway,
  generateText,
  streamText,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { parseAiBaseUrl, toOpenAiRequestBaseUrl } from '../utils/ai/baseUrl';

export interface AiRuntimeSettings {
  apiKey: string | null;
  baseURL?: string | null;
  model: string;
}

export interface AiEditorSuggestRequest {
  settings: AiRuntimeSettings;
  textBefore: string;
}

export interface AiChatStreamStartRequest {
  settings: AiRuntimeSettings;
  messages: Array<Omit<UIMessage, 'id'>>;
  system?: string;
}

export interface AiModelsListRequest {
  baseURL?: string | null;
  apiKey: string | null;
}

type SupportedAiProvider = 'openai' | 'anthropic' | 'google' | 'openai-compatible' | 'gateway';

const AI_GATEWAY_DEFAULT_BASE_URL = 'https://ai-gateway.vercel.sh/v3/ai';
const AI_GATEWAY_MODELS_LIST_URL = 'https://ai-gateway.vercel.sh/v1/models';

function parseModelId(raw: string): { provider: SupportedAiProvider; providerModelId: string } {
  const value = (raw || '').trim();
  if (!value) {
    return { provider: 'openai', providerModelId: 'gpt-4o-mini' };
  }

  if (!value.includes('/')) {
    return { provider: 'openai', providerModelId: value };
  }

  const [prefix, ...rest] = value.split('/');
  const provider = (prefix || '').trim().toLowerCase() as SupportedAiProvider;
  const providerModelId = rest.join('/').trim();

  if (!providerModelId) {
    return { provider: 'openai', providerModelId: 'gpt-4o-mini' };
  }

  if (
    provider === 'openai' ||
    provider === 'anthropic' ||
    provider === 'google' ||
    provider === 'openai-compatible' ||
    provider === 'gateway'
  ) {
    return { provider, providerModelId };
  }

  // 未识别：按 openai-compatible 的 modelId 透传（例如直接填了 openrouter 的 modelId）
  return { provider: 'openai-compatible', providerModelId: value };
}

function isOpenRouterBaseUrl(baseURL: string) {
  try {
    const u = new URL(baseURL);
    return /(^|\.)openrouter\.ai$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function isAiGatewayInferenceBase(baseURL: string) {
  try {
    const u = new URL(baseURL);
    return u.hostname === 'ai-gateway.vercel.sh' && /\/v3\/ai\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

function buildModelsListUrls(input?: string | null): string[] {
  const parsed = parseAiBaseUrl(input);
  const baseURL = parsed.baseURL;
  if (!baseURL) return [];

  const result: string[] = [];
  const pushUnique = (v: string) => {
    if (!result.includes(v)) result.push(v);
  };

  // 特判：用户把 baseURL 填成 AI Gateway inference base（/v3/ai），模型列表需要走 /v1/models
  if (isAiGatewayInferenceBase(baseURL)) {
    pushUnique(AI_GATEWAY_MODELS_LIST_URL);
  }

  // 主流约定：baseURL + /models
  pushUnique(`${baseURL}/models`);

  // 兼容旧实现/部分服务：baseURL/v1/models
  if (!parsed.disableAutoAppendV1 && !/\/v1$/i.test(baseURL)) {
    pushUnique(`${baseURL}/v1/models`);
  }

  return result;
}

function parseModelsListPayload(payload: any): string[] {
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  if (!Array.isArray(list)) return [];
  return list
    .map((item: any) => (typeof item === 'string' ? item : item?.id))
    .filter((id: any) => typeof id === 'string' && id.trim().length > 0)
    .map((id: string) => id.trim());
}

async function fetchJsonWithTimeout(url: string, init: any, timeoutMs = 12_000): Promise<any> {
  const doFetch: any = (globalThis as any).fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('当前运行时不支持 fetch');
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!res?.ok) {
      const status = res?.status;
      const statusText = res?.statusText || '';
      throw new Error(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function resolveLanguageModel(settings: AiRuntimeSettings): LanguageModel {
  const apiKey = (settings.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('AI 未配置：缺少 API Key');
  }

  const baseParsed = parseAiBaseUrl(settings.baseURL);
  const baseURL = baseParsed.baseURL;
  const openAiRequestBaseURL = toOpenAiRequestBaseUrl(settings.baseURL);
  const parsed = parseModelId(settings.model);

  // 兼容 OpenRouter：用户可能会填 model=google/... 但 baseURL 指向 openrouter
  // - OpenRouter 是 OpenAI-compatible API，应该走 openai-compatible provider
  if (
    baseURL &&
    isOpenRouterBaseUrl(baseURL) &&
    (parsed.provider === 'openai' ||
      parsed.provider === 'anthropic' ||
      parsed.provider === 'google')
  ) {
    const provider = createOpenAICompatible({
      name: 'openrouter',
      baseURL: openAiRequestBaseURL || baseURL,
      apiKey,
    });
    const openrouterModelId = `${parsed.provider}/${parsed.providerModelId}`;
    return provider.chatModel(openrouterModelId) as unknown as LanguageModel;
  }

  if (parsed.provider === 'openai') {
    const provider = createOpenAI({
      apiKey,
      ...(openAiRequestBaseURL ? { baseURL: openAiRequestBaseURL } : {}),
    });
    return provider(parsed.providerModelId as any) as unknown as LanguageModel;
  }

  if (parsed.provider === 'anthropic') {
    const provider = createAnthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    return provider(parsed.providerModelId as any) as unknown as LanguageModel;
  }

  if (parsed.provider === 'google') {
    const provider = createGoogleGenerativeAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    return provider(parsed.providerModelId as any) as unknown as LanguageModel;
  }

  if (parsed.provider === 'openai-compatible') {
    if (!baseURL) {
      throw new Error('openai-compatible 需要配置 Base URL');
    }
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: openAiRequestBaseURL || baseURL,
      apiKey,
    });
    return provider.chatModel(parsed.providerModelId) as unknown as LanguageModel;
  }

  // gateway（可选）：需要 AI_GATEWAY_API_KEY；baseURL 为空则用官方默认
  const gwBaseUrl = baseURL || AI_GATEWAY_DEFAULT_BASE_URL;
  const gw =
    gwBaseUrl === AI_GATEWAY_DEFAULT_BASE_URL
      ? defaultGateway
      : createGateway({ apiKey, baseURL: gwBaseUrl });
  return (gw as any)(parsed.providerModelId) as LanguageModel;
}

// ========== 流式会话管理 ==========
const activeStreams = new Map<string, AbortController>();

function sendToRenderer(event: IpcMainInvokeEvent, channel: string, payload: any) {
  try {
    if (event.sender.isDestroyed()) return;
    event.sender.send(channel, payload);
  } catch {
    // 渲染进程已销毁：忽略
  }
}

function serializeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e || 'Unknown error');
}

export function setupAiIpc() {
  // 获取可用模型列表（基于用户 baseURL 的 OpenAI-compatible /models 接口）
  ipcMain.handle('ai:models-list', async (_event, req: AiModelsListRequest) => {
    const baseURL = parseAiBaseUrl(req.baseURL).baseURL;
    if (!baseURL) {
      throw new Error('缺少 Base URL');
    }
    const urls = buildModelsListUrls(req.baseURL);

    if (urls.length === 0) {
      throw new Error('Base URL 格式不正确');
    }

    const apiKey = (req.apiKey || '').trim();
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    let lastError: unknown;
    for (const url of urls) {
      try {
        const json = await fetchJsonWithTimeout(
          url,
          {
            method: 'GET',
            headers,
          },
          12_000,
        );
        return parseModelsListPayload(json);
      } catch (e) {
        lastError = e;
        continue;
      }
    }

    throw new Error(`获取模型列表失败：${serializeError(lastError)}`);
  });

  // 编辑器：3 条续写候选（一次性返回）
  ipcMain.handle('ai:editor-suggest', async (_event, req: AiEditorSuggestRequest) => {
    const model = resolveLanguageModel(req.settings);

    const schema = z.object({
      suggestions: z.array(z.string()).min(3).max(3),
    });

    const { output } = await generateText({
      model,
      temperature: 0.7,
      maxOutputTokens: 120,
      output: Output.object({ schema }),
      system:
        '你是一个写作续写助手。只输出“续写的新增内容”，不要复述用户已有内容。每条最多 1 句话。保持原文语气与格式。',
      prompt:
        `请基于以下内容继续写作（只输出续写部分）。\n` +
        `请返回严格 JSON，格式为：{"suggestions":[string,string,string]}，必须正好 3 条。\n\n` +
        `${req.textBefore}`,
    });

    return (output?.suggestions ?? []).map((s) => (s || '').toString());
  });

  // 侧边栏：启动流式生成
  ipcMain.handle('ai:chat-stream-start', async (event, req: AiChatStreamStartRequest) => {
    const model = resolveLanguageModel(req.settings);

    const streamId = nanoid();
    const controller = new AbortController();
    activeStreams.set(streamId, controller);

    // 后台执行：通过 IPC push delta
    void (async () => {
      try {
        const modelMessages = await convertToModelMessages(req.messages as any);
        const result = streamText({
          model,
          system: req.system,
          messages: modelMessages as any,
          abortSignal: controller.signal,
        });

        for await (const part of result.fullStream) {
          if (controller.signal.aborted) break;

          if (part.type === 'text-delta') {
            sendToRenderer(event, 'ai:chat-stream-delta', {
              streamId,
              delta: part.text,
            });
            continue;
          }

          if (part.type === 'reasoning-start') {
            sendToRenderer(event, 'ai:chat-stream-reasoning-start', {
              streamId,
              id: part.id,
            });
            continue;
          }

          if (part.type === 'reasoning-delta') {
            sendToRenderer(event, 'ai:chat-stream-reasoning-delta', {
              streamId,
              id: part.id,
              delta: part.text,
            });
            continue;
          }

          if (part.type === 'reasoning-end') {
            sendToRenderer(event, 'ai:chat-stream-reasoning-end', {
              streamId,
              id: part.id,
            });
          }
        }
        sendToRenderer(event, 'ai:chat-stream-end', { streamId });
      } catch (e) {
        // AbortError 表示用户主动终止：忽略
        if ((e as any)?.name === 'AbortError') {
          sendToRenderer(event, 'ai:chat-stream-end', { streamId });
          return;
        }
        sendToRenderer(event, 'ai:chat-stream-error', { streamId, message: serializeError(e) });
      } finally {
        activeStreams.delete(streamId);
      }
    })();

    return { streamId };
  });

  ipcMain.handle('ai:chat-stream-abort', async (_event, payload: { streamId: string }) => {
    const controller = activeStreams.get(payload.streamId);
    if (controller) {
      controller.abort();
      activeStreams.delete(payload.streamId);
    }
    return true;
  });
}
