import type { AiAssistantRagSource } from '~/types/ai-assistant';

import { useSettings } from '~/composables/useSettings';

interface RagFtsRow {
  docid: string;
  chunkid: string;
  text: string;
  meta?: string | null;
}

export interface AiAssistantRagResult {
  contextText: string;
  sources: AiAssistantRagSource[];
  warning?: string;
}

const DEFAULT_SEARCH_LIMIT = 6;
const DEFAULT_SNIPPET_LENGTH = 260;

let indexedDir: string | null = null;
let indexingDir: string | null = null;
let indexingPromise: Promise<void> | null = null;

function normalizeQueryText(text: string) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function fileNameFromPath(filePath: string) {
  const normalized = (filePath || '').replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}

function buildSnippet(rawText: string, query: string, maxLen = DEFAULT_SNIPPET_LENGTH) {
  const text = normalizeQueryText(rawText);
  const search = normalizeQueryText(query);
  if (!text) return '';
  if (!search) return text.slice(0, maxLen);

  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);

  if (index < 0) {
    return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
  }

  const before = 80;
  const after = 140;
  const start = Math.max(0, index - before);
  const end = Math.min(text.length, index + lowerSearch.length + after);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function buildContextText(sources: AiAssistantRagSource[]) {
  if (sources.length === 0) return '';

  return sources
    .map(
      (source, index) =>
        `【参考 ${index + 1}】\n文件: ${source.fileName}\n路径: ${source.docId}\n片段: ${source.snippet}`,
    )
    .join('\n\n');
}

function toSources(rows: RagFtsRow[], query: string) {
  const dedupe = new Set<string>();
  const sources: AiAssistantRagSource[] = [];

  for (const row of rows) {
    const docId = (row?.docid || '').trim();
    const chunkId = (row?.chunkid || '').trim();
    const text = row?.text || '';
    if (!docId || !chunkId || !text) continue;

    const key = `${docId}::${chunkId}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    sources.push({
      docId,
      fileName: fileNameFromPath(docId),
      snippet: buildSnippet(text, query),
      chunkId,
    });
  }

  return sources;
}

async function ensureIndexed(notesDirectory: string) {
  const normalizedDir = (notesDirectory || '').trim();
  if (!normalizedDir) return;

  if (indexedDir === normalizedDir) return;

  if (indexingDir === normalizedDir && indexingPromise) {
    await indexingPromise;
    indexedDir = normalizedDir;
    return;
  }

  indexingDir = normalizedDir;
  indexingPromise = (async () => {
    await window.ipcRenderer.invoke('rag:reindex-notes', {
      notesDirectory: normalizedDir,
      force: false,
      timeoutMs: 8000,
    });
    indexedDir = normalizedDir;
  })().finally(() => {
    indexingDir = null;
    indexingPromise = null;
  });

  await indexingPromise;
}

export function useAiAssistantRag() {
  const { notesDirectory } = useSettings();

  const searchNotes = async (queryText: string, limit = DEFAULT_SEARCH_LIMIT): Promise<AiAssistantRagResult> => {
    const query = (queryText || '').trim();
    if (!query) {
      return {
        contextText: '',
        sources: [],
      };
    }

    if (!window.ipcRenderer) {
      return {
        contextText: '',
        sources: [],
        warning: '当前环境缺少 ipcRenderer，已跳过笔记检索。',
      };
    }

    const dir = (notesDirectory.value || '').trim();
    if (!dir) {
      return {
        contextText: '',
        sources: [],
        warning: '尚未设置笔记目录，已跳过笔记检索。',
      };
    }

    try {
      await ensureIndexed(dir);

      const rows = (await window.ipcRenderer.invoke('rag:search-fts', {
        query,
        limit: Math.max(1, Math.min(Math.floor(limit || DEFAULT_SEARCH_LIMIT), 12)),
        timeoutMs: 8000,
        select: ['docid', 'chunkid', 'text', 'meta'],
      })) as RagFtsRow[];

      const sources = toSources(Array.isArray(rows) ? rows : [], query);
      return {
        contextText: buildContextText(sources),
        sources,
      };
    } catch (error) {
      return {
        contextText: '',
        sources: [],
        warning: `笔记检索失败，已自动降级为普通对话：${
          error instanceof Error ? error.message : String(error || '未知错误')
        }`,
      };
    }
  };

  return {
    searchNotes,
  };
}
