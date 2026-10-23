import type { TranscriptItem } from "../../lib/sessionTypes";
import { CollapsibleCode } from "./controls/CollapsibleCode";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryHeader } from "./EntryHeader";

export function UnknownEntryBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const titleId = `${item.anchor}-title`;
  let json = "";
  try {
    json = JSON.stringify(entry.raw, null, 2);
  } catch {
    json = String(entry.raw);
  }
  return (
    <article className="pm-entry__article pm-unknown" aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        Unknown entry type {entry.type} at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone="neutral"
        label="UNKNOWN"
        timestamp={entry.timestamp}
        meta={<span className="pm-mono">Unknown entry type: {entry.type}</span>}
      />
      <div className="pm-entry__body">
        <CollapsibleCode
          text={json}
          label="Raw entry"
          language="json"
          previewLines={6}
          previewChars={900}
          copyLabel="Copy raw entry"
          openKey={`${entry.key}-raw`}
        />
      </div>
      <EntryDetails entry={entry} />
    </article>
  );
}
