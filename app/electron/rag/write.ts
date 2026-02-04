import type { Table } from '@lancedb/lancedb';

import { assertRagTableSchema, ensureRagIndices, openOrCreateRagTable } from './index';
import type { RagChunkInput, RagTableOptions } from './schema';
import { escapeSqlString, whereEqString } from './utils';

const MAX_CHUNKS_PER_WRITE = 20_000;
const RAG_DOC_ID_COLUMN = 'docid';

function normalizeChunkRows(chunks: RagChunkInput[], hasVector: boolean) {
  // 统一字段名，避免 schema 推断不稳定（同时适配表字段全小写）
  return (chunks || []).map((c) => ({
    docid: String(c.docid || ''),
    chunkid: String(c.chunkid || ''),
    text: String(c.text || ''),
    meta: c.meta == null ? null : String(c.meta),
    ...(hasVector && c.vector != null ? { vector: c.vector } : {}),
  }));
}

async function getReadyTable(options: RagTableOptions = {}): Promise<Table> {
  const table = await openOrCreateRagTable(options);
  await assertRagTableSchema(table);
  await ensureRagIndices(table, { ...options, ensureFts: true, ensureDocIdIndex: true });
  return table;
}

export async function ragDeleteByDocId(docId: string, options: RagTableOptions = {}) {
  const id = (docId || '').trim();
  if (!id) return null;

  const table = await getReadyTable(options);
  return await table.delete(whereEqString(RAG_DOC_ID_COLUMN, id));
}

/**
 * 重建某个 doc 的所有 chunks
 * - 先 delete(docid=...) 再批量 add
 * - 避免循环逐条写入
 */
export async function ragRebuildDocChunks(
  docId: string,
  chunks: RagChunkInput[],
  options: RagTableOptions = {},
) {
  const id = (docId || '').trim();
  if (!id) throw new Error('docId 不能为空');
  if ((chunks?.length || 0) > MAX_CHUNKS_PER_WRITE) {
    throw new Error(`单次重建 chunks 过多（>${MAX_CHUNKS_PER_WRITE}），请拆分后再写入`);
  }

  const table = await getReadyTable(options);
  const schema = await table.schema();
  const hasVector = schema.fields.some((f) => f.name === 'vector');

  // 先删除旧数据（批量）
  await table.delete(whereEqString(RAG_DOC_ID_COLUMN, id));

  // 再写入新数据（批量）
  const rows = normalizeChunkRows(chunks, hasVector).filter((r) => r.docid && r.chunkid && r.text);
  if (rows.length > 0) {
    await table.add(rows);
  }

  return { ok: true, inserted: rows.length };
}

/**
 * 批量写入 chunks（append）
 */
export async function ragAddChunks(chunks: RagChunkInput[], options: RagTableOptions = {}) {
  if ((chunks?.length || 0) > MAX_CHUNKS_PER_WRITE) {
    throw new Error(`单次写入 chunks 过多（>${MAX_CHUNKS_PER_WRITE}），请拆分后再写入`);
  }

  const table = await getReadyTable(options);
  const schema = await table.schema();
  const hasVector = schema.fields.some((f) => f.name === 'vector');

  const rows = normalizeChunkRows(chunks, hasVector).filter((r) => r.docid && r.chunkid && r.text);
  if (rows.length === 0) return { ok: true, inserted: 0 };

  await table.add(rows);
  return { ok: true, inserted: rows.length };
}

/**
 * 清理/优化（类似 vacuum）
 * - 在大量写入/删除后调用可让索引覆盖未索引数据并减少碎片
 */
export async function ragOptimize(options: RagTableOptions = {}) {
  const table = await getReadyTable(options);
  return await table.optimize();
}

/**
 * 安全提示：不要把用户输入直接拼进 where。
 * 这里只给出一个最小工具函数（当前仅用于内部 docId 拼接）。
 *
 * @deprecated 尽量使用 whereEqString 等限定拼接方式
 */
export function unsafeWhereLiteral(value: string) {
  return `'${escapeSqlString(value)}'`;
}

