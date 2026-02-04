import { Field, Float32, Schema, Utf8 } from 'apache-arrow';

import type { IndexConfig, Table } from '@lancedb/lancedb';

import { getLanceDb, getRagDbConnection } from './db';
import {
  RAG_DEFAULT_TEXT_COLUMN,
  RAG_TABLE_NAME,
  type RagIndexOptions,
  type RagTableOptions,
} from './schema';

// Keep column names lowercase to avoid DataFusion identifier normalization / case sensitivity issues.
const RAG_DOC_ID_COLUMN = 'docid';
const RAG_CHUNK_ID_COLUMN = 'chunkid';

// Bump this when changing FTS options so we can rebuild the index without forcing a full table rebuild.
const RAG_FTS_INDEX_VERSION = 1;

// Default tokenizer "simple" is whitespace/punctuation-delimited and works poorly for CJK (no spaces).
// Use n-gram tokenization so substring queries (e.g. "都市风水电") can match inside long paragraphs.
const DEFAULT_FTS_OPTIONS = {
  baseTokenizer: 'ngram',
  ngramMinLength: 2,
  ngramMaxLength: 10,
  prefixOnly: false,
  lowercase: true,
  withPosition: true,
  removeStopWords: true,
} as const;

async function buildRagSchemaAsync(vectorDim?: number | null) {
  const fields: Field[] = [
    new Field(RAG_DOC_ID_COLUMN, new Utf8(), false),
    new Field(RAG_CHUNK_ID_COLUMN, new Utf8(), false),
    new Field(RAG_DEFAULT_TEXT_COLUMN, new Utf8(), false),
    new Field('meta', new Utf8(), true),
  ];
  //todo 向量索引暂时不用
  // if (vectorDim && vectorDim > 0) {
  //   const lancedb = await getLanceDb();
  //   const vectorType = lancedb.newVectorType(vectorDim, new Float32());
  //   fields.push(new Field('vector', vectorType, true));
  // }

  return new Schema(fields);
}

function indexNameOf(column: string) {
  return `${column}_idx`;
}

function ftsIndexNameOf(column: string) {
  return `${column}_fts_v${RAG_FTS_INDEX_VERSION}_idx`;
}

function hasIndex(indices: IndexConfig[], name: string) {
  return indices.some((idx) => idx?.name === name);
}

const tableCache = new Map<string, Promise<Table>>();

export async function openOrCreateRagTable(options: RagTableOptions = {}): Promise<Table> {
  const tableName = (options.tableName || RAG_TABLE_NAME).trim() || RAG_TABLE_NAME;
  const cacheKey = tableName;

  const cached = tableCache.get(cacheKey);
  if (cached) return await cached;

  const task = (async () => {
    const db = await getRagDbConnection();
    const schema = await buildRagSchemaAsync(options.vectorDim ?? null);

    // Prefer open; on missing table or legacy schema, recreate with the current schema.
    try {
      const table = await db.openTable(tableName);
      try {
        await assertRagTableSchema(table);
        return table;
      } catch {
        // Schema mismatch (e.g. older camelCase columns). Safe to recreate since data is rebuildable.
        try {
          await db.dropTable(tableName);
        } catch {
          // ignore
        }
        await db.createEmptyTable(tableName, schema, { mode: 'create', existOk: true });
        return await db.openTable(tableName);
      }
    } catch {
      // Table does not exist yet.
      await db.createEmptyTable(tableName, schema, { mode: 'create', existOk: true });
      return await db.openTable(tableName);
    }
  })();

  tableCache.set(cacheKey, task);

  try {
    return await task;
  } catch (e) {
    tableCache.delete(cacheKey);
    throw e;
  }
}

export async function ensureRagIndices(
  table: Table,
  options: RagIndexOptions & RagTableOptions = {},
): Promise<void> {
  const lancedb = await getLanceDb();

  const ensureFts = options.ensureFts ?? true;
  const ensureDocIdIndex = options.ensureDocIdIndex ?? true;
  const ftsColumn =
    (options.ftsColumn || RAG_DEFAULT_TEXT_COLUMN).trim() || RAG_DEFAULT_TEXT_COLUMN;

  const indices = await table.listIndices();

  const desiredDocIdIndexName = indexNameOf(RAG_DOC_ID_COLUMN);
  if (ensureDocIdIndex && !hasIndex(indices, desiredDocIdIndexName)) {
    await table.createIndex(RAG_DOC_ID_COLUMN, {
      name: desiredDocIdIndexName,
      replace: true,
      config: lancedb.Index.btree(),
    });
    await table.waitForIndex([desiredDocIdIndexName], 60);
  }

  const desiredFtsIndexName = ftsIndexNameOf(ftsColumn);
  if (ensureFts && !hasIndex(indices, desiredFtsIndexName)) {
    // Drop stale indices on the same column (e.g. older tokenizer configs) so the planner won't pick them.
    for (const idx of indices) {
      if (
        idx?.columns?.length === 1 &&
        idx.columns[0] === ftsColumn &&
        idx.name !== desiredFtsIndexName
      ) {
        try {
          await table.dropIndex(idx.name);
        } catch {
          // ignore
        }
      }
    }

    await table.createIndex(ftsColumn, {
      name: desiredFtsIndexName,
      replace: true,
      config: lancedb.Index.fts(DEFAULT_FTS_OPTIONS),
    });
    await table.waitForIndex([desiredFtsIndexName], 180);
  }
}

/**
 * 验证表结构是否满足最小字段要求
 * - 用于启动时调用前的快速 fail-fast
 */
export async function assertRagTableSchema(table: Table) {
  const schema = await table.schema();
  const names = new Set(schema.fields.map((f) => f.name));
  const required = [RAG_DOC_ID_COLUMN, RAG_CHUNK_ID_COLUMN, RAG_DEFAULT_TEXT_COLUMN, 'meta'];
  for (const col of required) {
    if (!names.has(col)) {
      throw new Error(`RAG 表缺少字段：${col}`);
    }
  }
}

/**
 * 当表被 overwrite / drop + recreate 时，清理缓存，确保后续 open 到最新实例
 */
export function invalidateRagTableCache(tableName?: string) {
  if (tableName) {
    tableCache.delete((tableName || '').trim() || RAG_TABLE_NAME);
    return;
  }
  tableCache.clear();
}
