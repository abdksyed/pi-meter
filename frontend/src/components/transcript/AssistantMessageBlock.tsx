import { contentText } from "../../lib/normalize";
import type { ToolCallContent, TranscriptItem } from "../../lib/sessionTypes";
import { formatCost, formatDuration, formatTokens } from "../session/format";
import { CopyButton } from "./controls/CopyButton";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryUsageDetails } from "./controls/EntryUsageDetails";
import { EntryHeader } from "./EntryHeader";
import { MessageContent } from "./content/MessageContent";
import { ToolExecution } from "./ToolExecution";

interface AssistantMessageBlockProps {
  item: TranscriptItem;
  toolsOnly?: boolean;
}

export function AssistantMessageBlock({ item, toolsOnly = false }: AssistantMessageBlockProps) {
  const { entry, executions } = item;
  const titleId = `${item.anchor}-title`;
  const text = contentText(entry.content);
  const byCallId = new Map(executions.filter((execution) => execution.callId).map((execution) => [execution.callId as string, execution]));
  const rendered = new Set<string>();
  const hasContent = entry.content.some((block) => block.kind !== "tool-call");
  const isError = entry.isError || entry.stopReason === "error";

  const renderToolCall = (block: ToolCallContent) => {
    const execution = block.id ? byCallId.get(block.id) : undefined;
    if (!execution) return null;
    rendered.add(execution.key);
    return <ToolExecution execution={execution} itemKey={item.key} />;
  };

  return (
    <article className={`pm-entry__article pm-assistant${isError ? " pm-assistant--error" : ""}`} aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        Assistant response from {entry.model ?? "unknown model"} at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone="assistant"
        label="ASSISTANT"
        timestamp={entry.timestamp}
        meta={
          <>
            {entry.model ? <span className="pm-chip pm-chip--model pm-mono">{entry.model}</span> : null}
            {entry.provider ? <span className="pm-chip" title={entry.provider}>{entry.provider}</span> : null}
            {entry.thinkingLevel ? <span className="pm-chip">thinking · {entry.thinkingLevel}</span> : null}
          </>
        }
        telemetry={
          <>
            {entry.durationMs !== undefined ? (
              <span className="pm-mono">{formatDuration(entry.durationMs)}</span>
            ) : null}
            {entry.usage ? <span className="pm-mono">{formatTokens(entry.usage.totalTokens)}</span> : null}
            {entry.cost ? <span className="pm-mono">{formatCost(entry.cost.total)}</span> : null}
          </>
        }
        actions={!toolsOnly ? <CopyButton text={text} label="Copy message" /> : null}
      />

      {isError ? (
        <p className="pm-entry__error-strip">
          ✖ Error{entry.errorMessage ? `: ${entry.errorMessage}` : ""}
          {entry.stopReason ? ` · stop reason: ${entry.stopReason}` : ""}
        </p>
      ) : null}

      {!toolsOnly ? (
        <div className="pm-entry__body">
          {hasContent || executions.length === 0 ? (
            hasContent ? (
              <MessageContent
                blocks={entry.content}
                entryKey={entry.key}
                renderToolCall={renderToolCall}
              />
            ) : (
              <p className="pm-muted">No content recorded.</p>
            )
          ) : null}
        </div>
      ) : null}

      {executions.length > 0 ? (
        <div className={`pm-entry__tools${toolsOnly ? " pm-entry__tools--flat" : ""}`}>
          {executions.map((execution) => {
            if (rendered.has(execution.key)) return null;
            return <ToolExecution key={execution.key} execution={execution} itemKey={item.key} />;
          })}
        </div>
      ) : null}

      {!toolsOnly ? <EntryUsageDetails entry={entry} /> : null}
      {!toolsOnly ? <EntryDetails entry={entry} /> : null}
    </article>
  );
}
