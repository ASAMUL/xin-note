/**
 * 获取模型列表（通过 Electron 主进程代理请求）
 *
 * - 走 `ipcRenderer.invoke('ai:models-list', ...)`，避免 CORS，且减少 renderer 暴露
 * - 返回 string[]，每项为模型 id（通常来自 OpenAI-compatible 的 /models）
 */

export interface AiModelsListParams {
  baseURL: string;
  apiKey: string | null;
}

function serializeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e || 'Unknown error');
}

export function useAiModelsList() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const models = ref<string[]>([]);

  const listModels = async (params: AiModelsListParams) => {
    if (!window.ipcRenderer) {
      const msg = '当前环境不支持获取模型列表';
      error.value = msg;
      throw new Error(msg);
    }

    isLoading.value = true;
    error.value = null;
    try {
      const result = (await window.ipcRenderer.invoke('ai:models-list', {
        baseURL: params.baseURL,
        apiKey: params.apiKey,
      })) as unknown;

      const list = Array.isArray(result) ? (result as string[]) : [];
      models.value = list;
      return list;
    } catch (e) {
      const msg = serializeError(e);
      error.value = msg;
      models.value = [];
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  };

  return {
    isLoading,
    error,
    models,
    listModels,
  };
}
