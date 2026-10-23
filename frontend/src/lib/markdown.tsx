import { Fragment, type ReactNode } from "react";
import { sanitizeText } from "./ansi";
import { CodeFrame } from "../components/transcript/content/CodeFrame";
import { HighlightedText } from "../components/transcript/controls/HighlightedText";

const MAX_MARKDOWN_CHARS = 100_000;

interface MarkdownProps {
  text: string;
  query?: string;
  className?: string;
}

const INLINE_SOURCE =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|!?\[[^\]\n]*\]\([^)\s]+\))/.source;

function safeHref(url: string): string | undefined {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return undefined;
}

function renderInline(text: string, query: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(INLINE_SOURCE, "g");
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <HighlightedText
          key={`${keyPrefix}-t-${lastIndex}`}
          text={text.slice(lastIndex, match.index)}
          query={query}
        />,
      );
    }
    const token = match[0];
    const key = `${keyPrefix}-m-${match.index}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="pm-md__code-inline">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key}>{renderInline(token.slice(2, -2), query, `${key}-b`)}</strong>,
      );
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{renderInline(token.slice(2, -2), query, `${key}-s`)}</del>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), query, `${key}-i`)}</em>);
    } else if (token.startsWith("![")) {
      const label = token.slice(2, token.indexOf("]"));
      nodes.push(
        <span key={key} className="pm-md__image-placeholder">
          Image: {label || "untitled"}
        </span>,
      );
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const url = token.slice(token.indexOf("](") + 2, -1);
      const href = safeHref(url);
      if (href) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {renderInline(label, query, `${key}-l`)}
          </a>,
        );
      } else {
        nodes.push(<span key={key}>{label || url}</span>);
      }
    } else {
      nodes.push(<HighlightedText key={key} text={token} query={query} />);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(
      <HighlightedText key={`${keyPrefix}-t-end`} text={text.slice(lastIndex)} query={query} />,
    );
  }
  return nodes;
}

const isFence = (line: string) => /^\s*(```|~~~)/.test(line);
const isHeading = (line: string) => /^#{1,6}\s+/.test(line);
const isHr = (line: string) => /^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.trim().length >= 3;
const isQuote = (line: string) => /^\s*>\s?/.test(line);
const isListItem = (line: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
const isTableSeparator = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

function headingLevel(hashes: number): 3 | 4 | 5 | 6 {
  if (hashes <= 1) return 3;
  if (hashes === 2) return 4;
  if (hashes === 3) return 5;
  return 6;
}

export function Markdown({ text, query = "", className }: MarkdownProps) {
  if (text.length > MAX_MARKDOWN_CHARS) {
    return <pre className={`pm-md pm-md--plain ${className ?? ""}`}>{sanitizeText(text)}</pre>;
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const fenceMatch = line.trim().match(/^(```|~~~)\s*([^\s`]*)/);
      const fence = fenceMatch?.[1] ?? "```";
      const language = fenceMatch?.[2] || undefined;
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <CodeFrame
          key={`code-${key++}`}
          code={code.join("\n")}
          language={language}
          query={query}
        />,
      );
      continue;
    }

    if (isHeading(line)) {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      const level = headingLevel(match?.[1].length ?? 1);
      const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
      blocks.push(
        <Tag key={`h-${key++}`} className="pm-md__heading">
          {renderInline(match?.[2] ?? "", query, `h-${key}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (isHr(line)) {
      blocks.push(<hr key={`hr-${key++}`} className="pm-md__rule" />);
      index += 1;
      continue;
    }

    if (isQuote(line)) {
      const quote: string[] = [];
      while (index < lines.length && isQuote(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`q-${key++}`} className="pm-md__quote">
          {renderInline(quote.join(" "), query, `q-${key}`)}
        </blockquote>,
      );
      continue;
    }

    if (isListItem(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && isListItem(lines[index])) {
        items.push(lines[index].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        index += 1;
        while (
          index < lines.length &&
          lines[index].trim() &&
          !isListItem(lines[index]) &&
          !isFence(lines[index]) &&
          !isHeading(lines[index]) &&
          !isQuote(lines[index])
        ) {
          items[items.length - 1] += ` ${lines[index].trim()}`;
          index += 1;
        }
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={`list-${key++}`} className="pm-md__list">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, query, `li-${key}-${itemIndex}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
      const header = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <table key={`table-${key++}`} className="pm-md__table">
          <thead>
            <tr>
              {header.map((cell, cellIndex) => (
                <th key={cellIndex} scope="col">
                  {renderInline(cell, query, `th-${key}-${cellIndex}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{renderInline(cell, query, `td-${key}-${rowIndex}-${cellIndex}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isFence(lines[index]) &&
      !isHeading(lines[index]) &&
      !isHr(lines[index]) &&
      !isQuote(lines[index]) &&
      !isListItem(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`p-${key++}`} className="pm-md__paragraph">
        {renderInline(paragraph.join("\n"), query, `p-${key}`)}
      </p>,
    );
  }

  return <div className={`pm-md ${className ?? ""}`}>{blocks.map((block, i) => <Fragment key={i}>{block}</Fragment>)}</div>;
}
