/**
 * Canonical view-model types for the session detail transcript.
 * The raw Pi JSONL shapes are tolerated by `normalize.ts`; components only
 * ever consume these normalized types.
 */

export type EntryKind =
  | "user"
  | "assistant"
  | "tool-result"
  | "system-prompt"
  | "system"
  | "model-change"
  | "thinking-level-change"
  | "compaction"
  | "context-edit"
  | "branch-summary"
  | "usage"
  | "session-info"
  | "label"
  | "custom"
  | "custom-message"
  | "unknown";

export interface UsageTotals {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

export interface CostTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface TextContent {
  kind: "text";
  text: string;
}

export interface ThinkingContent {
  kind: "thinking";
  text: string;
  signature?: string;
}

export interface ToolCallContent {
  kind: "tool-call";
  id?: string;
  name: string;
  arguments: unknown;
}

export interface ImageContent {
  kind: "image";
  mimeType: string;
  data: string;
  alt?: string;
}

export interface UnknownContent {
  kind: "unknown";
  rawType: string;
  raw: unknown;
}

export type ContentBlock =
  | TextContent
  | ThinkingContent
  | ToolCallContent
  | ImageContent
  | UnknownContent;

export interface SystemSection {
  label: string;
  text: string;
}

export interface NormalizedEntry {
  key: string;
  index: number;
  id?: string;
  parentId?: string;
  type: string;
  kind: EntryKind;
  timestamp?: string;
  role?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  toolName?: string;
  toolCallId?: string;
  isError: boolean;
  durationMs?: number;
  usage?: UsageTotals;
  cost?: CostTotals;
  content: ContentBlock[];
  systemSections?: SystemSection[];
  summary?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  readFiles: string[];
  modifiedFiles: string[];
  targetId?: string;
  replacement?: string | null;
  label?: string;
  sessionName?: string;
  customType?: string;
  stopReason?: string;
  errorMessage?: string;
  metadata?: unknown;
  raw: unknown;
}

export interface ModelRef {
  model: string;
  provider?: string;
  totalTokens?: number;
  cost?: number;
}

export interface SessionCounts {
  entries: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  errors: number;
  compactions: number;
  contextEdits: number;
  modelChanges: number;
}

export interface ParseWarning {
  line: number;
  message: string;
  rawSnippet: string;
}

export interface NormalizedSession {
  id: string;
  sessionId: string;
  title: string;
  sessionName?: string;
  cwd?: string;
  startedAt?: string;
  lastActivityAt?: string;
  durationMs?: number;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  models: ModelRef[];
  primaryModel?: string;
  counts: SessionCounts;
  usage: UsageTotals;
  cost: CostTotals;
  parseStatus: "ok" | "warning" | "error";
}

export interface RelatedSession {
  sessionId: string;
  title?: string;
  costTotal: number;
  totalTokens: number;
}

export interface NormalizedSessionDetail {
  session: NormalizedSession;
  entries: NormalizedEntry[];
  warnings: ParseWarning[];
  relatedSessions: RelatedSession[];
  relatedCostTotal: number;
  combinedCostTotal: number;
}

export interface ToolResultData {
  key: string;
  entry: NormalizedEntry;
  text: string;
  images: ImageContent[];
  isError: boolean;
}

export interface ToolExecutionData {
  key: string;
  callId?: string;
  name: string;
  arguments: unknown;
  argsText: string;
  call: NormalizedEntry;
  results: ToolResultData[];
  isError: boolean;
}

export type TranscriptItemType =
  | "user"
  | "assistant"
  | "tool-result"
  | "system-prompt"
  | "system"
  | "compaction"
  | "context-edit"
  | "branch-summary"
  | "usage"
  | "custom-message"
  | "unknown";

export interface TranscriptItem {
  key: string;
  type: TranscriptItemType;
  entry: NormalizedEntry;
  anchor: string;
  executions: ToolExecutionData[];
  searchText: string;
  previousModel?: string;
  previousThinkingLevel?: string;
}

export type TranscriptFilter = "all" | "user" | "assistant" | "tools" | "errors";

export interface TranscriptCounts {
  all: number;
  user: number;
  assistant: number;
  tools: number;
  errors: number;
}
