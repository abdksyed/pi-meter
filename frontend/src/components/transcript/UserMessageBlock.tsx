import { contentText } from "../../lib/normalize";
import type { TranscriptItem } from "../../lib/sessionTypes";
import { formatChars } from "../session/format";
import { CopyButton } from "./controls/CopyButton";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryHeader } from "./EntryHeader";
import { MessageContent } from "./content/MessageContent";

export function UserMessageBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const text = contentText(entry.content);
  const hasContent = entry.content.length > 0;
  const titleId = `${item.anchor}-title`;

  return (
    <article className="pm-entry__article pm-user" aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        User message at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone="user"
        label="USER"
        timestamp={entry.timestamp}
        telemetry={<span className="pm-mono">{formatChars(text.length)}</span>}
        actions={<CopyButton text={text} label="Copy message" />}
      />
      <div className="pm-entry__body">
        {hasContent ? (
          <MessageContent blocks={entry.content} entryKey={entry.key} />
        ) : (
          <p className="pm-muted">No content recorded.</p>
        )}
      </div>
      <EntryDetails entry={entry} />
    </article>
  );
}
