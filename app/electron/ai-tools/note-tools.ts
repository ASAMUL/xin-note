import { app } from 'electron';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type {
  AppendContentInput,
  CreateNoteInput,
  GetNoteInput,
  GetNoteOutput,
  SearchNotesInput,
  SearchNotesOutput,
  ToolExecutionMeta,
  ReplaceTextInput,
  WriteToolOutput,
} from '../../ai/tools/defaultTool';
import { buildRagChunksForDoc } from '../rag/notes-indexer';
import { ragFtsSearch } from '../rag/search';
import { ragRebuildDocChunks } from '../rag/write';

const SETTINGS_FILE = 'settings.json';
const DEFAULT_TOP_K = 6;
const MAX_TOP_K = 12;

interface RagFtsRow {
  docid: string;
  chunkid: string;
  text: string;
}

export interface ToolApprovalRequest {
  streamId: string;
  toolCallId: string;
  toolName: 'createNote' | 'replaceText' | 'appendContent';
  input: unknown;
}

export interface ToolApprovalDecision {
  approved: boolean;
  reason?: string;
}

interface NoteToolServiceOptions {
  streamId: string;
  requestWriteApproval?: (request: ToolApprovalRequest) => Promise<ToolApprovalDecision>;
}

function normalizeNewlines(text: string) {
  return (text || '').replace(/\r\n/g, '\n');
}

function normalizePathForCompare(p: string) {
  return (p || '').replace(/\\/g, '/').toLowerCase();
}

function isUnderDirectory(filePath: string, rootDir: string) {
  const f = normalizePathForCompare(filePath);
  const d = normalizePathForCompare(rootDir).replace(/\/+$/, '');
  return f === d || f.startsWith(`${d}/`);
}

function fileNameFromPath(filePath: string) {
  return (filePath || '').replace(/\\/g, '/').split('/').pop() || filePath;
}

function fileStem(filePath: string) {
  const name = fileNameFromPath(filePath);
  const ext = path.extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function sanitizeTitle(input: string) {
  return (input || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ensureMarkdownFilename(title: string) {
  return title.toLowerCase().endsWith('.md') ? title : `${title}.md`;
}

function clampTopK(raw: unknown) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TOP_K;
  return Math.max(1, Math.min(MAX_TOP_K, Math.floor(n)));
}

function normalizeSearchText(text: string) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function buildSnippet(rawText: string, query: string, maxLen = 240) {
  const text = normalizeSearchText(rawText);
  const search = normalizeSearchText(query);
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

function countExactMatches(source: string, target: string) {
  if (!target) return 0;
  let count = 0;
  let start = 0;
  while (start < source.length) {
    const index = source.indexOf(target, start);
    if (index < 0) break;
    count += 1;
    start = index + target.length;
  }
  return count;
}

function normalizeHeadingText(text: string) {
  return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findHeadingRange(lines: string[], heading: string) {
  const target = normalizeHeadingText(heading);
  if (!target) return null;

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i] || '');
    if (!match) continue;
    const level = match[1]?.length || 1;
    const headingText = normalizeHeadingText((match[2] || '').replace(/\s+#*$/, ''));
    if (headingText !== target) continue;

    let endExclusive = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[j] || '');
      if (!next) continue;
      const nextLevel = next[1]?.length || 1;
      if (nextLevel <= level) {
        endExclusive = j;
        break;
      }
    }

    return {
      startIndex: i,
      endExclusive,
    };
  }

  return null;
}

async function getNotesDirectory() {
  const configPath = path.join(app.getPath('userData'), SETTINGS_FILE);
  const content = await fs.readFile(configPath, 'utf-8');
  const json = JSON.parse(content || '{}') as { notesDirectory?: string | null };
  const dir = (json.notesDirectory || '').trim();
  if (!dir) {
    throw new Error('尚未设置 notesDirectory');
  }
  return path.normalize(dir);
}

async function resolveNotePath(noteId: string) {
  const notesDirectory = await getNotesDirectory();
  const raw = (noteId || '').trim();
  if (!raw) {
    throw new Error('noteId 不能为空');
  }

  const absolute = path.isAbsolute(raw) ? raw : path.join(notesDirectory, raw);
  const normalized = path.normalize(absolute);

  if (!isUnderDirectory(normalized, notesDirectory)) {
    throw new Error('noteId 不在笔记目录内，拒绝访问');
  }
  if (!existsSync(normalized)) {
    throw new Error('目标笔记不存在');
  }
  return normalized;
}

async function readNote(noteId: string) {
  const resolved = await resolveNotePath(noteId);
  const content = normalizeNewlines(await fs.readFile(resolved, 'utf-8'));
  return {
    notePath: resolved,
    content,
  };
}

async function syncRagForNote(notePath: string, content: string) {
  try {
    const chunks = buildRagChunksForDoc(notePath, content);
    await ragRebuildDocChunks(notePath, chunks);
    return '';
  } catch (error) {
    return `索引更新失败：${error instanceof Error ? error.message : String(error || 'Unknown error')}`;
  }
}

function toDeniedWriteResult(
  mode: 'create' | 'replace' | 'append',
  reason = '用户拒绝执行该写入操作',
): WriteToolOutput {
  return {
    ok: false,
    mode,
    denied: true,
    reason,
    message: reason,
  };
}

export function createNoteToolService(options: NoteToolServiceOptions) {
  const requestWriteApproval = async (
    toolName: 'createNote' | 'replaceText' | 'appendContent',
    input: unknown,
    meta?: ToolExecutionMeta,
  ) => {
    if (!options.requestWriteApproval) {
      return { approved: true } satisfies ToolApprovalDecision;
    }

    const toolCallId = (meta?.toolCallId || '').trim();
    return await options.requestWriteApproval({
      streamId: options.streamId,
      toolName,
      toolCallId,
      input,
    });
  };

  const searchNotes = async (input: SearchNotesInput): Promise<SearchNotesOutput> => {
    const query = (input.query || '').trim();
    if (!query) {
      return { chunks: [], total: 0 };
    }

    const limit = clampTopK(input.topK);
    const docId = input.filters?.noteId;
    const rows = (await ragFtsSearch(
      {
        query,
        limit,
        docId: docId || undefined,
        select: ['docid', 'chunkid', 'text'],
      },
      {},
      { timeoutMs: 8_000 },
    )) as RagFtsRow[];

    const chunks = (Array.isArray(rows) ? rows : [])
      .filter((row) => row?.docid && row?.chunkid && row?.text)
      .map((row) => ({
        noteId: row.docid,
        title: fileStem(row.docid),
        path: row.docid,
        snippet: buildSnippet(row.text, query),
        chunkId: row.chunkid,
      }));

    return {
      chunks,
      total: chunks.length,
    };
  };

  const getNote = async (input: GetNoteInput): Promise<GetNoteOutput> => {
    const { notePath, content } = await readNote(input.noteId);
    const lines = content.split('\n');
    const totalLines = content.length === 0 ? 0 : lines.length;
    const block = input.block;

    if (!block) {
      return {
        noteId: notePath,
        path: notePath,
        title: fileStem(notePath),
        content,
        mode: 'full',
        totalLines,
      };
    }

    if (block.heading && block.heading.trim()) {
      const range = findHeadingRange(lines, block.heading);
      if (!range) {
        throw new Error(`未找到标题：${block.heading}`);
      }

      const section = lines.slice(range.startIndex, range.endExclusive).join('\n');
      return {
        noteId: notePath,
        path: notePath,
        title: fileStem(notePath),
        content: section,
        mode: 'heading',
        totalLines,
        startLine: range.startIndex + 1,
        endLine: range.endExclusive,
      };
    }

    const startLine = Math.max(1, Math.min(totalLines || 1, block.startLine || 1));
    const endLine = Math.max(startLine, Math.min(totalLines || startLine, block.endLine || totalLines));
    const section = lines.slice(startLine - 1, endLine).join('\n');

    return {
      noteId: notePath,
      path: notePath,
      title: fileStem(notePath),
      content: section,
      mode: 'line-range',
      totalLines,
      startLine,
      endLine,
    };
  };

  const createNote = async (
    input: CreateNoteInput,
    meta?: ToolExecutionMeta,
  ): Promise<WriteToolOutput> => {
    const titleRaw = sanitizeTitle(input.title || '');
    if (!titleRaw) {
      return {
        ok: false,
        mode: 'create',
        message: 'title 不能为空',
      };
    }

    const approval = await requestWriteApproval('createNote', input, meta);
    if (!approval.approved) {
      return toDeniedWriteResult('create', approval.reason);
    }

    const notesDirectory = await getNotesDirectory();
    const fileName = ensureMarkdownFilename(titleRaw);
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);

    let finalPath = path.join(notesDirectory, fileName);
    let counter = 1;
    while (existsSync(finalPath)) {
      finalPath = path.join(notesDirectory, `${base} (${counter})${ext}`);
      counter += 1;
    }

    const provided = normalizeNewlines((input.content || '').toString());
    const initialContent = provided.trim().length > 0 ? provided : `# ${base}\n\n`;
    const contentToWrite = initialContent.endsWith('\n') ? initialContent : `${initialContent}\n`;

    await fs.writeFile(finalPath, contentToWrite, 'utf-8');
    const ragWarning = await syncRagForNote(finalPath, contentToWrite);

    return {
      ok: true,
      mode: 'create',
      noteId: finalPath,
      path: finalPath,
      title: fileStem(finalPath),
      message: ragWarning || '笔记已创建',
    };
  };

  const replaceText = async (
    input: ReplaceTextInput,
    meta?: ToolExecutionMeta,
  ): Promise<WriteToolOutput> => {
    const { notePath, content } = await readNote(input.noteId);
    const originalText = normalizeNewlines((input.originalText || '').toString());
    const newText = normalizeNewlines((input.newText || '').toString());

    if (!originalText) {
      return {
        ok: false,
        mode: 'replace',
        noteId: notePath,
        path: notePath,
        message: 'originalText 不能为空',
      };
    }

    const matchCount = countExactMatches(content, originalText);
    if (matchCount !== 1) {
      return {
        ok: false,
        mode: 'replace',
        noteId: notePath,
        path: notePath,
        matchCount,
        message:
          matchCount === 0
            ? '未找到 originalText，请先调用 getNote 获取更精确上下文。'
            : `originalText 命中 ${matchCount} 处，必须提供更唯一的上下文。`,
      };
    }

    const approval = await requestWriteApproval('replaceText', input, meta);
    if (!approval.approved) {
      return toDeniedWriteResult('replace', approval.reason);
    }

    const index = content.indexOf(originalText);
    const nextContent = `${content.slice(0, index)}${newText}${content.slice(index + originalText.length)}`;
    const contentToWrite = nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`;

    await fs.writeFile(notePath, contentToWrite, 'utf-8');
    const ragWarning = await syncRagForNote(notePath, contentToWrite);

    return {
      ok: true,
      mode: 'replace',
      noteId: notePath,
      path: notePath,
      matchCount: 1,
      message: ragWarning || '文本替换完成',
    };
  };

  const appendContent = async (
    input: AppendContentInput,
    meta?: ToolExecutionMeta,
  ): Promise<WriteToolOutput> => {
    const { notePath, content } = await readNote(input.noteId);
    const appendText = normalizeNewlines((input.content || '').toString());
    if (!appendText.trim()) {
      return {
        ok: false,
        mode: 'append',
        noteId: notePath,
        path: notePath,
        message: 'content 不能为空',
      };
    }

    const approval = await requestWriteApproval('appendContent', input, meta);
    if (!approval.approved) {
      return toDeniedWriteResult('append', approval.reason);
    }

    let nextContent = content;
    let appendedLine = 1;

    if (input.targetHeading && input.targetHeading.trim()) {
      const lines = content.split('\n');
      const range = findHeadingRange(lines, input.targetHeading);
      if (!range) {
        return {
          ok: false,
          mode: 'append',
          noteId: notePath,
          path: notePath,
          targetHeading: input.targetHeading,
          message: `未找到目标标题：${input.targetHeading}`,
        };
      }

      const insertAt = range.endExclusive;
      const insertLines = appendText.split('\n');
      if (insertAt > 0 && (lines[insertAt - 1] || '').trim() !== '') {
        insertLines.unshift('');
      }
      if (insertAt < lines.length && (lines[insertAt] || '').trim() !== '') {
        insertLines.push('');
      }

      const firstContentOffset = Math.max(
        0,
        insertLines.findIndex((line) => line.trim().length > 0),
      );
      appendedLine = insertAt + firstContentOffset + 1;

      lines.splice(insertAt, 0, ...insertLines);
      nextContent = lines.join('\n');
    } else {
      const base = content;
      const prefix =
        base.length === 0 ? '' : base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n';
      appendedLine = `${base}${prefix}`.split('\n').length;
      nextContent = `${base}${prefix}${appendText}`;
    }

    const contentToWrite = nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`;
    await fs.writeFile(notePath, contentToWrite, 'utf-8');
    const ragWarning = await syncRagForNote(notePath, contentToWrite);

    return {
      ok: true,
      mode: 'append',
      noteId: notePath,
      path: notePath,
      targetHeading: input.targetHeading,
      appendedLine,
      message: ragWarning || '追加完成',
    };
  };

  return {
    searchNotes,
    getNote,
    createNote,
    replaceText,
    appendContent,
  };
}
