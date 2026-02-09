import type { AiModelPoolItem } from '~/composables/useSettings';

export type AiModelRole = 'chat' | 'fast' | 'completion';

function normalizeModelId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v : null;
}

function dedupePool(items: AiModelPoolItem[]): AiModelPoolItem[] {
  const seen = new Set<string>();
  const out: AiModelPoolItem[] = [];
  for (const it of items) {
    const id = normalizeModelId(it?.id);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, enabled: !!it.enabled });
  }
  return out;
}

export function useAiModelPoolSettings() {
  const {
    aiModelsPool,
    aiChatModelId,
    aiFastModelId,
    aiCompletionModelId,
    patchSettings,
  } = useSettings();

  const pool = computed<AiModelPoolItem[]>(() => Array.isArray(aiModelsPool.value) ? aiModelsPool.value : []);

  const enabledModelIds = computed(() =>
    pool.value.filter((m) => m.enabled).map((m) => m.id),
  );

  const poolModelIds = computed(() => pool.value.map((m) => m.id));

  const isModelEnabled = (modelId: string) => {
    const id = normalizeModelId(modelId);
    if (!id) return false;
    return pool.value.some((m) => m.id === id && m.enabled);
  };

  const addToPool = async (modelId: string) => {
    const id = normalizeModelId(modelId);
    if (!id) return false;

    const current = pool.value;
    const existing = current.find((m) => m.id === id);
    if (existing) {
      if (existing.enabled) return true;
      const nextPool = current.map((m) => (m.id === id ? { ...m, enabled: true } : m));
      await patchSettings({ aiModelsPool: dedupePool(nextPool) });
      return true;
    }

    const nextPool = dedupePool([...current, { id, enabled: true }]);
    await patchSettings({ aiModelsPool: nextPool });
    return true;
  };

  const setEnabled = async (modelId: string, enabled: boolean) => {
    const id = normalizeModelId(modelId);
    if (!id) return false;

    const current = pool.value;
    const existing = current.find((m) => m.id === id);
    if (!existing) return false;

    const nextPool = current.map((m) => (m.id === id ? { ...m, enabled } : m));

    // 若禁用且被任一角色选中，则清空对应角色选择（入口将随之禁用）
    const nextChat = !enabled && aiChatModelId.value === id ? null : aiChatModelId.value;
    const nextFast = !enabled && aiFastModelId.value === id ? null : aiFastModelId.value;
    const nextCompletion =
      !enabled && aiCompletionModelId.value === id ? null : aiCompletionModelId.value;

    await patchSettings({
      aiModelsPool: dedupePool(nextPool),
      aiChatModelId: nextChat,
      aiFastModelId: nextFast,
      aiCompletionModelId: nextCompletion,
    });
    return true;
  };

  const removeFromPool = async (modelId: string) => {
    const id = normalizeModelId(modelId);
    if (!id) return false;

    const current = pool.value;
    if (!current.some((m) => m.id === id)) return false;

    const nextPool = current.filter((m) => m.id !== id);

    const nextChat = aiChatModelId.value === id ? null : aiChatModelId.value;
    const nextFast = aiFastModelId.value === id ? null : aiFastModelId.value;
    const nextCompletion = aiCompletionModelId.value === id ? null : aiCompletionModelId.value;

    await patchSettings({
      aiModelsPool: dedupePool(nextPool),
      aiChatModelId: nextChat,
      aiFastModelId: nextFast,
      aiCompletionModelId: nextCompletion,
    });
    return true;
  };

  const setRoleModel = async (role: AiModelRole, modelId: string | null) => {
    const id = modelId === null ? null : normalizeModelId(modelId);
    if (modelId !== null && !id) return false;

    if (id && !isModelEnabled(id)) {
      // 只允许选择“已启用”的模型
      return false;
    }

    if (role === 'chat') {
      await patchSettings({ aiChatModelId: id });
      return true;
    }
    if (role === 'fast') {
      await patchSettings({ aiFastModelId: id });
      return true;
    }
    if (role === 'completion') {
      await patchSettings({ aiCompletionModelId: id });
      return true;
    }
    return false;
  };

  return {
    pool,
    poolModelIds,
    enabledModelIds,
    aiChatModelId,
    aiFastModelId,
    aiCompletionModelId,
    addToPool,
    setEnabled,
    removeFromPool,
    setRoleModel,
    isModelEnabled,
  };
}

