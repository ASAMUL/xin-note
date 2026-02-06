import type { UIMessage } from 'ai';

export interface AiAssistantRagSource {
  docId: string;
  fileName: string;
  snippet: string;
  chunkId: string;
}

export interface AiAssistantMessageMeta {
  createdAt: string;
  ragSources?: AiAssistantRagSource[];
  ragWarning?: string;
}

export type AiAssistantMessage = UIMessage<AiAssistantMessageMeta>;

export interface AiAssistantSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AiAssistantMessage[];
}

export type AiAssistantSessionGroupKey = 'today' | 'yesterday' | 'earlier';

export interface AiAssistantSessionGroup {
  key: AiAssistantSessionGroupKey;
  label: string;
  sessions: AiAssistantSession[];
}
