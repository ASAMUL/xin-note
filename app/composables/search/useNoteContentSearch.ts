import { refDebounced } from '@vueuse/core';

export interface NoteContentSearchHit {
  /** 绝对路径（用于打开文件） */
  path: string;
  /** 文件名（含 .md） */
  name: string;
  /** 命中的片段（用于 CommandPalette 展示） */
  snippet: string;
  /** 命中的 chunkid（目前仅用于调试） */
  chunkId: string;
}

type RagFtsRow = {
  docid: string;
  chunkid: string;
  text: string;
  meta?: string | null;
};

const RAG_DOC_ID_COLUMN = 'docid';
const RAG_CHUNK_ID_COLUMN = 'chunkid';

function normalizeForSearch(text: string) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function buildSnippet(text: string, query: string, maxLen = 180) {
  const t = normalizeForSearch(text);
  const q = normalizeForSearch(query);
  if (!t) return '';
  if (!q) return t.slice(0, maxLen);

  const lowerT = t.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerT.indexOf(lowerQ);

  if (idx < 0) {
    return t.length > maxLen ? `${t.slice(0, maxLen)}...` : t;
  }

  const before = 60;
  const after = 90;
  const start = Math.max(0, idx - before);
  const end = Math.min(t.length, idx + lowerQ.length + after);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < t.length ? '...' : '';
  return `${prefix}${t.slice(start, end)}${suffix}`;
}

function fileNameFromPath(p: string) {
  const norm = (p || '').replace(/\\/g, '/');
  return norm.split('/').pop() || norm;
}

export function useNoteContentSearch(input: {
  searchTerm: Ref<string>;
  notesDirectory: Readonly<Ref<string | null>>;
  /** 搜索返回条数（去重前），默认 50 */
  limit?: number;
  /** 输入去抖（毫秒），默认 250 */
  debounceMs?: number;
}) {
  const results = ref<NoteContentSearchHit[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // 只在“有输入”时才触发搜索，避免每次按键都 IPC
  const debouncedSearchTerm = refDebounced(input.searchTerm, input.debounceMs ?? 250);

  // 记录索引是否对当前 notesDirectory 就绪（避免每次搜索都重建）
  const indexedDir = ref<string | null>(null);
  const indexingDir = ref<string | null>(null);
  let indexingPromise: Promise<unknown> | null = null;

  async function ensureIndexed(dir: string) {
    if (!window.ipcRenderer) throw new Error('ipcRenderer 不可用');

    if (indexedDir.value === dir) return;

    // 同一目录的并发索引：复用同一个 promise
    if (indexingDir.value === dir && indexingPromise) {
      await indexingPromise;
      indexedDir.value = dir;
      return;
    }

    indexingDir.value = dir;
    indexingPromise = window.ipcRenderer.invoke('rag:reindex-notes', {
      notesDirectory: dir,
      force: false,
    });

    try {
      await indexingPromise;
      indexedDir.value = dir;
    } finally {
      indexingPromise = null;
      indexingDir.value = null;
    }
  }

  let seq = 0;
  watch(
    [debouncedSearchTerm, input.notesDirectory],
    async ([qRaw, dir]) => {
      const q = (qRaw || '').trim();

      if (!q || !dir) {
        results.value = [];
        loading.value = false;
        error.value = null;
        return;
      }

      if (!window.ipcRenderer) {
        results.value = [];
        loading.value = false;
        error.value = 'ipcRenderer 不可用';
        return;
      }

      const current = ++seq;
      loading.value = true;
      error.value = null;

      try {
        await ensureIndexed(dir);
        if (current !== seq) return;

        const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 50), 100));
        const rows = (await window.ipcRenderer.invoke('rag:search-fts', {
          query: q,
          limit,
          timeoutMs: 8000,
          select: [RAG_DOC_ID_COLUMN, RAG_CHUNK_ID_COLUMN, 'text', 'meta'],
        })) as RagFtsRow[];

        if (current !== seq) return;

        // docId 去重：同一文件多个 chunk 只展示第一条（BM25 排序里通常是最相关）
        const seen = new Set<string>();
        const hits: NoteContentSearchHit[] = [];
        for (const row of Array.isArray(rows) ? rows : []) {
          const docId = row?.docid;
          if (!docId || seen.has(docId)) continue;
          seen.add(docId);
          hits.push({
            path: docId,
            name: fileNameFromPath(docId),
            snippet: buildSnippet(row?.text || '', q),
            chunkId: String(row?.chunkid || ''),
          });
        }

        results.value = hits;
      } catch (e: any) {
        if (current !== seq) return;
        results.value = [];
        error.value = e instanceof Error ? e.message : String(e || 'Unknown error');
      } finally {
        if (current === seq) {
          loading.value = false;
        }
      }
    },
    { immediate: true },
  );

  return {
    results: computed(() => results.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
  };
}

