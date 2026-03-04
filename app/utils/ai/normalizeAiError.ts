import type { AiAssistantErrorCategory, AiAssistantErrorInfo } from '~/types/ai-assistant';
import { toJsonSafeValue } from '~/utils/serialization/ipcSafe';

export type AiErrorTranslator = (key: string, params?: Record<string, unknown>) => string;

interface ExtractedAiError {
  rawMessage: string;
  statusCode?: number;
  code?: string | number;
  url?: string;
  responseBody?: string;
  stack?: string;
  model?: string;
  data?: unknown;
  requestBodyValues?: unknown;
  responseHeaders?: unknown;
  isRetryable?: boolean;
}

interface ClassifiedAiError {
  category: AiAssistantErrorCategory;
  titleKey: string;
  titleFallback: string;
  summaryKey: string;
  summaryFallback: string;
  retryable: boolean;
}

const AI_ERROR_CATEGORY_TRANSLATIONS: Record<
  AiAssistantErrorCategory,
  { key: string; fallback: string }
> = {
  abort: { key: 'aiAssistant.error.categories.abort', fallback: '用户取消' },
  config: { key: 'aiAssistant.error.categories.config', fallback: '配置错误' },
  network: { key: 'aiAssistant.error.categories.network', fallback: '网络异常' },
  auth: { key: 'aiAssistant.error.categories.auth', fallback: '鉴权失败' },
  permission: { key: 'aiAssistant.error.categories.permission', fallback: '权限不足' },
  region: { key: 'aiAssistant.error.categories.region', fallback: '地区限制' },
  model: { key: 'aiAssistant.error.categories.model', fallback: '模型不可用' },
  'rate-limit': { key: 'aiAssistant.error.categories.rate-limit', fallback: '频率/额度限制' },
  service: { key: 'aiAssistant.error.categories.service', fallback: '服务异常' },
  unknown: { key: 'aiAssistant.error.categories.unknown', fallback: '未知错误' },
};

function createErrorId() {
  return `ai-err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toRawMessage(error: unknown) {
  if (error instanceof Error) return error.message || String(error);
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return String(error || 'Unknown error');
}

function shorten(text: string, max = 240) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatWithParams(template: string, params?: Record<string, unknown>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function translateWithFallback(
  translate: AiErrorTranslator | undefined,
  key: string,
  fallback: string,
  params?: Record<string, unknown>,
) {
  const fallbackText = formatWithParams(fallback, params);
  if (!translate) return fallbackText;

  try {
    const translated = translate(key, params);
    if (typeof translated === 'string' && translated.trim().length > 0 && translated !== key) {
      return translated;
    }
  } catch {
    // i18n 调用失败时回退默认文案
  }

  return fallbackText;
}

function safeJsonBlock(value: unknown, fallback: string) {
  const safeValue = toJsonSafeValue(value);
  if (safeValue === null || safeValue === undefined) return fallback;
  try {
    return JSON.stringify(safeValue, null, 2);
  } catch {
    return String(safeValue);
  }
}

function extractError(error: unknown): ExtractedAiError {
  const rawMessage = toRawMessage(error).trim();
  if (!isRecord(error)) {
    return { rawMessage };
  }

  const nestedDataError =
    isRecord(error.data) && isRecord(error.data.error) ? error.data.error : null;
  const requestBodyValues = isRecord(error.requestBodyValues) ? error.requestBodyValues : undefined;

  const dataMessage = nestedDataError ? pickString(nestedDataError.message) : undefined;
  const statusCode = pickNumber(error.statusCode) ?? pickNumber(nestedDataError?.code);
  const code =
    pickString(error.code) ||
    pickNumber(error.code) ||
    pickString(nestedDataError?.code) ||
    pickNumber(nestedDataError?.code);

  return {
    rawMessage: rawMessage || dataMessage || 'Unknown error',
    statusCode,
    code,
    url: pickString(error.url),
    responseBody: pickString(error.responseBody),
    stack: pickString(error.stack),
    model: requestBodyValues ? pickString(requestBodyValues.model) : undefined,
    data: toJsonSafeValue(error.data),
    requestBodyValues: toJsonSafeValue(error.requestBodyValues),
    responseHeaders: toJsonSafeValue(error.responseHeaders),
    isRetryable: typeof error.isRetryable === 'boolean' ? error.isRetryable : undefined,
  };
}

function classifyError(extracted: ExtractedAiError): ClassifiedAiError {
  const searchable = [
    extracted.rawMessage,
    extracted.responseBody || '',
    extracted.code !== undefined ? String(extracted.code) : '',
    extracted.statusCode !== undefined ? String(extracted.statusCode) : '',
  ]
    .join(' ')
    .toLowerCase();

  const statusCode = extracted.statusCode;

  if (/abort|cancel|用户已终止|已停止本次生成/.test(searchable)) {
    return {
      category: 'abort',
      titleKey: 'aiAssistant.error.titles.abort',
      titleFallback: '本次生成已停止',
      summaryKey: 'aiAssistant.error.summaries.abort',
      summaryFallback: '你已停止本次生成。',
      retryable: true,
    };
  }

  if (/ai_empty_response|empty response|empty stream|no content/.test(searchable)) {
    return {
      category: 'unknown',
      titleKey: 'aiAssistant.error.titles.unknown',
      titleFallback: '请求失败',
      summaryKey: 'aiAssistant.error.summaries.emptyResponse',
      summaryFallback: 'AI 未返回有效内容，请重试。',
      retryable: true,
    };
  }

  if (/region|not available in your region|地区|地域|geo|country/.test(searchable)) {
    return {
      category: 'region',
      titleKey: 'aiAssistant.error.titles.region',
      titleFallback: '模型受地区限制',
      summaryKey: 'aiAssistant.error.summaries.region',
      summaryFallback: '当前模型在你所在地区不可用，请切换模型或服务商后重试。',
      retryable: true,
    };
  }

  if (
    /缺少 api key|请先在设置中配置|openai-compatible 需要配置 base url|base url 格式不正确|ipcrenderer/.test(
      searchable,
    )
  ) {
    return {
      category: 'config',
      titleKey: 'aiAssistant.error.titles.config',
      titleFallback: 'AI 配置不完整',
      summaryKey: 'aiAssistant.error.summaries.config',
      summaryFallback: '请检查 API Key、Base URL 和模型配置后重试。',
      retryable: true,
    };
  }

  if (
    /enotfound|econnrefused|econnreset|fetch failed|network|timeout|timed out|socket|unable to resolve|invalid url|failed to parse url|dns/.test(
      searchable,
    )
  ) {
    return {
      category: 'network',
      titleKey: 'aiAssistant.error.titles.network',
      titleFallback: '网络连接失败',
      summaryKey: 'aiAssistant.error.summaries.network',
      summaryFallback: '无法连接 AI 服务，请检查网络和 Base URL 后重试。',
      retryable: true,
    };
  }

  if (statusCode === 401 || /unauthorized|invalid api key|authentication/.test(searchable)) {
    return {
      category: 'auth',
      titleKey: 'aiAssistant.error.titles.auth',
      titleFallback: '鉴权失败',
      summaryKey: 'aiAssistant.error.summaries.auth',
      summaryFallback: 'API Key 无效，或当前账号未通过鉴权。',
      retryable: false,
    };
  }

  if (statusCode === 403 || /forbidden|permission denied|无权限/.test(searchable)) {
    return {
      category: 'permission',
      titleKey: 'aiAssistant.error.titles.permission',
      titleFallback: '无访问权限',
      summaryKey: 'aiAssistant.error.summaries.permission',
      summaryFallback: '当前账号没有访问该模型或接口的权限。',
      retryable: false,
    };
  }

  if (
    /404|model|not found|does not exist|unknown model|unsupported model|模型不存在|模型不可用/.test(
      searchable,
    )
  ) {
    return {
      category: 'model',
      titleKey: 'aiAssistant.error.titles.model',
      titleFallback: '模型不可用',
      summaryKey: 'aiAssistant.error.summaries.model',
      summaryFallback: '模型不存在或当前服务不支持该模型，请检查模型 ID。',
      retryable: false,
    };
  }

  if (statusCode === 429 || /rate limit|quota|too many requests|频率限制|额度/.test(searchable)) {
    return {
      category: 'rate-limit',
      titleKey: 'aiAssistant.error.titles.rate-limit',
      titleFallback: '请求频率或额度受限',
      summaryKey: 'aiAssistant.error.summaries.rate-limit',
      summaryFallback: '请求过于频繁或额度不足，请稍后再试。',
      retryable: true,
    };
  }

  if (
    (typeof statusCode === 'number' && statusCode >= 500) ||
    /500|502|503|504|internal server error|bad gateway|service unavailable/.test(searchable)
  ) {
    return {
      category: 'service',
      titleKey: 'aiAssistant.error.titles.service',
      titleFallback: 'AI 服务暂时不可用',
      summaryKey: 'aiAssistant.error.summaries.service',
      summaryFallback: '服务端暂时异常，请稍后重试。',
      retryable: true,
    };
  }

  return {
    category: 'unknown',
    titleKey: 'aiAssistant.error.titles.unknown',
    titleFallback: '请求失败',
    summaryKey: 'aiAssistant.error.summaries.unknown',
    summaryFallback: '请求失败，请稍后重试或查看错误详情。',
    retryable: true,
  };
}

function buildErrorDetail(
  extracted: ExtractedAiError,
  options: {
    createdAt: string;
    title: string;
    summary: string;
    categoryLabel: string;
    translate?: AiErrorTranslator;
  },
) {
  const { createdAt, title, summary, categoryLabel, translate } = options;
  const noneText = translateWithFallback(translate, 'aiAssistant.error.detail.none', '无');
  const yesText = translateWithFallback(translate, 'aiAssistant.error.detail.yes', '是');
  const noText = translateWithFallback(translate, 'aiAssistant.error.detail.no', '否');

  const sections: string[] = [
    translateWithFallback(translate, 'aiAssistant.error.detail.sections.time', '时间：{value}', {
      value: createdAt,
    }),
    translateWithFallback(
      translate,
      'aiAssistant.error.detail.sections.category',
      '分类：{value}',
      { value: `${title}（${categoryLabel}）` },
    ),
    translateWithFallback(translate, 'aiAssistant.error.detail.sections.summary', '简要：{value}', {
      value: summary,
    }),
    translateWithFallback(
      translate,
      'aiAssistant.error.detail.sections.rawMessage',
      '原始消息：{value}',
      { value: extracted.rawMessage || 'Unknown error' },
    ),
  ];

  if (typeof extracted.statusCode === 'number') {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.statusCode',
        'HTTP 状态码：{value}',
        { value: extracted.statusCode },
      ),
    );
  }

  if (extracted.code !== undefined) {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.code',
        '错误码：{value}',
        { value: String(extracted.code) },
      ),
    );
  }

  if (extracted.url) {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.requestUrl',
        '请求 URL：{value}',
        { value: extracted.url },
      ),
    );
  }

  if (extracted.model) {
    sections.push(
      translateWithFallback(translate, 'aiAssistant.error.detail.sections.model', '模型：{value}', {
        value: extracted.model,
      }),
    );
  }

  if (typeof extracted.isRetryable === 'boolean') {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.retryable',
        '服务端标记可重试：{value}',
        { value: extracted.isRetryable ? yesText : noText },
      ),
    );
  }

  if (extracted.responseBody) {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.responseBody',
        '响应体：\n{value}',
        { value: extracted.responseBody },
      ),
    );
  }

  if (extracted.data !== undefined && extracted.data !== null) {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.data',
        '错误数据：\n{value}',
        { value: safeJsonBlock(extracted.data, noneText) },
      ),
    );
  }

  if (extracted.responseHeaders !== undefined && extracted.responseHeaders !== null) {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.responseHeaders',
        '响应头：\n{value}',
        { value: safeJsonBlock(extracted.responseHeaders, noneText) },
      ),
    );
  }

  if (extracted.stack) {
    sections.push(
      translateWithFallback(
        translate,
        'aiAssistant.error.detail.sections.stack',
        '堆栈：\n{value}',
        { value: shorten(extracted.stack, 6000) },
      ),
    );
  }

  return sections.join('\n\n');
}

function getCategoryLabel(category: AiAssistantErrorCategory, translate?: AiErrorTranslator) {
  const mapped = AI_ERROR_CATEGORY_TRANSLATIONS[category] || AI_ERROR_CATEGORY_TRANSLATIONS.unknown;
  return translateWithFallback(translate, mapped.key, mapped.fallback);
}

export function normalizeAiErrorDetail(
  error: unknown,
  translate?: AiErrorTranslator,
): AiAssistantErrorInfo {
  const extracted = extractError(error);
  const classified = classifyError(extracted);
  const createdAt = new Date().toISOString();
  const title = translateWithFallback(translate, classified.titleKey, classified.titleFallback);
  const summary = translateWithFallback(
    translate,
    classified.summaryKey,
    classified.summaryFallback,
  );
  const categoryLabel = getCategoryLabel(classified.category, translate);

  return {
    id: createErrorId(),
    category: classified.category,
    title,
    summary,
    detail: buildErrorDetail(extracted, {
      createdAt,
      title,
      summary,
      categoryLabel,
      translate,
    }),
    createdAt,
    retryable: classified.retryable,
    ...(typeof extracted.statusCode === 'number' ? { statusCode: extracted.statusCode } : {}),
  };
}

export function normalizeAiError(error: unknown, translate?: AiErrorTranslator) {
  return normalizeAiErrorDetail(error, translate).summary;
}
