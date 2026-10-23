import { classifyEntry } from "./entryKind";
import type {
  ContentBlock,
  CostTotals,
  ImageContent,
  ModelRef,
  NormalizedEntry,
  NormalizedSession,
  NormalizedSessionDetail,
  ParseWarning,
  SessionCounts,
  SystemSection,
  UsageTotals,
} from "./sessionTypes";

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const bool = (value: unknown): boolean =>
  value === true || value === "true" || value === 1;

function pick(obj: Obj | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function pickString(obj: Obj | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(pick(obj, key));
    if (value) return value;
  }
  return undefined;
}

function pickNumber(obj: Obj | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = num(pick(obj, key));
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (isObj(item)) return pickString(item, "path", "file", "name");
      return undefined;
    })
    .filter((item): item is string => Boolean(item));
}

export function emptyUsage(): UsageTotals {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
}

export function emptyCost(): CostTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

export function normalizeUsage(value: unknown): UsageTotals | undefined {
  const obj = isObj(value) ? value : undefined;
  if (!obj) return undefined;
  const input = pickNumber(obj, "input", "inputTokens", "input_tokens") ?? 0;
  const output = pickNumber(obj, "output", "outputTokens", "output_tokens") ?? 0;
  const reasoning = pickNumber(obj, "reasoning", "reasoningTokens", "reasoning_tokens") ?? 0;
  const cacheRead = pickNumber(obj, "cacheRead", "cache_read", "cacheReadTokens", "cache_read_tokens") ?? 0;
  const cacheWrite = pickNumber(obj, "cacheWrite", "cache_write", "cacheWriteTokens", "cache_write_tokens") ?? 0;
  const explicitTotal = pickNumber(obj, "totalTokens", "total_tokens", "total");
  const totalTokens = explicitTotal ?? input + output + cacheRead + cacheWrite;
  if (
    input === 0 &&
    output === 0 &&
    reasoning === 0 &&
    cacheRead === 0 &&
    cacheWrite === 0 &&
    totalTokens === 0
  ) {
    return undefined;
  }
  return { input, output, reasoning, cacheRead, cacheWrite, totalTokens };
}

function costValue(value: unknown, micro: boolean): number | undefined {
  const n = num(value);
  if (n === undefined) return undefined;
  return micro ? n / 1_000_000 : n;
}

export function normalizeCost(value: unknown): CostTotals | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return undefined;
    return { ...emptyCost(), total: value };
  }
  const obj = isObj(value) ? value : undefined;
  if (!obj) return undefined;
  const total =
    costValue(pick(obj, "total", "costTotal", "cost_total"), false) ??
    costValue(pick(obj, "totalMicro", "costTotalMicro", "cost_total_micro"), true) ??
    costValue(pick(obj, "cost", "costTotal", "cost_total"), false) ??
    0;
  const input =
    costValue(pick(obj, "input", "costInput", "cost_input"), false) ??
    costValue(pick(obj, "costInputMicro", "cost_input_micro"), true) ??
    0;
  const output =
    costValue(pick(obj, "output", "costOutput", "cost_output"), false) ??
    costValue(pick(obj, "costOutputMicro", "cost_output_micro"), true) ??
    0;
  const cacheRead =
    costValue(pick(obj, "cacheRead", "costCacheRead", "cost_cache_read"), false) ??
    costValue(pick(obj, "costCacheReadMicro", "cost_cache_read_micro"), true) ??
    0;
  const cacheWrite =
    costValue(pick(obj, "cacheWrite", "costCacheWrite", "cost_cache_write"), false) ??
    costValue(pick(obj, "costCacheWriteMicro", "cost_cache_write_micro"), true) ??
    0;
  const resolvedTotal = total || input + output + cacheRead + cacheWrite;
  if (resolvedTotal === 0 && input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) {
    return undefined;
  }
  return { input, output, cacheRead, cacheWrite, total: resolvedTotal };
}

function normalizeSections(value: unknown): SystemSection[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const sections = value
      .map((item, index) => {
        if (typeof item === "string") return { label: `section ${index + 1}`, text: item };
        if (!isObj(item)) return undefined;
        const label = pickString(item, "label", "name", "key", "type") ?? `section ${index + 1}`;
        const text = pickString(item, "text", "content", "value", "body");
        return text ? { label, text } : undefined;
      })
      .filter((item): item is SystemSection => Boolean(item));
    return sections.length > 0 ? sections : undefined;
  }
  if (isObj(value)) {
    const sections = Object.entries(value)
      .map(([label, raw]) => {
        if (typeof raw === "string") return { label, text: raw };
        if (isObj(raw)) {
          const text = pickString(raw, "text", "content", "value", "body");
          return text ? { label, text } : undefined;
        }
        return undefined;
      })
      .filter((item): item is SystemSection => Boolean(item));
    return sections.length > 0 ? sections : undefined;
  }
  return undefined;
}

function normalizeImage(block: Obj): ImageContent | undefined {
  const mimeType = pickString(block, "mimeType", "mime_type", "mediaType", "media_type");
  const data = pickString(block, "data", "base64", "source");
  if (!mimeType || !data) return undefined;
  return {
    kind: "image",
    mimeType,
    data,
    alt: pickString(block, "alt", "name"),
  };
}

function normalizeContentBlock(block: unknown): ContentBlock | undefined {
  if (typeof block === "string") return block ? { kind: "text", text: block } : undefined;
  if (!isObj(block)) return undefined;
  const type = (pickString(block, "type", "kind") ?? "").toLowerCase();
  if (type === "text") {
    const text = pickString(block, "text", "value", "content");
    return text ? { kind: "text", text } : undefined;
  }
  if (type === "thinking" || type === "reasoning") {
    const text = pickString(block, "thinking", "text", "value", "content");
    if (!text) return undefined;
    return {
      kind: "thinking",
      text,
      signature: pickString(block, "thinkingSignature", "signature"),
    };
  }
  if (type === "toolcall" || type === "tool_call" || type === "tool_use" || type === "tool-use") {
    return {
      kind: "tool-call",
      id: pickString(block, "id", "toolCallId", "tool_call_id"),
      name: pickString(block, "name", "toolName", "tool_name") ?? "unknown_tool",
      arguments: parseJson(pick(block, "arguments", "input", "args", "parameters")),
    };
  }
  if (type === "image") {
    return normalizeImage(block);
  }
  const text = pickString(block, "text", "content");
  if (text && !type) return { kind: "text", text };
  return { kind: "unknown", rawType: type || "unknown", raw: block };
}

export function normalizeContent(value: unknown): ContentBlock[] {
  const parsed = parseJson(value);
  if (typeof parsed === "string") return parsed ? [{ kind: "text", text: parsed }] : [];
  if (Array.isArray(parsed)) {
    return parsed
      .map(normalizeContentBlock)
      .filter((block): block is ContentBlock => Boolean(block));
  }
  if (isObj(parsed)) {
    const block = normalizeContentBlock(parsed);
    return block ? [block] : [];
  }
  return [];
}

export function contentText(blocks: ContentBlock[]): string {
  return blocks
    .filter((block): block is { kind: "text"; text: string } => block.kind === "text")
    .map((block) => block.text)
    .join("\n\n");
}

export function argumentsText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeUsageCost(value: unknown): CostTotals | undefined {
  const obj = isObj(value) ? value : undefined;
  if (!obj) return undefined;
  const nested = pick(obj, "cost");
  if (isObj(nested)) {
    const normalized = normalizeCost(nested);
    if (normalized) return normalized;
  }
  return normalizeCost({
    input: pick(obj, "costInput", "cost_input"),
    output: pick(obj, "costOutput", "cost_output"),
    cacheRead: pick(obj, "costCacheRead", "cost_cache_read"),
    cacheWrite: pick(obj, "costCacheWrite", "cost_cache_write"),
    total: pick(obj, "costTotal", "cost_total"),
  });
}

export function normalizeEntry(raw: unknown, index: number): NormalizedEntry {
  const obj = isObj(raw) ? raw : {};
  const message = isObj(obj.message) ? obj.message : undefined;
  const metadataValue = parseJson(pick(obj, "metadata"));
  const metadata = isObj(metadataValue) ? metadataValue : undefined;
  const meta = (key: string): Obj | undefined => {
    const nested = metadata ? metadata[key] : undefined;
    return isObj(nested) ? nested : undefined;
  };
  const compactionMeta = meta("compaction");
  const branchMeta = meta("branchSummary") ?? meta("branch_summary");
  const contextMeta = meta("contextEdit") ?? meta("context_edit");
  const sessionMeta = meta("sessionInfo") ?? meta("session_info");
  const customMeta = meta("customMessage") ?? meta("custom_message");
  const type =
    pickString(obj, "type", "entryType", "entry_type") ??
    (message ? "message" : "unknown");
  const role = pickString(obj, "role") ?? pickString(message, "role");
  const sections = normalizeSections(
    pick(obj, "sections") ?? pick(metadata, "sections") ?? pick(message, "sections"),
  );
  const content = normalizeContent(
    pick(obj, "content") ??
      pick(obj, "contentJson", "content_json") ??
      pick(message, "content") ??
      pick(metadata, "content", "contentJson", "content_json") ??
      pick(obj, "textContent", "text_content"),
  );
  const hasSections = Boolean(sections && sections.length > 0);
  const kind = classifyEntry(type, role, hasSections);
  const usageSource =
    pick(obj, "usage") ?? pick(message, "usage") ?? pick(obj, "tokenUsage", "token_usage");
  const usage = normalizeUsage(usageSource);
  const cost =
    normalizeCost(pick(obj, "cost")) ??
    normalizeCost(pick(message, "cost")) ??
    normalizeUsageCost(usageSource) ??
    normalizeCost(pick(obj, "costTotal", "cost_total")) ??
    normalizeCost({
      input: pick(obj, "costInputMicro", "cost_input_micro"),
      output: pick(obj, "costOutputMicro", "cost_output_micro"),
      cacheRead: pick(obj, "costCacheReadMicro", "cost_cache_read_micro"),
      cacheWrite: pick(obj, "costCacheWriteMicro", "cost_cache_write_micro"),
      total: pick(obj, "costTotalMicro", "cost_total_micro"),
    });
  const entryIndex =
    pickNumber(obj, "entryIndex", "entry_index", "index", "position") ?? index;
  const toolCallId =
    pickString(obj, "toolCallId", "tool_call_id") ??
    pickString(message, "toolCallId", "tool_call_id");
  const toolName =
    pickString(obj, "toolName", "tool_name") ?? pickString(message, "toolName", "tool_name");
  const isError =
    bool(pick(obj, "isError", "is_error")) ||
    bool(pick(message, "isError", "is_error")) ||
    bool(pick(metadata, "isError", "is_error"));

  return {
    key: `entry-${entryIndex}`,
    index: entryIndex,
    id: pickString(obj, "id", "entryId", "entry_id"),
    parentId: pickString(obj, "parentId", "parent_id"),
    type,
    kind,
    timestamp:
      pickString(obj, "timestamp", "createdAt", "created_at", "time") ??
      pickString(message, "timestamp"),
    role,
    provider:
      pickString(obj, "provider") ?? pickString(message, "provider"),
    model:
      pickString(obj, "model", "modelId", "model_id") ??
      pickString(message, "model", "modelId", "model_id"),
    thinkingLevel:
      pickString(obj, "thinkingLevel", "thinking_level") ??
      pickString(message, "thinkingLevel", "thinking_level"),
    toolName,
    toolCallId,
    isError,
    durationMs:
      pickNumber(obj, "durationMs", "duration_ms") ??
      pickNumber(message, "durationMs", "duration_ms"),
    usage,
    cost,
    content,
    systemSections: sections,
    summary:
      pickString(obj, "summary") ??
      pickString(message, "summary") ??
      pickString(metadata, "summary") ??
      pickString(compactionMeta, "summary") ??
      pickString(branchMeta, "summary") ??
      (kind === "compaction" || kind === "branch-summary" ? contentText(content) : undefined) ??
      pickString(obj, "message"),
    tokensBefore:
      pickNumber(obj, "tokensBefore", "tokens_before") ??
      pickNumber(metadata, "tokensBefore", "tokens_before") ??
      pickNumber(compactionMeta, "tokensBefore", "tokens_before"),
    tokensAfter:
      pickNumber(obj, "tokensAfter", "tokens_after") ??
      pickNumber(metadata, "tokensAfter", "tokens_after") ??
      pickNumber(compactionMeta, "tokensAfter", "tokens_after"),
    readFiles: toStringArray(
      pick(obj, "readFiles", "read_files") ??
        pick(metadata, "readFiles", "read_files") ??
        pick(compactionMeta, "readFiles", "read_files") ??
        pick(branchMeta, "readFiles", "read_files"),
    ),
    modifiedFiles: toStringArray(
      pick(obj, "modifiedFiles", "modified_files") ??
        pick(metadata, "modifiedFiles", "modified_files") ??
        pick(compactionMeta, "modifiedFiles", "modified_files") ??
        pick(branchMeta, "modifiedFiles", "modified_files"),
    ),
    targetId:
      pickString(obj, "targetId", "target_id") ??
      pickString(metadata, "targetId", "target_id") ??
      pickString(contextMeta, "targetId", "target_id"),
    replacement: (() => {
      const value =
        pick(obj, "replacement") ??
        pick(metadata, "replacement") ??
        pick(contextMeta, "replacement", "replacementContent", "replacement_content");
      if (value === null) return null;
      if (typeof value === "string") return value;
      if (value === undefined) return undefined;
      const text = contentText(normalizeContent(value));
      return text || undefined;
    })(),
    label: pickString(obj, "label") ?? pickString(metadata, "label") ?? pickString(obj, "name"),
    sessionName:
      pickString(obj, "sessionName", "session_name", "name") ??
      pickString(metadata, "sessionName", "session_name") ??
      pickString(sessionMeta, "name", "sessionName", "session_name"),
    customType:
      pickString(obj, "customType", "custom_type", "subtype") ??
      pickString(metadata, "customType", "custom_type") ??
      pickString(customMeta, "customType", "custom_type"),
    stopReason:
      pickString(obj, "stopReason", "stop_reason") ??
      pickString(message, "stopReason", "stop_reason"),
    errorMessage:
      pickString(obj, "errorMessage", "error_message", "error") ??
      pickString(metadata, "error", "errorMessage", "message"),
    metadata,
    raw,
  };
}

function normalizeModels(value: unknown): ModelRef[] {
  if (!Array.isArray(value)) return [];
  const models: ModelRef[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      models.push({ model: item });
      continue;
    }
    if (!isObj(item)) continue;
    const model = pickString(item, "model", "modelId", "model_id", "name", "id");
    if (!model) continue;
    models.push({
      model,
      provider: pickString(item, "provider"),
      totalTokens: pickNumber(item, "totalTokens", "total_tokens", "tokens"),
      cost: num(pick(item, "cost", "costTotal", "cost_total")),
    });
  }
  return models;
}

function normalizeWarnings(value: unknown): ParseWarning[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === "string") {
      return { line: index + 1, message: item, rawSnippet: "" };
    }
    const obj = isObj(item) ? item : {};
    return {
      line: pickNumber(obj, "line", "lineNumber", "line_number") ?? index + 1,
      message:
        pickString(obj, "message", "error", "detail", "reason") ?? "Unknown parse warning",
      rawSnippet:
        pickString(obj, "rawSnippet", "raw_snippet", "raw", "snippet", "preview") ?? "",
    };
  });
}

function deriveCounts(entries: NormalizedEntry[]): SessionCounts {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let toolResults = 0;
  let errors = 0;
  let compactions = 0;
  let contextEdits = 0;
  let modelChanges = 0;
  for (const entry of entries) {
    switch (entry.kind) {
      case "user":
        userMessages += 1;
        break;
      case "assistant":
        assistantMessages += 1;
        toolCalls += entry.content.filter((block) => block.kind === "tool-call").length;
        break;
      case "tool-result":
        toolResults += 1;
        if (entry.isError) errors += 1;
        break;
      case "compaction":
        compactions += 1;
        break;
      case "context-edit":
        contextEdits += 1;
        break;
      case "model-change":
        modelChanges += 1;
        break;
      default:
        break;
    }
  }
  return {
    entries: entries.length,
    userMessages,
    assistantMessages,
    toolCalls,
    toolResults,
    errors,
    compactions,
    contextEdits,
    modelChanges,
  };
}

function sumUsage(entries: NormalizedEntry[]): UsageTotals {
  const total = emptyUsage();
  for (const entry of entries) {
    if (!entry.usage) continue;
    total.input += entry.usage.input;
    total.output += entry.usage.output;
    total.reasoning += entry.usage.reasoning;
    total.cacheRead += entry.usage.cacheRead;
    total.cacheWrite += entry.usage.cacheWrite;
    total.totalTokens += entry.usage.totalTokens;
  }
  return total;
}

function sumCost(entries: NormalizedEntry[]): CostTotals {
  const total = emptyCost();
  for (const entry of entries) {
    if (!entry.cost) continue;
    total.input += entry.cost.input;
    total.output += entry.cost.output;
    total.cacheRead += entry.cost.cacheRead;
    total.cacheWrite += entry.cost.cacheWrite;
    total.total += entry.cost.total;
  }
  return total;
}

function deriveTitle(entries: NormalizedEntry[]): string {
  for (const entry of entries) {
    if (entry.kind !== "user") continue;
    const text = contentText(entry.content).trim();
    if (text) {
      const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? text;
      return firstLine.length > 110 ? `${firstLine.slice(0, 110)}…` : firstLine;
    }
  }
  return "Untitled session";
}

function deriveModels(entries: NormalizedEntry[]): ModelRef[] {
  const map = new Map<string, ModelRef>();
  for (const entry of entries) {
    if (!entry.model) continue;
    const existing = map.get(entry.model);
    if (existing) {
      existing.totalTokens = (existing.totalTokens ?? 0) + (entry.usage?.totalTokens ?? 0);
      existing.cost = (existing.cost ?? 0) + (entry.cost?.total ?? 0);
    } else {
      map.set(entry.model, {
        model: entry.model,
        provider: entry.provider,
        totalTokens: entry.usage?.totalTokens ?? 0,
        cost: entry.cost?.total ?? 0,
      });
    }
  }
  return [...map.values()];
}

export function normalizeSessionDetail(raw: unknown): NormalizedSessionDetail {
  const root = isObj(raw) ? raw : {};
  const data = isObj(root.data) ? root.data : root;
  const rawSession = isObj(data.session) ? data.session : isObj(root.session) ? root.session : {};
  const rawEntries = Array.isArray(data.entries)
    ? data.entries
    : Array.isArray(root.entries)
      ? root.entries
      : Array.isArray(data.timeline)
        ? data.timeline
        : Array.isArray(root.timeline)
          ? root.timeline
          : [];
  const entries = rawEntries.map((entry, index) => normalizeEntry(entry, index));
  const warnings = normalizeWarnings(
    pick(data, "parseWarnings", "parse_warnings", "warnings") ??
      pick(rawSession, "parseWarnings", "parse_warnings") ??
      pick(root, "parseWarnings", "parse_warnings", "warnings"),
  );
  const startedAt =
    pickString(rawSession, "startedAt", "started_at", "startTime", "timestamp") ??
    entries.find((entry) => entry.timestamp)?.timestamp;
  const lastActivityAt =
    pickString(rawSession, "lastActivityAt", "last_activity_at", "updatedAt", "updated_at") ??
    [...entries].reverse().find((entry) => entry.timestamp)?.timestamp ??
    startedAt;
  const startedMs = startedAt ? Date.parse(startedAt) : NaN;
  const lastMs = lastActivityAt ? Date.parse(lastActivityAt) : NaN;
  const durationMs =
    pickNumber(rawSession, "durationMs", "duration_ms") ??
    (Number.isFinite(startedMs) && Number.isFinite(lastMs) ? Math.max(0, lastMs - startedMs) : undefined);
  const countsRaw = isObj(rawSession.counts) ? rawSession.counts : undefined;
  const derivedCounts = deriveCounts(entries);
  const counts: SessionCounts = {
    entries:
      pickNumber(countsRaw, "entries", "entryCount", "entry_count") ??
      pickNumber(rawSession, "entryCount", "entry_count") ??
      derivedCounts.entries,
    userMessages:
      pickNumber(countsRaw, "userMessages", "user_messages", "userMessageCount") ??
      pickNumber(rawSession, "userMessageCount", "user_message_count") ??
      derivedCounts.userMessages,
    assistantMessages:
      pickNumber(countsRaw, "assistantMessages", "assistant_messages", "assistantMessageCount") ??
      pickNumber(rawSession, "assistantMessageCount", "assistant_message_count") ??
      derivedCounts.assistantMessages,
    toolCalls:
      pickNumber(countsRaw, "toolCalls", "tool_calls", "toolCallCount") ??
      pickNumber(rawSession, "toolCallCount", "tool_call_count") ??
      derivedCounts.toolCalls,
    toolResults:
      pickNumber(countsRaw, "toolResults", "tool_results", "toolResultCount") ??
      pickNumber(rawSession, "toolResultCount", "tool_result_count") ??
      derivedCounts.toolResults,
    errors: pickNumber(countsRaw, "errors", "errorCount", "error_count") ?? derivedCounts.errors,
    compactions:
      pickNumber(countsRaw, "compactions", "compactionCount", "compaction_count") ??
      pickNumber(rawSession, "compactionCount", "compaction_count") ??
      derivedCounts.compactions,
    contextEdits:
      pickNumber(countsRaw, "contextEdits", "context_edits", "contextEditCount") ??
      pickNumber(rawSession, "contextEditCount", "context_edit_count") ??
      derivedCounts.contextEdits,
    modelChanges:
      pickNumber(countsRaw, "modelChanges", "model_changes", "modelChangeCount") ??
      pickNumber(rawSession, "modelChangeCount", "model_change_count") ??
      derivedCounts.modelChanges,
  };
  const totalsRaw = isObj(data.totals) ? data.totals : isObj(root.totals) ? root.totals : undefined;
  const usage =
    normalizeUsage(pick(rawSession, "usage", "tokenUsage", "token_usage")) ??
    normalizeUsage({
      input: pick(rawSession, "inputTokens", "input_tokens"),
      output: pick(rawSession, "outputTokens", "output_tokens"),
      reasoning: pick(rawSession, "reasoningTokens", "reasoning_tokens"),
      cacheRead: pick(rawSession, "cacheReadTokens", "cache_read_tokens"),
      cacheWrite: pick(rawSession, "cacheWriteTokens", "cache_write_tokens"),
      total: pick(rawSession, "totalTokens", "total_tokens"),
    }) ??
    normalizeUsage(totalsRaw) ??
    sumUsage(entries);
  const cost =
    normalizeCost(pick(rawSession, "cost", "costBreakdown", "cost_breakdown")) ??
    normalizeCost({
      input: pick(rawSession, "costInputMicro", "cost_input_micro", "costInput", "cost_input"),
      output: pick(rawSession, "costOutputMicro", "cost_output_micro", "costOutput", "cost_output"),
      cacheRead: pick(rawSession, "costCacheReadMicro", "cost_cache_read_micro", "costCacheRead", "cost_cache_read"),
      cacheWrite: pick(rawSession, "costCacheWriteMicro", "cost_cache_write_micro", "costCacheWrite", "cost_cache_write"),
      total: pick(rawSession, "costTotalMicro", "cost_total_micro", "costTotal", "cost_total"),
    }) ??
    normalizeCost(totalsRaw) ??
    sumCost(entries);
  const modelsRaw =
    pick(rawSession, "models", "modelDistribution", "model_distribution") ??
    pick(data, "models");
  const namedModels = normalizeModels(modelsRaw);
  const derivedModels = deriveModels(entries);
  const models: ModelRef[] = namedModels.map((model) => {
    const derived = derivedModels.find(
      (candidate) => candidate.model === model.model && candidate.provider === model.provider,
    );
    return {
      ...model,
      totalTokens: model.totalTokens || derived?.totalTokens,
      cost: model.cost || derived?.cost,
    };
  });
  for (const derived of derivedModels) {
    if (!models.some((model) => model.model === derived.model)) models.push(derived);
  }
  const sessionId =
    pickString(rawSession, "sessionId", "session_id", "id") ?? pickString(root, "sessionId", "id") ?? "unknown";
  const title =
    pickString(rawSession, "sessionName", "session_name", "title", "name") ?? deriveTitle(entries);
  const parseStatusRaw = pickString(rawSession, "parseStatus", "parse_status", "status");
  const parseStatus =
    parseStatusRaw === "error" || parseStatusRaw === "warning" || parseStatusRaw === "ok"
      ? parseStatusRaw
      : warnings.length > 0
        ? "warning"
        : "ok";
  const relatedRaw = pick(data, "relatedSessions", "related_sessions") ?? pick(root, "relatedSessions", "related_sessions");
  const relatedSessions = Array.isArray(relatedRaw)
    ? relatedRaw.flatMap((item) => {
        if (!isObj(item)) return [];
        const sessionId = pickString(item, "sessionId", "session_id");
        return sessionId
          ? [{
              sessionId,
              title: pickString(item, "title", "sessionName", "session_name") ?? undefined,
              costTotal: pickNumber(item, "costTotal", "cost_total") ?? 0,
              totalTokens: pickNumber(item, "totalTokens", "total_tokens") ?? 0,
            }]
          : [];
      })
    : [];
  const ownCost = cost.total;
  const relatedCostTotal = pickNumber(data, "relatedCostTotal", "related_cost_total") ?? 0;
  const combinedCostTotal = pickNumber(data, "combinedCostTotal", "combined_cost_total") ?? ownCost + relatedCostTotal;

  const session: NormalizedSession = {
    id: sessionId,
    sessionId,
    title,
    sessionName: pickString(rawSession, "sessionName", "session_name"),
    cwd: pickString(rawSession, "cwd", "workingDirectory", "working_directory"),
    startedAt,
    lastActivityAt,
    durationMs,
    fileName: pickString(rawSession, "fileName", "file_name"),
    filePath: pickString(rawSession, "filePath", "file_path"),
    fileSize: pickNumber(rawSession, "fileSize", "file_size", "size"),
    models,
    primaryModel: pickString(rawSession, "primaryModel", "primary_model") ?? models[0]?.model,
    counts,
    usage,
    cost,
    parseStatus,
  };
  return { session, entries, warnings, relatedSessions, relatedCostTotal, combinedCostTotal };
}
