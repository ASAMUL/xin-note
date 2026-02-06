/**
 * AI Base URL 解析工具
 *
 * 约定：
 * - 用户在设置里填写的是「API 地址 / Base URL」，通常只是域名或网关地址（例如 https://api.deepseek.com）
 * - 请求 Chat Completions 时，默认会自动追加 API 版本（/v1），最终请求：`${base}/v1/chat/completions`
 * - 在末尾添加 `#` 可禁用自动追加版本（例如 https://example.com# → `${base}/chat/completions`）
 *
 * 注意：本工具只负责字符串规范化与派生 URL，不做网络请求。
 */

export interface ParsedAiBaseUrl {
  /**
   * 去掉 #、去掉末尾 /、去掉误填的 endpoint 后的 base URL
   */
  baseURL: string;
  /**
   * 是否禁用自动追加 /v1
   */
  disableAutoAppendV1: boolean;
}

const OPENAI_ENDPOINT_SUFFIXES = [
  '/v1/chat/completions',
  '/chat/completions',
  '/v1/completions',
  '/completions',
];

function stripTrailingSlashes(input: string) {
  return input.replace(/\/+$/, '');
}

function stripMisfilledEndpoint(baseURL: string) {
  let current = stripTrailingSlashes(baseURL);
  const lower = current.toLowerCase();

  for (const suffix of OPENAI_ENDPOINT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      current = current.slice(0, current.length - suffix.length);
      current = stripTrailingSlashes(current);
      break;
    }
  }

  return current;
}

export function parseAiBaseUrl(input?: string | null): ParsedAiBaseUrl {
  const raw = (input || '').trim();
  const disableAutoAppendV1 = raw.endsWith('#');
  const withoutHash = (disableAutoAppendV1 ? raw.slice(0, -1) : raw).trim();

  // 去掉末尾斜杠、以及常见“误填的 endpoint”
  const baseURL = stripMisfilledEndpoint(stripTrailingSlashes(withoutHash));

  return { baseURL, disableAutoAppendV1 };
}

/**
 * OpenAI / OpenAI-compatible 请求所需的 baseURL。
 * - 默认会自动追加 /api/v1（除非用户在末尾添加 #）
 * - 若用户已填到 /api/v1，则不会重复追加
 */
export function toOpenAiRequestBaseUrl(input?: string | null): string {
  const { baseURL, disableAutoAppendV1 } = parseAiBaseUrl(input);
  if (!baseURL) return '';
  if (disableAutoAppendV1) return baseURL;
  if (/\/api\/v1$/i.test(baseURL)) return baseURL;
  return `${baseURL}/api/v1`;
}

export function toOpenAiChatCompletionsUrl(input?: string | null): string {
  const base = toOpenAiRequestBaseUrl(input);
  if (!base) return '';
  return `${base}/chat/completions`;
}

export function toModelsListUrl(input?: string | null): string {
  const { baseURL } = parseAiBaseUrl(input);
  if (!baseURL) return '';
  return `${baseURL}/models`;
}
