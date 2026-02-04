import fs from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';

type LanceDbModule = typeof import('@lancedb/lancedb');

let lanceDbModulePromise: Promise<LanceDbModule> | null = null;
export async function getLanceDb(): Promise<LanceDbModule> {
  if (!lanceDbModulePromise) {
    // 懒加载：减少冷启动耗时与内存
    lanceDbModulePromise = import('@lancedb/lancedb');
  }
  return await lanceDbModulePromise;
}

function parseEnvInt(name: string): number | null {
  const raw = (process.env[name] || '').trim();
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

function mbToBytesBigInt(mb: number): bigint {
  return BigInt(mb) * 1024n * 1024n;
}

export interface RagDbRuntimeOptions {
  /**
   * LanceDB 本地目录（默认：{userData}/lancedb）
   * - 建议放 userData：与应用生命周期绑定，避免污染笔记目录
   */
  dbDir?: string;
  /**
   * Index cache 大小（字节）
   * - LanceDB 默认 session cache 很大（索引 6GB + 元数据 1GB），离线笔记场景可显著调小
   */
  indexCacheSizeBytes?: bigint;
  /** Metadata cache 大小（字节） */
  metadataCacheSizeBytes?: bigint;
}

export function getDefaultRagDbDir(): string {
  return path.join(app.getPath('userData'), 'lancedb');
}

let connection: import('@lancedb/lancedb').Connection | null = null;
let connectionPromise: Promise<import('@lancedb/lancedb').Connection> | null = null;

export async function getRagDbConnection(
  options: RagDbRuntimeOptions = {},
): Promise<import('@lancedb/lancedb').Connection> {
  if (connection) return connection;
  if (connectionPromise) return await connectionPromise;

  connectionPromise = (async () => {
    const lancedb = await getLanceDb();

    const dbDir = options.dbDir || getDefaultRagDbDir();
    await fs.mkdir(dbDir, { recursive: true });

    // 可通过环境变量覆盖（便于调试/压测）
    const envIndexMb = parseEnvInt('RAG_LANCEDB_INDEX_CACHE_MB');
    const envMetaMb = parseEnvInt('RAG_LANCEDB_METADATA_CACHE_MB');

    const indexCacheSizeBytes =
      options.indexCacheSizeBytes ??
      (envIndexMb ? mbToBytesBigInt(envIndexMb) : mbToBytesBigInt(256));

    const metadataCacheSizeBytes =
      options.metadataCacheSizeBytes ??
      (envMetaMb ? mbToBytesBigInt(envMetaMb) : mbToBytesBigInt(64));

    const session = new lancedb.Session(indexCacheSizeBytes, metadataCacheSizeBytes);

    const conn = await lancedb.connect({
      uri: dbDir,
      session,
      // 单进程离线模式：不需要定期一致性检查（性能更好）
      // readConsistencyInterval: 0,
    });

    connection = conn;
    return conn;
  })().finally(() => {
    connectionPromise = null;
  });

  return await connectionPromise;
}

export async function closeRagDbConnection() {
  try {
    connection?.close();
  } finally {
    connection = null;
    connectionPromise = null;
  }
}
