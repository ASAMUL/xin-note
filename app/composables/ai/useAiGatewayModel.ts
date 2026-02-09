import type { LanguageModel } from 'ai';
import { createGateway, gateway as defaultGateway } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { parseAiBaseUrl, toOpenAiRequestBaseUrl } from '~/utils/ai/baseUrl';

/**
 * 统一解析「用户设置的 modelId」并返回可用于 AI SDK 的 LanguageModel 实例。
 *
 * 设计目标：
 * - 不强绑 Vercel AI Gateway（用户可选用/也可不用）
 * - 兼容主流供应商（OpenAI / Anthropic / Google Gemini）
 * - 兼容 OpenAI-compatible（例如自建代理、OpenRouter 等）
 *
 * modelId 推荐格式：
 * - openai/<model>            例如：openai/gpt-4o-mini
 * - anthropic/<model>         例如：anthropic/claude-3-5-sonnet-latest
 * - google/<model>            例如：google/gemini-2.0-flash
 * - openai-compatible/<model> 例如：openai-compatible/claude-3.5-sonnet（具体取决于你的 baseURL 提供者）
 * - gateway/<providerModelId> 例如：gateway/openai/gpt-5 （可选：走 Vercel AI Gateway，需要 AI_GATEWAY_API_KEY）
 *
 * 兼容旧输入：
 * - 若用户只填了 `gpt-4o-mini`（不含 /），默认当作 openai/gpt-4o-mini。
 */

export type SupportedAiProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai-compatible'
  | 'gateway';

export interface ResolvedAiModel {
  provider: SupportedAiProvider;
  /**
   * 规范化后的 modelId（用于日志/展示）
   * - direct provider: `${provider}/${model}`
   * - gateway: `gateway/${providerModelId}`
   */
  modelId: string;
  /**
   * provider 侧实际使用的模型标识：
   * - direct provider: `model`
   * - gateway: `providerModelId`（例如 openai/gpt-5）
   */
  providerModelId: string;
  /**
   * 是否配置完整（至少需要 apiKey；openai-compatible 还需要 baseURL）
   */
  isConfigured: boolean;
  /**
   * 可直接传入 generateText/streamText 的 LanguageModel
   */
  model: LanguageModel | null;
  /**
   * 给 UI/日志用的提示（不做 toast，由调用方决定如何提示）
   */
  warnings: string[];
}

const AI_GATEWAY_DEFAULT_BASE_URL = 'https://ai-gateway.vercel.sh/v3/ai';

export interface UseAiGatewayModelOptions {
  /**
   * 可选：用指定 modelId 覆盖 settings.aiChatModelId
   */
  modelId?: Ref<string | null | undefined>;
  /**
   * 严格模式：当 modelId 为空时，直接判定为未配置（不回退默认模型）。
   * - 用于“角色模型”场景：必须显式选择并启用模型
   */
  strictModel?: boolean;
}

function isOpenRouterBaseUrl(baseURL: string) {
  try {
    const u = new URL(baseURL);
    return /(^|\.)openrouter\.ai$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function parseModelId(raw: string | null | undefined): {
  provider: SupportedAiProvider;
  providerModelId: string;
} {
  const value = (raw || '').trim();
  if (!value) {
    return { provider: 'openai', providerModelId: 'gpt-4o-mini' };
  }

  // 旧格式：gpt-4o-mini
  if (!value.includes('/')) {
    return { provider: 'openai', providerModelId: value };
  }

  const [prefix, ...rest] = value.split('/');
  const provider = (prefix || '').trim().toLowerCase() as SupportedAiProvider;
  const providerModelId = rest.join('/').trim();

  if (!providerModelId) {
    // 像 openai/ 这种无效输入：兜底回 openai
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

  // 未识别：按 openai-compatible 处理（让用户用 baseURL 连接第三方 OpenAI-compatible）
  return { provider: 'openai-compatible', providerModelId: value };
}

export function useAiGatewayModel() {
  const { aiApiKey, aiBaseUrl, aiChatModelId } = useSettings();

  // 默认使用「聊天模型」作为通用 modelId
  const aiModel = computed(() => (aiChatModelId.value || '').trim());

  const resolved = computed<ResolvedAiModel>(() => {
    const warnings: string[] = [];
    const key = aiApiKey.value?.trim() || '';
    const baseParsed = parseAiBaseUrl(aiBaseUrl.value);
    const baseURL = baseParsed.baseURL;
    const openAiRequestBaseURL = toOpenAiRequestBaseUrl(aiBaseUrl.value);
    const parsed = parseModelId(aiModel.value);

    // ====== 兼容 OpenRouter（OpenAI-compatible） ======
    // 常见误配：baseURL 指向 openrouter，但 model 写成 google/... / anthropic/... / openai/...
    // 这类聚合服务应走 openai-compatible provider（Authorization: Bearer），而不是各家官方 header。
    let effectiveProvider: SupportedAiProvider = parsed.provider;
    let effectiveProviderModelId = parsed.providerModelId;
    if (
      baseURL &&
      isOpenRouterBaseUrl(baseURL) &&
      (parsed.provider === 'openai' ||
        parsed.provider === 'anthropic' ||
        parsed.provider === 'google')
    ) {
      effectiveProvider = 'openai-compatible';
      effectiveProviderModelId = `${parsed.provider}/${parsed.providerModelId}`;
      warnings.push(
        '检测到 BaseURL 为 OpenRouter（OpenAI-compatible），已自动按 openai-compatible 调用；建议 model 写成 openai-compatible/<provider>/<model>。',
      );
    }

    const modelId =
      effectiveProvider === 'gateway'
        ? `gateway/${effectiveProviderModelId}`
        : `${effectiveProvider}/${effectiveProviderModelId}`;

    // 是否配置完整：这里以“至少有 key”为准（多数供应商都需要 key）
    // 注意：OpenAI/Anthropic/Google 的 provider 默认只会读环境变量；在 Electron 渲染进程里必须显式传入 apiKey。
    let isConfigured = !!key;

    // openai-compatible 额外需要 baseURL
    if (effectiveProvider === 'openai-compatible') {
      if (!baseURL) {
        isConfigured = false;
        warnings.push('openai-compatible 需要配置 Base URL。');
      }
    }

    // gateway：需要 key；baseURL 为空时用官方默认
    if (effectiveProvider === 'gateway') {
      if (!key) {
        warnings.push('AI Gateway 需要配置 AI_GATEWAY_API_KEY（可在 Vercel 控制台创建）。');
      }
    }

    let model: LanguageModel | null = null;
    if (!isConfigured) {
      return {
        provider: effectiveProvider,
        modelId,
        providerModelId: effectiveProviderModelId,
        isConfigured,
        model,
        warnings,
      };
    }

    try {
      if (effectiveProvider === 'openai') {
        const provider = createOpenAI({
          apiKey: key,
          // baseURL 可选：用于代理/自定义网关（需与 OpenAI API 兼容）
          ...(openAiRequestBaseURL ? { baseURL: openAiRequestBaseURL } : {}),
        });
        model = provider(effectiveProviderModelId as any) as unknown as LanguageModel;
      } else if (effectiveProvider === 'anthropic') {
        const provider = createAnthropic({
          apiKey: key,
          ...(baseURL ? { baseURL } : {}),
        });
        model = provider(effectiveProviderModelId as any) as unknown as LanguageModel;
      } else if (effectiveProvider === 'google') {
        const provider = createGoogleGenerativeAI({
          apiKey: key,
          ...(baseURL ? { baseURL } : {}),
        });
        model = provider(effectiveProviderModelId as any) as unknown as LanguageModel;
      } else if (effectiveProvider === 'openai-compatible') {
        const provider = createOpenAICompatible({
          name: 'openai-compatible',
          baseURL: openAiRequestBaseURL || baseURL,
          apiKey: key,
        });
        model = provider.chatModel(effectiveProviderModelId) as unknown as LanguageModel;
      } else if (effectiveProvider === 'gateway') {
        // ⚠️ 走 Vercel AI Gateway：对用户来说是“可选项”
        // 默认 baseURL 为官方的 https://ai-gateway.vercel.sh/v3/ai
        const gwBaseUrl = baseURL || AI_GATEWAY_DEFAULT_BASE_URL;
        const gw =
          gwBaseUrl === AI_GATEWAY_DEFAULT_BASE_URL
            ? defaultGateway
            : createGateway({
                apiKey: key,
                baseURL: gwBaseUrl,
              });
        model = (gw as any)(effectiveProviderModelId) as LanguageModel;
      }
    } catch (e) {
      console.error('[useAiGatewayModel] resolve model failed:', e);
      warnings.push('解析模型失败，请检查 Model/BaseURL/Key 是否正确。');
      model = null;
      isConfigured = false;
    }

    return {
      provider: effectiveProvider,
      modelId,
      providerModelId: effectiveProviderModelId,
      isConfigured,
      model,
      warnings,
    };
  });

  return {
    aiApiKey,
    aiBaseUrl,
    aiModel,
    resolved,
  };
}

export function useAiGatewayModelWithOptions(options?: UseAiGatewayModelOptions) {
  const { aiApiKey, aiBaseUrl, aiChatModelId } = useSettings();

  const aiModel = computed(() => {
    const raw = options?.modelId ? options.modelId.value : aiChatModelId.value;
    return (raw || '').trim();
  });

  const resolved = computed<ResolvedAiModel>(() => {
    const warnings: string[] = [];
    const key = aiApiKey.value?.trim() || '';
    const baseParsed = parseAiBaseUrl(aiBaseUrl.value);
    const baseURL = baseParsed.baseURL;
    const openAiRequestBaseURL = toOpenAiRequestBaseUrl(aiBaseUrl.value);

    if (options?.strictModel && !aiModel.value) {
      return {
        provider: 'openai',
        modelId: '',
        providerModelId: '',
        isConfigured: false,
        model: null,
        warnings: ['请先选择模型。'],
      };
    }

    const parsed = parseModelId(aiModel.value);

    // ====== 兼容 OpenRouter（OpenAI-compatible） ======
    // 常见误配：baseURL 指向 openrouter，但 model 写成 google/... / anthropic/... / openai/...
    // 这类聚合服务应走 openai-compatible provider（Authorization: Bearer），而不是各家官方 header。
    let effectiveProvider: SupportedAiProvider = parsed.provider;
    let effectiveProviderModelId = parsed.providerModelId;
    if (
      baseURL &&
      isOpenRouterBaseUrl(baseURL) &&
      (parsed.provider === 'openai' ||
        parsed.provider === 'anthropic' ||
        parsed.provider === 'google')
    ) {
      effectiveProvider = 'openai-compatible';
      effectiveProviderModelId = `${parsed.provider}/${parsed.providerModelId}`;
      warnings.push(
        '检测到 BaseURL 为 OpenRouter（OpenAI-compatible），已自动按 openai-compatible 调用；建议 model 写成 openai-compatible/<provider>/<model>。',
      );
    }

    const modelId =
      effectiveProvider === 'gateway'
        ? `gateway/${effectiveProviderModelId}`
        : `${effectiveProvider}/${effectiveProviderModelId}`;

    // 是否配置完整：这里以“至少有 key”为准（多数供应商都需要 key）
    // 注意：OpenAI/Anthropic/Google 的 provider 默认只会读环境变量；在 Electron 渲染进程里必须显式传入 apiKey。
    let isConfigured = !!key;

    // openai-compatible 额外需要 baseURL
    if (effectiveProvider === 'openai-compatible') {
      if (!baseURL) {
        isConfigured = false;
        warnings.push('openai-compatible 需要配置 Base URL。');
      }
    }

    // gateway：需要 key；baseURL 为空时用官方默认
    if (effectiveProvider === 'gateway') {
      if (!key) {
        warnings.push('AI Gateway 需要配置 AI_GATEWAY_API_KEY（可在 Vercel 控制台创建）。');
      }
    }

    let model: LanguageModel | null = null;
    if (!isConfigured) {
      return {
        provider: effectiveProvider,
        modelId,
        providerModelId: effectiveProviderModelId,
        isConfigured,
        model,
        warnings,
      };
    }

    try {
      if (effectiveProvider === 'openai') {
        const provider = createOpenAI({
          apiKey: key,
          // baseURL 可选：用于代理/自定义网关（需与 OpenAI API 兼容）
          ...(openAiRequestBaseURL ? { baseURL: openAiRequestBaseURL } : {}),
        });
        model = provider(effectiveProviderModelId as any) as unknown as LanguageModel;
      } else if (effectiveProvider === 'anthropic') {
        const provider = createAnthropic({
          apiKey: key,
          ...(baseURL ? { baseURL } : {}),
        });
        model = provider(effectiveProviderModelId as any) as unknown as LanguageModel;
      } else if (effectiveProvider === 'google') {
        const provider = createGoogleGenerativeAI({
          apiKey: key,
          ...(baseURL ? { baseURL } : {}),
        });
        model = provider(effectiveProviderModelId as any) as unknown as LanguageModel;
      } else if (effectiveProvider === 'openai-compatible') {
        const provider = createOpenAICompatible({
          name: 'openai-compatible',
          baseURL: openAiRequestBaseURL || baseURL,
          apiKey: key,
        });
        model = provider.chatModel(effectiveProviderModelId) as unknown as LanguageModel;
      } else if (effectiveProvider === 'gateway') {
        // ⚠️ 走 Vercel AI Gateway：对用户来说是“可选项”
        // 默认 baseURL 为官方的 https://ai-gateway.vercel.sh/v3/ai
        const gwBaseUrl = baseURL || AI_GATEWAY_DEFAULT_BASE_URL;
        const gw =
          gwBaseUrl === AI_GATEWAY_DEFAULT_BASE_URL
            ? defaultGateway
            : createGateway({
                apiKey: key,
                baseURL: gwBaseUrl,
              });
        model = (gw as any)(effectiveProviderModelId) as LanguageModel;
      }
    } catch (e) {
      console.error('[useAiGatewayModel] resolve model failed:', e);
      warnings.push('解析模型失败，请检查 Model/BaseURL/Key 是否正确。');
      model = null;
      isConfigured = false;
    }

    return {
      provider: effectiveProvider,
      modelId,
      providerModelId: effectiveProviderModelId,
      isConfigured,
      model,
      warnings,
    };
  });

  return {
    aiApiKey,
    aiBaseUrl,
    aiModel,
    resolved,
  };
}
