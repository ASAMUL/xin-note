import fs from 'node:fs/promises';
import path from 'node:path';

import { Field, Schema, Utf8 } from 'apache-arrow';

import type { Connection, Table } from '@lancedb/lancedb';

import { chunkText, type ChunkOptions } from './chunk';
import { getRagDbConnection } from './db';
import { ensureRagIndices, invalidateRagTableCache } from './index';
import {
  RAG_DEFAULT_TEXT_COLUMN,
  RAG_TABLE_NAME,
  type RagChunkInput,
  type RagTableOptions,
} from './schema';

const RAG_DOC_ID_COLUMN = 'docid';
const RAG_CHUNK_ID_COLUMN = 'chunkid';

export interface ReindexNotesOptions extends RagTableOptions, ChunkOptions {
  force?: boolean;
  /** 最大索引文件数（用于保护；默认不限制） */
  maxFiles?: number;
  /** 跳过超大文件（字节），默认 5MB */
  maxFileSizeBytes?: number;
}

export interface ReindexNotesResult {
  ok: boolean;
  skipped?: boolean;
  notesDirectory: string;
  files: number;
  chunks: number;
  durationMs: number;
}

function isMarkdownFile(filePath: string) {
  return filePath.toLowerCase().endsWith('.md');
}

function shouldSkipDir(name: string) {
  const lower = name.toLowerCase();
  if (lower === 'assets') return true;
  if (lower === 'node_modules') return true;
  if (lower === '.git') return true;
  if (lower.startsWith('.')) return true;
  return false;
}

async function walkMarkdownFiles(rootDir: string): Promise<string[]> {
  const result: string[] = [];

  const visit = async (dir: string) => {
    let entries: Array<import('node:fs').Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (shouldSkipDir(ent.name)) continue;
        await visit(path.join(dir, ent.name));
        continue;
      }
      if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        result.push(path.join(dir, ent.name));
      }
    }
  };

  await visit(rootDir);
  return result;
}

function buildNotesSchema() {
  return new Schema([
    new Field(RAG_DOC_ID_COLUMN, new Utf8(), false),
    new Field(RAG_CHUNK_ID_COLUMN, new Utf8(), false),
    new Field(RAG_DEFAULT_TEXT_COLUMN, new Utf8(), false),
    new Field('meta', new Utf8(), true),
  ]);
}

export function buildRagChunksForDoc(
  docId: string,
  content: string,
  options: ChunkOptions = {},
): RagChunkInput[] {
  // Index even very small notes/sections (e.g. a short title) so they remain searchable.
  const chunks = chunkText(content || '', { minChunkSize: 1, ...options });
  const rows: RagChunkInput[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    rows.push({
      docid: docId,
      chunkid: `${i}`,
      text: c.text,
      meta: JSON.stringify({ start: c.start, end: c.end }),
    });
  }
  return rows;
}

async function createOrOverwriteNotesTable(
  db: Connection,
  tableName: string,
  rows: RagChunkInput[],
): Promise<Table> {
  const schema = buildNotesSchema();

  // createTable 需要非空数据；空数据用 createEmptyTable
  if (rows.length > 0) {
    return await db.createTable(tableName, rows, { mode: 'overwrite', schema });
  }

  // overwrite：确保不存在旧表/旧 schema 遗留
  return await db.createEmptyTable(tableName, schema, { mode: 'overwrite' });
}

let lastIndexedDir: string | null = null;
let lastIndexedOk = false;
let inflightDir: string | null = null;
let inflightPromise: Promise<ReindexNotesResult> | null = null;

/**
 * 对 notesDirectory 下的所有 Markdown 做全量索引（BM25 / FTS）
 * - 采用 overwrite 方式一次性重建表，避免逐文件逐行频繁写 DB
 * - 不接入 embedding
 */
export async function reindexNotesDirectory(
  notesDirectory: string,
  options: ReindexNotesOptions = {},
): Promise<ReindexNotesResult> {
  const startedAt = Date.now();
  const root = path.resolve((notesDirectory || '').trim());
  if (!root) {
    throw new Error('notesDirectory 不能为空');
  }

  if (!options.force && lastIndexedOk && lastIndexedDir === root) {
    return {
      ok: true,
      skipped: true,
      notesDirectory: root,
      files: 0,
      chunks: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // 同目录并发调用：复用同一个 promise
  if (inflightDir === root && inflightPromise) {
    return await inflightPromise;
  }

  inflightDir = root;
  inflightPromise = (async () => {
    const stat = await fs.stat(root).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      throw new Error('notesDirectory 不存在或不是目录');
    }

    const tableName = (options.tableName || RAG_TABLE_NAME).trim() || RAG_TABLE_NAME;
    const maxFileSizeBytes = Math.max(64 * 1024, options.maxFileSizeBytes ?? 5 * 1024 * 1024);
    const maxFiles = options.maxFiles && options.maxFiles > 0 ? Math.floor(options.maxFiles) : null;

    const files = await walkMarkdownFiles(root);
    const targetFiles = maxFiles ? files.slice(0, maxFiles) : files;

    const rows: RagChunkInput[] = [];
    for (const filePath of targetFiles) {
      if (!isMarkdownFile(filePath)) continue;

      const st = await fs.stat(filePath).catch(() => null);
      if (!st || !st.isFile()) continue;
      if (st.size > maxFileSizeBytes) continue;

      const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
      if (!content) continue;

      rows.push(...buildRagChunksForDoc(filePath, content, options));
    }

    const db = await getRagDbConnection();
    const table = await createOrOverwriteNotesTable(db, tableName, rows);

    // 索引：docid 加速过滤/删除；text 建 BM25
    await ensureRagIndices(table, {
      tableName,
      ftsColumn: RAG_DEFAULT_TEXT_COLUMN,
      ensureFts: true,
      ensureDocIdIndex: true,
    });

    // overwrite 会导致旧 table 实例可能陈旧，清理缓存确保后续 open 到最新
    invalidateRagTableCache(tableName);

    const durationMs = Date.now() - startedAt;
    const res: ReindexNotesResult = {
      ok: true,
      notesDirectory: root,
      files: targetFiles.length,
      chunks: rows.length,
      durationMs,
    };

    lastIndexedDir = root;
    lastIndexedOk = true;

    return res;
  })().finally(() => {
    inflightDir = null;
    inflightPromise = null;
  });

  return await inflightPromise;
}
