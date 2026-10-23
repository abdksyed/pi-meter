/** Display-only sanitization. Copy actions always use the original raw text. */

const OSC = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;
const CSI = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const OTHER_ESCAPE = /\u001B[@-_]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripAnsi(input: string): string {
  return input.replace(OSC, "").replace(CSI, "").replace(OTHER_ESCAPE, "");
}

export function sanitizeText(input: string): string {
  return stripAnsi(input)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(CONTROL, "\uFFFD");
}

export function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split("\n").length;
}

export interface Preview {
  text: string;
  lines: number;
  truncated: boolean;
  shownLines: number;
}

export function buildPreview(text: string, maxLines: number, maxChars: number): Preview {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const shown = lines.slice(0, maxLines);
  let preview = shown.join("\n");
  let truncated = totalLines > maxLines;
  if (preview.length > maxChars) {
    preview = preview.slice(0, maxChars);
    truncated = true;
  }
  return {
    text: preview,
    lines: totalLines,
    truncated,
    shownLines: Math.min(totalLines, preview.split("\n").length),
  };
}

export function truncateHard(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}
