import type { EntryKind } from "./sessionTypes";

const KIND_BY_TYPE: Record<string, EntryKind> = {
  session: "session-info",
  session_info: "session-info",
  sessioninfo: "session-info",
  model_change: "model-change",
  modelchange: "model-change",
  thinking_level_change: "thinking-level-change",
  thinkinglevelchange: "thinking-level-change",
  compaction: "compaction",
  context_edit: "context-edit",
  contextedit: "context-edit",
  branch_summary: "branch-summary",
  branchsummary: "branch-summary",
  usage: "usage",
  label: "label",
  custom: "custom",
  custom_message: "custom-message",
  custommessage: "custom-message",
  system: "system-prompt",
};

export function classifyEntry(
  type: string,
  role: string | undefined,
  hasSections: boolean,
): EntryKind {
  if (type === "message") {
    switch (role) {
      case "user":
        return "user";
      case "assistant":
        return "assistant";
      case "toolResult":
      case "tool_result":
      case "tool":
        return "tool-result";
      case "system":
        return hasSections ? "system-prompt" : "system";
      case "custom":
        return "custom-message";
      default:
        return "unknown";
    }
  }
  if (type === "system") return hasSections ? "system-prompt" : "system";
  return KIND_BY_TYPE[type] ?? "unknown";
}

export function isUserKind(kind: EntryKind): boolean {
  return kind === "user";
}

export function isAssistantKind(kind: EntryKind): boolean {
  return kind === "assistant";
}

export function isToolResultKind(kind: EntryKind): boolean {
  return kind === "tool-result";
}

export function isErrorKind(kind: EntryKind): boolean {
  return kind === "tool-result";
}

/** Default-open policy shared by the disclosure controls. */
export function defaultOpenFor(kind: EntryKind): boolean {
  switch (kind) {
    case "compaction":
    case "branch-summary":
    case "system-prompt":
      return false;
    default:
      return false;
  }
}
