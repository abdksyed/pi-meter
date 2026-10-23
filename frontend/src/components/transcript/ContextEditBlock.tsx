import type { TranscriptItem } from "../../lib/sessionTypes";
import { useTranscriptContext } from "./TranscriptContext";
import { CollapsibleCode } from "./controls/CollapsibleCode";
import { CopyButton } from "./controls/CopyButton";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryHeader } from "./EntryHeader";

export function ContextEditBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const { entryAnchors, matchedItemKeys } = useTranscriptContext();
  const targetAnchor = entry.targetId ? entryAnchors.get(entry.targetId) : undefined;
  const removed = entry.replacement === null;
  const titleId = `${item.anchor}-title`;

  return (
    <article className="pm-entry__article pm-context-edit" aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        Context edit at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone="neutral"
        label="CONTEXT EDIT"
        timestamp={entry.timestamp}
        meta={
          <span>
            {removed
              ? "An earlier message was removed from future model context."
              : "An earlier message was replaced in future model context."}{" "}
            The original entry remains in the raw timeline.
          </span>
        }
      />
      <div className="pm-entry__body">
        <div className="pm-context-edit__targets">
          {entry.targetId ? (
            targetAnchor ? (
              <a className="pm-link pm-mono" href={`#${targetAnchor}`}>
                Jump to entry {targetAnchor.replace("entry-", "#")}
              </a>
            ) : (
              <span className="pm-mono">Target: {entry.targetId}</span>
            )
          ) : (
            <span className="pm-muted">No target recorded.</span>
          )}
          {entry.replacement ? <CopyButton text={entry.replacement} label="Copy replacement" /> : null}
        </div>
        {entry.replacement ? (
          <CollapsibleCode
            text={entry.replacement}
            label="Replacement content"
            previewLines={8}
            previewChars={1200}
            copyLabel="Copy replacement"
            openKey={`${entry.key}-replacement`}
            forceOpen={matchedItemKeys.has(entry.key)}
          />
        ) : null}
      </div>
      <EntryDetails entry={entry} />
    </article>
  );
}
