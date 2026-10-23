import { argumentsText } from "../../lib/normalize";
import type { ToolExecutionData } from "../../lib/sessionTypes";
import { isTinyArguments, summarizeTool, toolArgsKeyCount, toolStatusLabel } from "../../lib/toolSummary";
import { formatDuration } from "../session/format";
import { useTranscriptContext } from "./TranscriptContext";
import { CollapsibleCode } from "./controls/CollapsibleCode";
import { CopyButton } from "./controls/CopyButton";
import { EntryHeader } from "./EntryHeader";

interface ToolCallBlockProps {
  execution: ToolExecutionData;
  itemKey: string;
}

export function ToolCallBlock({ execution, itemKey }: ToolCallBlockProps) {
  const { matchedItemKeys } = useTranscriptContext();
  const forceOpen = matchedItemKeys.has(itemKey);
  const summary = summarizeTool(execution.name, execution.arguments);
  const status = toolStatusLabel(execution);
  const argsText = execution.argsText || argumentsText(execution.arguments);
  const keyCount = toolArgsKeyCount(execution.arguments);
  const defaultOpen = isTinyArguments(execution.arguments);
  const tone = execution.results.length === 0 ? "neutral" : execution.isError ? "error" : "success";

  return (
    <section className="pm-tool pm-tool--call" aria-label={`Tool call ${execution.name}`}>
      <EntryHeader
        tone="tool"
        label="TOOL CALL"
        className="pm-tool__head"
        meta={
          <>
            <span className="pm-tool__name pm-mono">{execution.name}</span>
            <span className="pm-tool__summary" title={summary.title}>
              {summary.title}
            </span>
            {summary.detail ? <span className="pm-tool__detail">{summary.detail}</span> : null}
          </>
        }
        telemetry={
          <>
            <span className={`pm-status pm-status--${tone}`}>{status}</span>
            {execution.results[0]?.entry.durationMs !== undefined ? (
              <span className="pm-mono">{formatDuration(execution.results[0].entry.durationMs)}</span>
            ) : null}
          </>
        }
        actions={<CopyButton text={argsText} label="Copy arguments" />}
      />
      <CollapsibleCode
        className="pm-tool__args"
        text={argsText}
        label={`Arguments${keyCount > 0 ? ` · ${keyCount} ${keyCount === 1 ? "key" : "keys"}` : ""}`}
        language="json"
        previewLines={2}
        previewChars={240}
        openKey={`${execution.key}-args`}
        defaultOpen={defaultOpen}
        forceOpen={forceOpen}
        collapsible
        hideCopy
      />
    </section>
  );
}
