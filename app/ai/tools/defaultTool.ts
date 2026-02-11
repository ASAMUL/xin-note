import type { ToolSet } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

const notePathSchema = z.string().min(1).describe('笔记绝对路径（noteId）');

const searchNotesInputSchema = z.object({
  query: z.string().min(1).describe('检索关键词'),
  filters: z
    .object({
      noteId: notePathSchema.optional().describe('可选：仅在指定笔记内检索'),
    })
    .optional(),
  topK: z.number().int().min(1).max(12).optional().describe('返回片段数量，默认 6'),
});

const searchNotesOutputSchema = z.object({
  chunks: z.array(
    z.object({
      noteId: notePathSchema,
      title: z.string(),
      path: notePathSchema,
      snippet: z.string(),
      chunkId: z.string(),
    }),
  ),
  total: z.number().int().min(0),
});

const getNoteInputSchema = z.object({
  noteId: notePathSchema,
  block: z
    .object({
      heading: z.string().min(1).optional().describe('按标题读取一个区块'),
      startLine: z.number().int().min(1).optional().describe('按起始行读取（1-based）'),
      endLine: z.number().int().min(1).optional().describe('按结束行读取（1-based）'),
    })
    .optional(),
});

const getNoteOutputSchema = z.object({
  noteId: notePathSchema,
  path: notePathSchema,
  title: z.string(),
  content: z.string(),
  mode: z.enum(['full', 'heading', 'line-range']),
  totalLines: z.number().int().min(0),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});

const createNoteInputSchema = z.object({
  title: z.string().min(1).describe('文件名或标题（可不带 .md）'),
  content: z.string().optional().default('').describe('笔记正文'),
});

const writeToolOutputSchema = z.object({
  ok: z.boolean(),
  noteId: notePathSchema.optional(),
  path: notePathSchema.optional(),
  title: z.string().optional(),
  mode: z.enum(['create', 'replace', 'append']).optional(),
  matchCount: z.number().int().min(0).optional(),
  targetHeading: z.string().optional(),
  appendedLine: z.number().int().min(1).optional(),
  denied: z.boolean().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
});

const replaceTextInputSchema = z.object({
  noteId: notePathSchema,
  originalText: z
    .string()
    .min(1)
    .describe('必须提供足够唯一的原文片段；若匹配多处会被拒绝并要求补充上下文'),
  newText: z.string().describe('替换后的文本'),
});

const appendContentInputSchema = z.object({
  noteId: notePathSchema,
  content: z.string().min(1).describe('要追加的文本'),
  targetHeading: z.string().min(1).optional().describe('可选：追加到指定标题区块末尾'),
});

export type SearchNotesInput = z.infer<typeof searchNotesInputSchema>;
export type SearchNotesOutput = z.infer<typeof searchNotesOutputSchema>;
export type GetNoteInput = z.infer<typeof getNoteInputSchema>;
export type GetNoteOutput = z.infer<typeof getNoteOutputSchema>;
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;
export type WriteToolOutput = z.infer<typeof writeToolOutputSchema>;
export type ReplaceTextInput = z.infer<typeof replaceTextInputSchema>;
export type AppendContentInput = z.infer<typeof appendContentInputSchema>;

export interface ToolExecutionMeta {
  toolCallId?: string;
}

export interface DefaultToolContext {
  searchNotes: (input: SearchNotesInput, meta?: ToolExecutionMeta) => Promise<SearchNotesOutput>;
  getNote: (input: GetNoteInput, meta?: ToolExecutionMeta) => Promise<GetNoteOutput>;
  createNote: (input: CreateNoteInput, meta?: ToolExecutionMeta) => Promise<WriteToolOutput>;
  replaceText: (input: ReplaceTextInput, meta?: ToolExecutionMeta) => Promise<WriteToolOutput>;
  appendContent: (input: AppendContentInput, meta?: ToolExecutionMeta) => Promise<WriteToolOutput>;
}

export function createDefaultAgentTools(context: DefaultToolContext) {
  return {
    searchNotes: tool({
      description:
        '在用户笔记索引中检索相关片段。用于回答问题前先找证据，返回片段列表（含 noteId/标题/路径/片段）。',
      inputSchema: searchNotesInputSchema,
      outputSchema: searchNotesOutputSchema,
      execute: async (input, meta) => context.searchNotes(input, { toolCallId: meta.toolCallId }),
    }),

    getNote: tool({
      description: '读取一篇完整笔记，或按标题/行范围读取局部内容。',
      inputSchema: getNoteInputSchema,
      outputSchema: getNoteOutputSchema,
      execute: async (input, meta) => context.getNote(input, { toolCallId: meta.toolCallId }),
    }),

    createNote: tool({
      description:
        '创建新笔记（敏感写操作，需要用户审批）。当用户明确要求新建笔记时调用。',
      inputSchema: createNoteInputSchema,
      outputSchema: writeToolOutputSchema,
      execute: async (input, meta) => context.createNote(input, { toolCallId: meta.toolCallId }),
    }),

    replaceText: tool({
      description:
        '精准替换笔记片段（敏感写操作，需要用户审批）。必须先提供唯一 originalText，若匹配多处会失败。',
      inputSchema: replaceTextInputSchema,
      outputSchema: writeToolOutputSchema,
      execute: async (input, meta) => context.replaceText(input, { toolCallId: meta.toolCallId }),
    }),

    appendContent: tool({
      description:
        '结构化追加内容（敏感写操作，需要用户审批）。可追加到底部，或指定标题下。',
      inputSchema: appendContentInputSchema,
      outputSchema: writeToolOutputSchema,
      execute: async (input, meta) => context.appendContent(input, { toolCallId: meta.toolCallId }),
    }),
  } satisfies ToolSet;
}

export type DefaultAgentTools = ReturnType<typeof createDefaultAgentTools>;

export const DEFAULT_AGENT_TOOL_NAMES = [
  'searchNotes',
  'getNote',
  'createNote',
  'replaceText',
  'appendContent',
] as const;
