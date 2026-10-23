import { lineCount } from "../../lib/ansi";
import type { ToolResultData } from "../../lib/sessionTypes";
import { summarizeTool } from "../../lib/toolSummary";
import { formatBytes, formatDuration } from "../session/format";
import { useTranscriptContext } from "./TranscriptContext";
import { CollapsibleCode } from "./controls/CollapsibleCode";
import { EntryHeader } from "./EntryHeader";
import { ImageBlock } from "./content/ImageBlock";

interface ToolResultBlockProps {
  result: ToolResultData;
  toolName: string;
  itemKey: string;
  args: unknown;
  index: number;
}

export function ToolResultBlock({ result, toolName, itemKey, args, index }: ToolResultBlockProps) {
  const { matchedItemKeys } = useTranscriptContext();
  const forceOpen = matchedItemKeys.has(itemKey);
  const summary = summarizeTool(toolName, args);
  const lines = lineCount(result.text);
  const bytes = new TextEncoder().encode(result.text).length;
  const isLong = lines > 8 || result.text.length > 1200;
  const defaultOpen = result.isError || !isLong;
  const tone = result.isError ? "error" : "success";
  const label = result.isError ? "✖ Error" : "✓ OK";

  return (
    <section
      className={`pm-tool pm-tool--result${result.isError ? " pm-tool--error" : ""}`}
      aria-label={`Tool result ${index + 1} for ${toolName}`}
    >
      <EntryHeader
        tone={tone}
        label="TOOL RESULT"
        className="pm-tool__head"
        meta={
          <>
            <span className="pm-tool__name pm-mono">{toolName}</span>
            <span className="pm-tool__summary" title={summary.title}>
              {summary.title}
            </span>
          </>
        }
        telemetry={
          <>
            <span className={`pm-status pm-status--${result.isError ? "error" : "success"}`}>
              {label}
            </span>
            {result.entry.durationMs !== undefined ? (
              <span className="pm-mono">{formatDuration(result.entry.durationMs)}</span>
            ) : null}
            <span className="pm-mono">
              {lines} {lines === 1 ? "line" : "lines"} · {formatBytes(bytes)}
            </span>
          </>
        }
      />
      {result.text ? (
        <CollapsibleCode
          className="pm-tool__output"
          text={result.text}
          label="Result"
          previewLines={8}
          previewChars={1200}
          openKey={`${result.key}-result`}
          defaultOpen={defaultOpen}
          forceOpen={forceOpen}
          copyLabel="Copy result"
          wrap
          emptyText="No output"
        />
      ) : null}
      {result.images.map((image, imageIndex) => (
        <ImageBlock key={`${result.key}-image-${imageIndex}`} image={image} />
      ))}
      {!result.text && result.images.length === 0 ? (
        <p className="pm-tool__empty">No output recorded.</p>
      ) : null}
    </section>
  );
}
