import type { AiAssistantErrorInfo } from '~/types/ai-assistant';

const MAX_ERROR_LOGS = 200;

export function useAiAssistantErrorLog() {
  const errorLogs = useState<AiAssistantErrorInfo[]>('ai-assistant:error-logs', () => []);

  const pushErrorLog = (entry: AiAssistantErrorInfo) => {
    errorLogs.value = [entry, ...errorLogs.value].slice(0, MAX_ERROR_LOGS);
  };

  const getErrorLogById = (id: string | null | undefined) => {
    if (!id) return null;
    return errorLogs.value.find((item) => item.id === id) || null;
  };

  const clearErrorLogs = () => {
    errorLogs.value = [];
  };

  return {
    errorLogs,
    pushErrorLog,
    getErrorLogById,
    clearErrorLogs,
  };
}
