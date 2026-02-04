/**
 * RAG 表结构与数据类型定义
 *
 * 约束：
 * - 当前不接入 embedding（不负责生成向量）；如需向量检索/Hybrid，需要由调用方传入 queryVector / chunk vector
 * - `meta` 使用 JSON 字符串存储，避免 Arrow Struct 结构频繁变化导致 schema 不稳定
 */

export const RAG_TABLE_NAME = 'rag_chunks';
export const RAG_DEFAULT_TEXT_COLUMN = 'text';

/**
 * 写入 LanceDB 的最小 chunk 结构
 *
 * 注意：字段名请使用全小写。
 * DataFusion 在解析 SQL-like predicate / index 相关逻辑时会对未引用的标识符做规范化，
 * 使用驼峰（如 docId）会在某些场景下被当成 docid，导致 “No field named docid” 之类错误。
 */
export interface RagChunkInput {
  docid: string;
  chunkid: string;
  text: string;
  /** JSON 字符串（可选） */
  meta?: string | null;
  /**
   * 可选向量（不负责生成）
   * - 若启用向量能力，建表时必须指定固定维度，并确保每条数据维度一致
   */
  vector?: number[] | Float32Array | null;
}

export interface RagTableOptions {
  tableName?: string;
  /**
   * 启用向量列时必须指定固定维度
   * - 为空表示仅启用 BM25/FTS
   */
  vectorDim?: number | null;
  /** BM25/FTS 使用的文本列名（默认 text） */
  ftsColumn?: string;
}

export interface RagIndexOptions {
  /** 创建/确保 FTS(BM25) 索引 */
  ensureFts?: boolean;
  /** 创建/确保 docid 的 scalar index（加速过滤/删除） */
  ensureDocIdIndex?: boolean;
}

export interface RagFtsSearchParams {
  query: string;
  limit?: number;
  /** 可选：只在某个 docId 内搜索（避免直接暴露 where SQL） */
  docId?: string;
  /** 返回列（默认不返回 vector） */
  select?: string[];
}

export interface RagVectorSearchParams {
  queryVector: number[] | Float32Array;
  limit?: number;
  docId?: string;
  select?: string[];
  /**
   * 是否启用后过滤（filter after vector search）
   * - 默认 false：预过滤（更符合直觉，但可能更慢）
   */
  postfilter?: boolean;
}

export interface RagHybridSearchParams {
  textQuery: string;
  queryVector: number[] | Float32Array;
  limit?: number;
  docId?: string;
  select?: string[];
  /** RRF reranker 的 k 参数（越大越平滑），默认 60 */
  rrfK?: number;
}

