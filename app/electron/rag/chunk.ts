/**
 * Markdown/文本分块工具（纯函数）
 *
 * 目标：
 * - 用于 BM25/FTS 检索：把单个 markdown 文件拆成多个 chunk，提升召回质量与 snippet 展示体验
 * - 不依赖 embedding
 */

export interface TextChunk {
  text: string;
  start: number;
  end: number;
}

export interface ChunkOptions {
  /** 每个 chunk 的最大字符数（默认 800） */
  chunkSize?: number;
  /** chunk 之间的重叠字符数（默认 120） */
  overlap?: number;
  /** 最小 chunk 字符数（默认 80），太短的 chunk 会被丢弃 */
  minChunkSize?: number;
}

export function chunkText(input: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = Math.max(200, Math.floor(options.chunkSize ?? 800));
  const overlap = Math.max(0, Math.min(Math.floor(options.overlap ?? 120), chunkSize - 50));
  const minChunkSize = Math.max(1, Math.floor(options.minChunkSize ?? 80));

  const text = (input || '').replace(/\r\n/g, '\n');
  const len = text.length;
  if (!len) return [];

  const chunks: TextChunk[] = [];

  let pos = 0;
  while (pos < len) {
    const tentativeEnd = Math.min(len, pos + chunkSize);
    let end = tentativeEnd;

    // 尽量在段落/换行处截断，避免把一句话/标题切开
    // 在尾部 220 字符的窗口内寻找最后一个换行/空格
    const windowStart = Math.max(pos + Math.floor(chunkSize * 0.5), tentativeEnd - 220);
    const slice = text.slice(windowStart, tentativeEnd);
    const lastNewline = slice.lastIndexOf('\n');
    if (lastNewline >= 0) {
      end = windowStart + lastNewline + 1;
    } else {
      const lastSpace = slice.lastIndexOf(' ');
      if (lastSpace >= 0) {
        end = windowStart + lastSpace + 1;
      }
    }

    // 兜底：避免卡住（end 必须前进）
    if (end <= pos) {
      end = tentativeEnd;
    }

    const raw = text.slice(pos, end);
    const trimmed = raw.trim();
    if (trimmed.length >= minChunkSize) {
      chunks.push({ text: trimmed, start: pos, end });
    }

    if (end >= len) break;

    const nextPos = Math.max(pos + 1, end - overlap);
    pos = nextPos;
  }

  return chunks;
}
