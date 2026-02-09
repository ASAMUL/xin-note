import type { ResolvedAiModel } from '~/composables/ai/useAiGatewayModel';
import type { AiModelRole } from '~/composables/ai/useAiModelPoolSettings';

import { useAiGatewayModelWithOptions } from '~/composables/ai/useAiGatewayModel';
import { useAiModelPoolSettings } from '~/composables/ai/useAiModelPoolSettings';

const ROLE_LABEL: Record<AiModelRole, string> = {
  chat: '聊天',
  fast: '快速',
  completion: '补全',
};

function buildNotConfiguredResolved(message: string): ResolvedAiModel {
  return {
    provider: 'openai',
    modelId: '',
    providerModelId: '',
    isConfigured: false,
    model: null,
    warnings: [message],
  };
}

/**
 * 角色模型（chat/fast/completion）解析：
 * - 必须在“模型池”中存在且 enabled 才算可用
 * - 当未选择/未启用时，resolved.isConfigured=false，用于直接禁用入口
 */
export function useAiRoleModel(role: AiModelRole) {
  const { pool, aiChatModelId, aiFastModelId, aiCompletionModelId } = useAiModelPoolSettings();

  const selectedModelId = computed<string | null>(() => {
    if (role === 'chat') return aiChatModelId.value;
    if (role === 'fast') return aiFastModelId.value;
    return aiCompletionModelId.value;
  });

  const poolItem = computed(() => {
    const id = (selectedModelId.value || '').trim();
    if (!id) return null;
    return pool.value.find((m) => m.id === id) || null;
  });

  const modelId = computed<string | null>(() => {
    const id = (selectedModelId.value || '').trim();
    if (!id) return null;
    const it = poolItem.value;
    if (!it) return null;
    if (!it.enabled) return null;
    return id;
  });

  // 使用 gateway 解析逻辑复用供应商兼容/警告，但在 model 为空时走 strict，避免回退默认模型
  const gateway = useAiGatewayModelWithOptions({
    modelId: computed(() => modelId.value || ''),
    strictModel: true,
  });

  const resolved = computed<ResolvedAiModel>(() => {
    const label = ROLE_LABEL[role];
    const rawSelected = (selectedModelId.value || '').trim();

    if (!rawSelected) {
      return buildNotConfiguredResolved(`请在设置中启用并选择${label}模型。`);
    }

    const it = poolItem.value;
    if (!it) {
      return buildNotConfiguredResolved(`当前${label}模型不在模型池中，请先在“管理”里添加并启用。`);
    }

    if (!it.enabled) {
      return buildNotConfiguredResolved(`当前${label}模型已禁用，请在模型池启用后再使用。`);
    }

    return gateway.resolved.value;
  });

  return {
    role,
    aiApiKey: gateway.aiApiKey,
    aiBaseUrl: gateway.aiBaseUrl,
    modelId,
    resolved,
  };
}

