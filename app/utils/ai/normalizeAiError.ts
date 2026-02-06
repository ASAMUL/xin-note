function toRawMessage(error: unknown) {
  if (error instanceof Error) return error.message || String(error);
  return String(error || 'Unknown error');
}

function shorten(text: string, max = 200) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export function normalizeAiError(error: unknown) {
  const raw = toRawMessage(error).trim();
  const message = raw.toLowerCase();

  if (!raw) {
    return '请求失败：未知错误。请检查 AI 配置后重试。';
  }

  if (message.includes('abort')) {
    return '已停止本次生成。';
  }

  if (
    /enotfound|econnrefused|econnreset|fetch failed|network|timeout|timed out|socket|unable to resolve|invalid url|failed to parse url/.test(
      message,
    )
  ) {
    return `请求失败：无法连接到 AI 服务，请检查 Base URL 和网络连接。\n\n原始错误：${shorten(raw)}`;
  }

  if (/401|403|unauthorized|forbidden|invalid api key|authentication/.test(message)) {
    return `请求失败：API Key 无效或无权限访问该服务。\n\n原始错误：${shorten(raw)}`;
  }

  if (/404|model|not found|does not exist|unknown model/.test(message)) {
    return `请求失败：模型不存在或当前服务不支持该模型，请检查模型名。\n\n原始错误：${shorten(raw)}`;
  }

  if (/429|rate limit|quota|too many requests/.test(message)) {
    return `请求失败：请求过于频繁或额度不足，请稍后再试。\n\n原始错误：${shorten(raw)}`;
  }

  if (/500|502|503|504|internal server error|bad gateway|service unavailable/.test(message)) {
    return `请求失败：AI 服务暂时不可用，请稍后重试。\n\n原始错误：${shorten(raw)}`;
  }

  return `请求失败：${shorten(raw)}`;
}
