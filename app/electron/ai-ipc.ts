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
  /**
   * 高级：是否请求/返回“推理(Reasoning)”内容。
   *
   * 说明：不同 OpenAI-compatible 提供商对 reasoning 的参数与返回字段不完全一致；
   * 这里提供一个可选开关，默认走 'auto'（仅对已识别的提供商启用，不写死到某一家）。
   */
  reasoning?: 'auto' | boolean;
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

  // 兼容 OpenRouter（OpenAI-compatible 聚合）：
  // - 若 baseURL 指向 openrouter，则统一走 openai-compatible provider（Authorization: Bearer）
  // - 用户 model 可能是 google/... / anthropic/... / openai/... 或 openai-compatible/<provider>/<model>
  if (baseURL && isOpenRouterBaseUrl(baseURL) && parsed.provider !== 'gateway') {
    const provider = createOpenAICompatible({
      name: 'openrouter',
      baseURL: openAiRequestBaseURL || baseURL,
      apiKey,
    });

    const openrouterModelId =
      parsed.provider === 'openai-compatible'
        ? parsed.providerModelId
        : `${parsed.provider}/${parsed.providerModelId}`;

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
      // 使用 camelCase name，便于 providerOptions 透传（避免 kebab-case 的兼容警告）
      name: 'openaiCompatible',
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
    const baseURL = parseAiBaseUrl(req.settings?.baseURL).baseURL;
    const parsedModel = parseModelId(req.settings?.model || '');

    const openAiCompatibleProviderName =
      baseURL && isOpenRouterBaseUrl(baseURL) && parsedModel.provider !== 'gateway'
        ? 'openrouter'
        : parsedModel.provider === 'openai-compatible'
          ? 'openaiCompatible'
          : null;

    // ====== Reasoning（推理内容）请求策略 ======
    // 注意：不要对所有 OpenAI-compatible 一刀切地注入 OpenRouter 的参数（很多服务会直接 400）。
    // 这里只在“已识别的 OpenRouter”上默认开启；其余服务保持不变（除非未来 UI 显式透传）。
    const reasoningToggle = req.settings?.reasoning ?? 'auto';
    const shouldRequestReasoning =
      reasoningToggle === true ||
      (reasoningToggle === 'auto' &&
        parsedModel.provider !== 'gateway' &&
        !!baseURL &&
        isOpenRouterBaseUrl(baseURL));

    const providerOptions: Record<string, any> | undefined = shouldRequestReasoning
      ? (() => {
          if (openAiCompatibleProviderName === 'openrouter') {
            return {
              [openAiCompatibleProviderName]: {
                // OpenRouter Chat Completions 支持 `reasoning` 对象；enabled=true 使用默认配置（通常为 medium）
                reasoning: { enabled: true },
                // 兼容 legacy 参数（OpenRouter 会把它映射为 reasoning 配置）
                include_reasoning: true,
              },
            };
          }

          // 其它 openai-compatible 提供商：仅当用户显式开启（reasoning=true）时，尝试用 OpenAI-style 的 reasoning_effort。
          // - 这不是通用标准；部分服务可能不支持并返回 400。
          // - 之所以不在 auto 下启用，是为了避免“换个兼容服务就报错”。
          if (openAiCompatibleProviderName === 'openaiCompatible' && reasoningToggle === true) {
            return {
              [openAiCompatibleProviderName]: {
                reasoningEffort: 'medium',
              },
            };
          }

          return undefined;
        })()
      : undefined;

    const streamId = nanoid();
    const controller = new AbortController();
    activeStreams.set(streamId, controller);

    // 后台执行：通过 IPC push delta
    void (async () => {
      try {
        const modelMessages = await convertToModelMessages(req.messages);
        const result = streamText({
          model,
          system: req.system,
          messages: modelMessages,
          abortSignal: controller.signal,
          providerOptions,
          // 开启 raw chunk 以便在部分提供商仅返回 reasoning_details 时做兜底解析
          includeRawChunks: shouldRequestReasoning && openAiCompatibleProviderName === 'openrouter',
        });

        // 若 SDK 已经产出 reasoning-* chunk，则不再用 raw 兜底，避免重复
        let sdkReasoningSeen = false;
        let rawReasoningActive = false;
        const rawReasoningId = 'reasoning-0';

        const extractReasoningDeltaFromRaw = (rawValue: unknown): string => {
          try {
            const delta: any = (rawValue as any)?.choices?.[0]?.delta;
            if (!delta || typeof delta !== 'object') return '';

            // OpenRouter 可能返回结构化 reasoning_details（AI SDK 目前不会解析这个字段）
            const details = delta.reasoning_details;
            if (Array.isArray(details) && details.length > 0) {
              const out: string[] = [];
              for (const item of details) {
                if (!item || typeof item !== 'object') continue;

                // 常见：{ type: "reasoning.text", text: "..." }
                if (typeof (item as any).text === 'string' && (item as any).text) {
                  out.push((item as any).text);
                  continue;
                }

                // 兼容 summary：可能是 string 或 string[]
                if (typeof (item as any).summary === 'string' && (item as any).summary) {
                  out.push((item as any).summary);
                  continue;
                }
                if (Array.isArray((item as any).summary) && (item as any).summary.length > 0) {
                  out.push(((item as any).summary as any[]).filter((v) => typeof v === 'string').join('\n'));
                  continue;
                }
              }
              return out.filter(Boolean).join('');
            }

            return '';
          } catch {
            return '';
          }
        };

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
            sdkReasoningSeen = true;
            sendToRenderer(event, 'ai:chat-stream-reasoning-start', {
              streamId,
              id: part.id,
            });
            continue;
          }

          if (part.type === 'reasoning-delta') {
            sdkReasoningSeen = true;
            sendToRenderer(event, 'ai:chat-stream-reasoning-delta', {
              streamId,
              id: part.id,
              delta: part.text,
            });
            continue;
          }

          if (part.type === 'reasoning-end') {
            sdkReasoningSeen = true;
            sendToRenderer(event, 'ai:chat-stream-reasoning-end', {
              streamId,
              id: part.id,
            });
            continue;
          }

          // raw chunk 兜底：用于解析 reasoning_details（当 SDK 没有产出 reasoning chunk 时）
          if (part.type === 'raw' && shouldRequestReasoning && !sdkReasoningSeen) {
            const delta = extractReasoningDeltaFromRaw((part as any).rawValue);
            if (!delta) continue;

            if (!rawReasoningActive) {
              rawReasoningActive = true;
              sendToRenderer(event, 'ai:chat-stream-reasoning-start', {
                streamId,
                id: rawReasoningId,
              });
            }

            sendToRenderer(event, 'ai:chat-stream-reasoning-delta', {
              streamId,
              id: rawReasoningId,
              delta,
            });
          }
        }

        // 兜底结束（仅 raw reasoning 走这里）
        if (rawReasoningActive && !sdkReasoningSeen) {
          sendToRenderer(event, 'ai:chat-stream-reasoning-end', {
            streamId,
            id: rawReasoningId,
          });
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
