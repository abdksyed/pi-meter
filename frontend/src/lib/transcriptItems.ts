import { argumentsText, contentText } from "./normalize";
import type {
  ContentBlock,
  NormalizedEntry,
  ToolExecutionData,
  ToolResultData,
  TranscriptCounts,
  TranscriptFilter,
  TranscriptItem,
  TranscriptItemType,
} from "./sessionTypes";

function imagesOf(blocks: ContentBlock[]) {
  return blocks.filter((block): block is Extract<ContentBlock, { kind: "image" }> => block.kind === "image");
}

export function toolResultText(entry: NormalizedEntry): string {
  return contentText(entry.content);
}

function resultFromEntry(entry: NormalizedEntry): ToolResultData {
  return {
    key: entry.key,
    entry,
    text: toolResultText(entry),
    images: imagesOf(entry.content),
    isError: entry.isError,
  };
}

function executionFromCall(
  entry: NormalizedEntry,
  block: Extract<ContentBlock, { kind: "tool-call" }>,
  position: number,
  results: ToolResultData[],
): ToolExecutionData {
  return {
    key: `${entry.key}-tool-${position}`,
    callId: block.id,
    name: block.name,
    arguments: block.arguments,
    argsText: argumentsText(block.arguments),
    call: entry,
    results,
    isError: results.some((result) => result.isError),
  };
}

function itemTypeFor(entry: NormalizedEntry): TranscriptItemType {
  switch (entry.kind) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool-result":
      return "tool-result";
    case "system-prompt":
      return "system-prompt";
    case "compaction":
      return "compaction";
    case "context-edit":
      return "context-edit";
    case "branch-summary":
      return "branch-summary";
    case "usage":
      return "usage";
    case "custom-message":
      return "custom-message";
    case "unknown":
      return "unknown";
    default:
      return "system";
  }
}

function entryText(entry: NormalizedEntry): string[] {
  const parts: string[] = [];
  for (const block of entry.content) {
    if (block.kind === "text" || block.kind === "thinking") parts.push(block.text);
    if (block.kind === "tool-call") {
      parts.push(block.name);
      parts.push(argumentsText(block.arguments));
    }
  }
  if (entry.model) parts.push(entry.model);
  if (entry.provider) parts.push(entry.provider);
  if (entry.toolName) parts.push(entry.toolName);
  if (entry.summary) parts.push(entry.summary);
  if (entry.label) parts.push(entry.label);
  if (entry.sessionName) parts.push(entry.sessionName);
  if (entry.customType) parts.push(entry.customType);
  if (entry.targetId) parts.push(entry.targetId);
  if (entry.replacement) parts.push(entry.replacement);
  for (const file of entry.readFiles) parts.push(file);
  for (const file of entry.modifiedFiles) parts.push(file);
  return parts;
}

export function buildTranscriptItems(entries: NormalizedEntry[]): TranscriptItem[] {
  const assistantCallIds = new Set<string>();
  const resultsByCall = new Map<string, ToolResultData[]>();
  for (const entry of entries) {
    if (entry.kind === "assistant") {
      for (const block of entry.content) {
        if (block.kind === "tool-call" && block.id) assistantCallIds.add(block.id);
      }
    }
    if (entry.kind === "tool-result" && entry.toolCallId) {
      const list = resultsByCall.get(entry.toolCallId) ?? [];
      list.push(resultFromEntry(entry));
      resultsByCall.set(entry.toolCallId, list);
    }
  }

  const items: TranscriptItem[] = [];
  let previousModel: string | undefined;
  let previousThinking: string | undefined;

  for (const entry of entries) {
    const type = itemTypeFor(entry);

    if (type === "tool-result" && entry.toolCallId && assistantCallIds.has(entry.toolCallId)) {
      continue;
    }

    const item: TranscriptItem = {
      key: entry.key,
      type,
      entry,
      anchor: entry.key,
      executions: [],
      searchText: "",
      previousModel,
      previousThinkingLevel: previousThinking,
    };

    if (type === "assistant") {
      let position = 0;
      for (const block of entry.content) {
        if (block.kind !== "tool-call") continue;
        const results = block.id ? (resultsByCall.get(block.id) ?? []) : [];
        item.executions.push(executionFromCall(entry, block, position, results));
        position += 1;
      }
    }

    const parts = entryText(entry);
    if (type === "assistant") {
      for (const execution of item.executions) {
        parts.push(execution.name, execution.argsText);
        for (const result of execution.results) parts.push(result.text);
      }
    }
    if (type === "tool-result") {
      parts.push(toolResultText(entry));
    }
    if (type === "system-prompt") {
      // The system prompt is intentionally excluded from transcript search.
      item.searchText = "";
    } else {
      item.searchText = parts.join("\n");
    }

    if (entry.model) previousModel = entry.model;
    if (entry.thinkingLevel) previousThinking = entry.thinkingLevel;
    items.push(item);
  }

  return items;
}

export function computeTranscriptCounts(
  items: TranscriptItem[],
  warningCount = 0,
): TranscriptCounts {
  let user = 0;
  let assistant = 0;
  let tools = 0;
  let errors = warningCount;
  for (const item of items) {
    switch (item.type) {
      case "user":
        user += 1;
        break;
      case "assistant":
        assistant += 1;
        tools += item.executions.length;
        errors += item.executions.filter((execution) => execution.isError).length;
        break;
      case "tool-result":
        tools += 1;
        if (item.entry.isError) errors += 1;
        break;
      default:
        if (item.entry.isError) errors += 1;
        break;
    }
  }
  return { all: items.length, user, assistant, tools, errors };
}

export function filterTranscriptItems(
  items: TranscriptItem[],
  filter: TranscriptFilter,
): TranscriptItem[] {
  switch (filter) {
    case "user":
      return items.filter((item) => item.type === "user");
    case "assistant":
      return items.filter((item) => item.type === "assistant");
    case "tools":
      return items.filter(
        (item) => item.type === "tool-result" || item.executions.length > 0,
      );
    case "errors":
      return items.filter(
        (item) =>
          item.type === "tool-result"
            ? item.entry.isError
            : item.executions.some((execution) => execution.isError) || item.entry.isError,
      );
    default:
      return items;
  }
}

export function toolExecutionAnchor(item: TranscriptItem, execution: ToolExecutionData): string {
  return `${item.anchor}-${execution.key.split("-tool-")[1] ? `tool-${execution.key.split("-tool-")[1]}` : execution.key}`;
}

export function flattenToolExecutions(items: TranscriptItem[]): ToolExecutionData[] {
  return items.flatMap((item) => item.executions);
}
