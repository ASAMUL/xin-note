import { ipcMain } from 'electron';

import type {
  RagChunkInput,
  RagFtsSearchParams,
  RagHybridSearchParams,
  RagTableOptions,
  RagVectorSearchParams,
} from './schema';
import { ragFtsSearch, ragHybridSearch, ragVectorSearch } from './search';
import { ragAddChunks, ragDeleteByDocId, ragOptimize, ragRebuildDocChunks } from './write';
import { reindexNotesDirectory } from './notes-indexer';

const utf8Decoder = new TextDecoder();
const STRING_COLUMNS = new Set(['docid', 'chunkid', 'text', 'meta']);

function toIpcSafeString(value: unknown) {
  if (value == null) return value as any;
  if (typeof value === 'string') return value;

  // Some Arrow versions may expose Utf8 values as Uint8Array views.
  if (ArrayBuffer.isView(value)) {
    const v = value as ArrayBufferView;
    return utf8Decoder.decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  }
  if (value instanceof ArrayBuffer) {
    return utf8Decoder.decode(new Uint8Array(value));
  }

  return String(value);
}

function toIpcSafePrimitive(value: unknown) {
  // Electron IPC uses structured clone. Some values returned by Arrow/LanceDB
  // can fail to clone (e.g. BigInt or exotic objects). Convert aggressively.
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  // TypedArray / Buffer: convert to plain array to avoid clone edge cases.
  if (ArrayBuffer.isView(value)) return Array.from(value as any);
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));

  return value as any;
}

function pickColumns(row: any, cols: string[]) {
  const out: Record<string, any> = {};
  for (const k of cols) {
    const v = row?.[k];
    out[k] = STRING_COLUMNS.has(k) ? toIpcSafeString(v) : toIpcSafePrimitive(v);
  }
  return out;
}

export interface RagSearchRequestBase {
  options?: RagTableOptions;
  /** 查询超时（毫秒），默认 8000 */
  timeoutMs?: number;
}

export interface RagFtsSearchRequest extends RagFtsSearchParams, RagSearchRequestBase {}
export interface RagVectorSearchRequest extends RagVectorSearchParams, RagSearchRequestBase {}
export interface RagHybridSearchRequest extends RagHybridSearchParams, RagSearchRequestBase {}

export interface RagAddChunksRequest extends RagSearchRequestBase {
  chunks: RagChunkInput[];
}

export interface RagRebuildDocRequest extends RagSearchRequestBase {
  docId: string;
  chunks: RagChunkInput[];
}

export interface RagDeleteDocRequest extends RagSearchRequestBase {
  docId: string;
}

export interface RagReindexNotesRequest extends RagSearchRequestBase {
  notesDirectory: string;
  force?: boolean;
}

export function setupRagIpc() {
  // BM25 / FTS
  ipcMain.handle('rag:search-fts', async (_event, req: RagFtsSearchRequest) => {
    const options = req?.options || {};
    const timeoutMs = req?.timeoutMs ?? 8000;

    const select =
      Array.isArray(req?.select) && req.select.length > 0
        ? req.select
        : ['docid', 'chunkid', 'text', 'meta'];
    // LanceDB currently auto-projects `_score` in some cases and warns if it's not selected.
    // Select it for the query, but don't expose it to renderer unless explicitly requested.
    const lanceSelect = select.includes('_score') ? select : [...select, '_score'];

    const results = await ragFtsSearch(
      {
        query: req.query,
        limit: req.limit,
        docId: req.docId,
        select: lanceSelect,
      },
      options,
      { timeoutMs },
    );

    // Return a minimal, IPC-safe payload (avoid auto-projected columns like _score).
    return (Array.isArray(results) ? results : []).map((r: any) => pickColumns(r, select));
  });

  // Vector search (optional)
  ipcMain.handle('rag:search-vector', async (_event, req: RagVectorSearchRequest) => {
    const options = req?.options || {};
    const timeoutMs = req?.timeoutMs ?? 8000;

    const select =
      Array.isArray(req?.select) && req.select.length > 0
        ? req.select
        : ['docid', 'chunkid', 'text', 'meta', '_distance'];

    const results = await ragVectorSearch(
      {
        queryVector: req.queryVector,
        limit: req.limit,
        docId: req.docId,
        select,
        postfilter: req.postfilter,
      },
      options,
      { timeoutMs },
    );

    return (Array.isArray(results) ? results : []).map((r: any) => pickColumns(r, select));
  });

  // Hybrid: FTS + Vector + RRF (optional)
  ipcMain.handle('rag:search-hybrid', async (_event, req: RagHybridSearchRequest) => {
    const options = req?.options || {};
    const timeoutMs = req?.timeoutMs ?? 8000;

    const select =
      Array.isArray(req?.select) && req.select.length > 0
        ? req.select
        : ['docid', 'chunkid', 'text', 'meta', '_distance'];

    const results = await ragHybridSearch(
      {
        textQuery: req.textQuery,
        queryVector: req.queryVector,
        limit: req.limit,
        docId: req.docId,
        select,
        rrfK: req.rrfK,
      },
      options,
      { timeoutMs },
    );

    return (Array.isArray(results) ? results : []).map((r: any) => pickColumns(r, select));
  });

  // Batch add chunks
  ipcMain.handle('rag:add-chunks', async (_event, req: RagAddChunksRequest) => {
    const options = req?.options || {};
    return await ragAddChunks(req.chunks || [], options);
  });

  // Rebuild a single doc (delete + batch add)
  ipcMain.handle('rag:rebuild-doc', async (_event, req: RagRebuildDocRequest) => {
    const options = req?.options || {};
    return await ragRebuildDocChunks(req.docId, req.chunks || [], options);
  });

  ipcMain.handle('rag:delete-doc', async (_event, req: RagDeleteDocRequest) => {
    const options = req?.options || {};
    return await ragDeleteByDocId(req.docId, options);
  });

  // Optimize (may be slow)
  ipcMain.handle('rag:optimize', async (_event, req: RagSearchRequestBase) => {
    const options = req?.options || {};
    return await ragOptimize(options);
  });

  // Full reindex for all .md under notesDirectory
  ipcMain.handle('rag:reindex-notes', async (_event, req: RagReindexNotesRequest) => {
    const dir = (req?.notesDirectory || '').trim();
    if (!dir) {
      throw new Error('notesDirectory 不能为空');
    }

    return await reindexNotesDirectory(dir, {
      ...(req?.options || {}),
      force: !!req?.force,
    });
  });
}
