import type { UIMessage } from 'ai';

export interface AiAssistantRagSource {
  docId: string;
  fileName: string;
  snippet: string;
  chunkId: string;
}

export type AiAssistantErrorCategory =
  | 'abort'
  | 'config'
  | 'network'
  | 'auth'
  | 'permission'
  | 'region'
  | 'model'
  | 'rate-limit'
  | 'service'
  | 'unknown';

export interface AiAssistantErrorInfo {
  id: string;
  category: AiAssistantErrorCategory;
  title: string;
  summary: string;
  detail: string;
  createdAt: string;
  retryable: boolean;
  statusCode?: number;
}

export interface AiAssistantMessageMeta {
  createdAt: string;
  ragSources?: AiAssistantRagSource[];
  ragWarning?: string;
  error?: AiAssistantErrorInfo;
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
