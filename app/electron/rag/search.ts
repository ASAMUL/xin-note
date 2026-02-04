import type { Table } from '@lancedb/lancedb';

import { getLanceDb } from './db';
import { assertRagTableSchema, ensureRagIndices, openOrCreateRagTable } from './index';
import {
  RAG_DEFAULT_TEXT_COLUMN,
  type RagFtsSearchParams,
  type RagHybridSearchParams,
  type RagTableOptions,
  type RagVectorSearchParams,
} from './schema';
import { whereEqString } from './utils';

const RAG_DOC_ID_COLUMN = 'docid';
const RAG_CHUNK_ID_COLUMN = 'chunkid';

function clampLimit(raw: unknown, fallback: number, max: number) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function defaultSelectColumns() {
  return [RAG_DOC_ID_COLUMN, RAG_CHUNK_ID_COLUMN, RAG_DEFAULT_TEXT_COLUMN, 'meta'];
}

function normalizeSelect(select?: string[], extra?: string[]) {
  const base = (select && select.length > 0 ? select : defaultSelectColumns()).slice();
  const extras = extra || [];
  for (const col of extras) {
    if (!base.includes(col)) base.push(col);
  }
  return base;
}

async function getReadyTable(options: RagTableOptions = {}): Promise<Table> {
  const table = await openOrCreateRagTable(options);
  await assertRagTableSchema(table);
  await ensureRagIndices(table, { ...options, ensureFts: true, ensureDocIdIndex: true });
  return table;
}

const rrfRerankerCache = new Map<number, Promise<any>>();
async function getRrfReranker(k: number) {
  const kk = Number.isFinite(k) && k > 0 ? Math.floor(k) : 60;
  const cached = rrfRerankerCache.get(kk);
  if (cached) return await cached;
  const task = (async () => {
    const lancedb = await getLanceDb();
    return await lancedb.rerankers.RRFReranker.create(kk);
  })();
  rrfRerankerCache.set(kk, task);
  return await task;
}

export async function ragFtsSearch(
  params: RagFtsSearchParams,
  options: RagTableOptions = {},
  exec?: { timeoutMs?: number },
) {
  const query = (params?.query || '').trim();
  if (!query) return [];

  const table = await getReadyTable(options);
  const lancedb = await getLanceDb();

  const limit = clampLimit(params.limit, 20, 200);
  const ftsColumn =
    (options.ftsColumn || RAG_DEFAULT_TEXT_COLUMN).trim() || RAG_DEFAULT_TEXT_COLUMN;
  const operator = query.length <= 1 ? lancedb.Operator.Or : lancedb.Operator.And;
  const matchQuery = new lancedb.MatchQuery(query, ftsColumn, { operator });
  const q = table.query().fullTextSearch(matchQuery);
  if (params.docId) {
    q.where(whereEqString(RAG_DOC_ID_COLUMN, params.docId));
  }
  q.select(normalizeSelect(params.select));
  q.limit(limit);

  return await q.toArray(exec);
}

export async function ragVectorSearch(
  params: RagVectorSearchParams,
  options: RagTableOptions = {},
  exec?: { timeoutMs?: number },
) {
  const table = await getReadyTable(options);

  // fail-fast：没有 vector 列就不支持向量检索
  const schema = await table.schema();
  const hasVector = schema.fields.some((f) => f.name === 'vector');
  if (!hasVector) {
    throw new Error('当前 RAG 表未启用 vector 列，无法进行向量检索');
  }

  const limit = clampLimit(params.limit, 20, 200);

  let q = table.query().nearestTo(params.queryVector);
  if (params.docId) {
    q = q.where(whereEqString(RAG_DOC_ID_COLUMN, params.docId));
  }
  if (params.postfilter) {
    q = q.postfilter();
  }
  q.select(normalizeSelect(params.select, ['_distance']));
  q.limit(limit);

  return await q.toArray(exec);
}

export async function ragHybridSearch(
  params: RagHybridSearchParams,
  options: RagTableOptions = {},
  exec?: { timeoutMs?: number },
) {
  const textQuery = (params?.textQuery || '').trim();
  if (!textQuery) return [];

  const table = await getReadyTable(options);

  // fail-fast：没有 vector 列就不支持 hybrid
  const schema = await table.schema();
  const hasVector = schema.fields.some((f) => f.name === 'vector');
  if (!hasVector) {
    throw new Error('当前 RAG 表未启用 vector 列，无法进行 Hybrid Search');
  }

  const limit = clampLimit(params.limit, 20, 200);
  const ftsColumn =
    (options.ftsColumn || RAG_DEFAULT_TEXT_COLUMN).trim() || RAG_DEFAULT_TEXT_COLUMN;
  const reranker = await getRrfReranker(params.rrfK ?? 60);
  const lancedb = await getLanceDb();
  const operator = textQuery.length <= 1 ? lancedb.Operator.Or : lancedb.Operator.And;
  const matchQuery = new lancedb.MatchQuery(textQuery, ftsColumn, { operator });

  // Hybrid：FTS + Vector，再用 RRF 融合排名
  let q = table.query().fullTextSearch(matchQuery).nearestTo(params.queryVector).rerank(reranker);

  if (params.docId) {
    q = q.where(whereEqString(RAG_DOC_ID_COLUMN, params.docId));
  }

  q.select(normalizeSelect(params.select, ['_distance']));
  q.limit(limit);

  return await q.toArray(exec);
}
