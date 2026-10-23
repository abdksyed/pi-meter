import { contentText } from "../../lib/normalize";
import type { TranscriptItem } from "../../lib/sessionTypes";
import { CopyButton } from "./controls/CopyButton";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryHeader } from "./EntryHeader";
import { MessageContent } from "./content/MessageContent";

function labelFor(item: TranscriptItem): string {
  switch (item.entry.kind) {
    case "model-change":
      return "MODEL CHANGE";
    case "thinking-level-change":
      return "THINKING LEVEL";
    case "session-info":
      return "SESSION INFO";
    case "label":
      return "LABEL";
    case "custom":
      return "CUSTOM";
    case "custom-message":
      return "CUSTOM MESSAGE";
    default:
      return "SYSTEM";
  }
}

function describe(item: TranscriptItem): string {
  const entry = item.entry;
  switch (entry.kind) {
    case "model-change":
      return entry.model
        ? item.previousModel
          ? `${item.previousModel} → ${entry.model}`
          : `Model set to ${entry.model}`
        : "Model changed";
    case "thinking-level-change":
      return entry.thinkingLevel
        ? item.previousThinkingLevel
          ? `${item.previousThinkingLevel} → ${entry.thinkingLevel}`
          : `Thinking level set to ${entry.thinkingLevel}`
        : "Thinking level changed";
    case "session-info":
      return entry.sessionName ? `Session renamed to ${entry.sessionName}` : "Session metadata updated";
    case "label":
      return entry.label ? `Label: ${entry.label}` : "Label updated";
    case "custom":
      return `Custom event${entry.customType ? `: ${entry.customType}` : ""}`;
    case "custom-message":
      return entry.customType ? `Custom message: ${entry.customType}` : "Custom message";
    default:
      return `System event · ${entry.type}`;
  }
}

export function SystemEventBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const text = contentText(entry.content);
  const titleId = `${item.anchor}-title`;
  const isCustomMessage = entry.kind === "custom-message";

  return (
    <article className={`pm-entry__article pm-system${isCustomMessage ? " pm-system--message" : ""}`} aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        {labelFor(item)} at {entry.timestamp ?? "unknown time"}: {describe(item)}
      </h3>
      <EntryHeader
        tone="system"
        label={labelFor(item)}
        timestamp={entry.timestamp}
        meta={
          <>
            <span className="pm-system__description">{describe(item)}</span>
            {entry.model ? <span className="pm-chip pm-mono">{entry.model}</span> : null}
            {entry.provider ? <span className="pm-chip">{entry.provider}</span> : null}
            {entry.label && entry.kind !== "label" ? <span className="pm-chip">{entry.label}</span> : null}
          </>
        }
        actions={isCustomMessage && text ? <CopyButton text={text} label="Copy message" /> : null}
      />
      {isCustomMessage && entry.content.length > 0 ? (
        <div className="pm-entry__body">
          <MessageContent blocks={entry.content} entryKey={entry.key} />
        </div>
      ) : null}
      <EntryDetails entry={entry} />
    </article>
  );
}
