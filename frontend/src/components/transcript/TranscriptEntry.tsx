import { contentText } from "../../lib/normalize";
import type { ImageContent, TranscriptItem } from "../../lib/sessionTypes";
import { useTranscriptContext } from "./TranscriptContext";
import { AssistantMessageBlock } from "./AssistantMessageBlock";
import { BranchSummaryBlock } from "./BranchSummaryBlock";
import { CompactionBlock } from "./CompactionBlock";
import { ContextEditBlock } from "./ContextEditBlock";
import { EntryErrorBoundary } from "./EntryErrorBoundary";
import { EntryHeader } from "./EntryHeader";
import { SystemEventBlock } from "./SystemEventBlock";
import { SystemPromptBlock } from "./SystemPromptBlock";
import { ToolResultBlock } from "./ToolResultBlock";
import { UnknownEntryBlock } from "./UnknownEntryBlock";
import { UsageEventBlock } from "./UsageEventBlock";
import { UserMessageBlock } from "./UserMessageBlock";

function StandaloneToolResult({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const text = contentText(entry.content);
  const images = entry.content.filter(
    (block): block is ImageContent => block.kind === "image",
  );
  return (
    <article className="pm-entry__article pm-tool-standalone">
      <h3 className="pm-sr-only">
        Tool result from {entry.toolName ?? "unknown tool"} at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone={entry.isError ? "error" : "neutral"}
        label="TOOL RESULT"
        timestamp={entry.timestamp}
        meta={
          <>
            <span className="pm-mono">{entry.toolName ?? "tool"}</span>
            {entry.toolCallId ? <span className="pm-mono">call {entry.toolCallId}</span> : null}
            <span className="pm-muted">orphan result</span>
          </>
        }
      />
      <ToolResultBlock
        result={{ key: entry.key, entry, text, images, isError: entry.isError }}
        toolName={entry.toolName ?? "tool"}
        itemKey={item.key}
        args={undefined}
        index={0}
      />
    </article>
  );
}

export function TranscriptEntry({
  item,
  toolsOnly = false,
}: {
  item: TranscriptItem;
  toolsOnly?: boolean;
}) {
  const { activeItemKey } = useTranscriptContext();
  const isActive = activeItemKey === item.key;

  const renderBody = () => {
    switch (item.type) {
      case "user":
        return <UserMessageBlock item={item} />;
      case "assistant":
        return <AssistantMessageBlock item={item} toolsOnly={toolsOnly} />;
      case "tool-result":
        return <StandaloneToolResult item={item} />;
      case "system-prompt":
        return <SystemPromptBlock item={item} />;
      case "compaction":
        return <CompactionBlock item={item} />;
      case "context-edit":
        return <ContextEditBlock item={item} />;
      case "branch-summary":
        return <BranchSummaryBlock item={item} />;
      case "usage":
        return <UsageEventBlock item={item} />;
      case "unknown":
        return <UnknownEntryBlock item={item} />;
      case "custom-message":
      case "system":
        return <SystemEventBlock item={item} />;
      default:
        return <UnknownEntryBlock item={item} />;
    }
  };

  return (
    <li
      id={item.anchor}
      className={`pm-entry pm-entry--${item.type}${isActive ? " is-active" : ""}`}
      tabIndex={-1}
      aria-current={isActive ? "true" : undefined}
      data-entry-key={item.key}
    >
      <EntryErrorBoundary entry={item.entry}>{renderBody()}</EntryErrorBoundary>
    </li>
  );
}
