import type { ToolExecutionData } from "./sessionTypes";

type Args = Record<string, unknown>;

const asObject = (value: unknown): Args | undefined => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Args;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Args;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return undefined;
};

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const clip = (value: string, max = 120): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

function countLines(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  return value.length === 0 ? 0 : value.split("\n").length;
}

function scalarSummary(args: Args): string | undefined {
  for (const [key, value] of Object.entries(args)) {
    const scalar = asString(value);
    if (scalar) return clip(`${key}: ${scalar}`, 100);
    const n = asNumber(value);
    if (n !== undefined) return `${key}: ${n}`;
  }
  return undefined;
}

export interface ToolSummary {
  title: string;
  detail?: string;
}

export function summarizeTool(name: string, rawArgs: unknown): ToolSummary {
  const args = asObject(rawArgs);
  const lower = name.toLowerCase();
  const path =
    args && (asString(args.path) ?? asString(args.file) ?? asString(args.filePath) ?? asString(args.file_path));
  const command =
    args && (asString(args.command) ?? asString(args.cmd) ?? asString(args.script) ?? asString(args.input));

  if (!args) {
    const text = asString(rawArgs);
    return text ? { title: clip(text, 140) } : { title: name };
  }

  if (lower.includes("bash") || lower.includes("command") || lower.includes("shell") || lower.includes("exec")) {
    if (command) return { title: clip(command.replace(/\s+/g, " "), 160) };
  }
  if (lower === "read" || lower.includes("read_file") || lower.includes("readfile")) {
    if (path) {
      const offset = asNumber(args.offset);
      const limit = asNumber(args.limit);
      const range =
        offset !== undefined || limit !== undefined
          ? ` · ${offset !== undefined ? `offset ${offset}` : ""}${offset !== undefined && limit !== undefined ? ", " : ""}${limit !== undefined ? `limit ${limit}` : ""}`
          : "";
      return { title: clip(path, 140), detail: range.trim() || undefined };
    }
  }
  if (lower.includes("write") || lower.includes("create_file")) {
    if (path) {
      const lines = countLines(args.content ?? args.text);
      return { title: clip(path, 140), detail: lines !== undefined ? `${lines} lines written` : undefined };
    }
  }
  if (lower.includes("edit") || lower.includes("patch") || lower.includes("replace")) {
    if (path) {
      const edits = Array.isArray(args.edits) ? args.edits.length : undefined;
      return { title: clip(path, 140), detail: edits !== undefined ? `${edits} edit${edits === 1 ? "" : "s"}` : undefined };
    }
  }
  if (lower.includes("grep") || lower.includes("search") || lower.includes("find")) {
    const pattern = asString(args.pattern) ?? asString(args.query) ?? asString(args.regex);
    if (pattern) {
      return { title: clip(pattern, 100), detail: path ? clip(path, 100) : undefined };
    }
  }
  if (lower.includes("ls") || lower.includes("list") || lower.includes("glob")) {
    if (path) return { title: clip(path, 140) };
  }
  if (lower.includes("subagent") || lower.includes("agent") || lower.includes("task")) {
    const task = asString(args.task) ?? asString(args.description) ?? asString(args.prompt);
    if (task) return { title: clip(task, 160) };
  }
  if (lower.includes("fetch") || lower.includes("http") || lower.includes("web")) {
    const url = asString(args.url);
    if (url) return { title: clip(url, 140) };
  }
  if (path) return { title: clip(path, 140), detail: scalarSummary(args) };

  return { title: clip(scalarSummary(args) ?? JSON.stringify(args), 140) };
}

export function toolStatus(execution: ToolExecutionData): "pending" | "ok" | "error" {
  if (execution.results.length === 0) return "pending";
  return execution.isError ? "error" : "ok";
}

export function toolStatusLabel(execution: ToolExecutionData): string {
  const status = toolStatus(execution);
  if (status === "pending") return "No result recorded";
  return status === "error" ? "✖ Error" : "✓ OK";
}

export function toolArgsKeyCount(rawArgs: unknown): number {
  const args = asObject(rawArgs);
  return args ? Object.keys(args).length : 0;
}

export function isTinyArguments(rawArgs: unknown): boolean {
  const args = asObject(rawArgs);
  if (!args) return false;
  const keys = Object.keys(args);
  if (keys.length === 0 || keys.length > 2) return false;
  return JSON.stringify(args).length <= 120;
}
