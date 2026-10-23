import { Markdown } from "../../lib/markdown";
import { useTranscriptContext } from "./TranscriptContext";
import type { TranscriptItem } from "../../lib/sessionTypes";
import { formatNumber, formatPercent } from "../session/format";
import { CollapsibleSection } from "./controls/CollapsibleSection";
import { CopyButton } from "./controls/CopyButton";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryUsageDetails } from "./controls/EntryUsageDetails";
import { EntryHeader } from "./EntryHeader";

export function CompactionBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const before = entry.tokensBefore;
  const after = entry.tokensAfter;
  const savings =
    before !== undefined && before > 0 && after !== undefined
      ? ((before - after) / before) * 100
      : undefined;
  const { query, matchedItemKeys } = useTranscriptContext();
  const summary = entry.summary ?? "";
  const titleId = `${item.anchor}-title`;

  return (
    <article className="pm-entry__article pm-compaction" aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        Context compaction at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone="system"
        label="CONTEXT COMPACTION"
        timestamp={entry.timestamp}
        meta={
          <>
            {before !== undefined && after !== undefined ? (
              <span className="pm-mono">
                {formatNumber(before)} → {formatNumber(after)} tokens
              </span>
            ) : null}
            {savings !== undefined ? <span className="pm-chip">{formatPercent(savings)} saved</span> : null}
          </>
        }
      />
      <div className="pm-entry__body">
        {summary ? (
          <CollapsibleSection
            title="Summary"
            meta={`${formatNumber(summary.length)} chars`}
            defaultOpen={summary.length <= 400}
            openKey={`${entry.key}-summary`}
            forceOpen={matchedItemKeys.has(entry.key)}
            actions={<CopyButton text={summary} label="Copy summary" />}
          >
            <Markdown text={summary} query={query} />
          </CollapsibleSection>
        ) : (
          <p className="pm-muted">No summary recorded.</p>
        )}
        <FileLists readFiles={entry.readFiles} modifiedFiles={entry.modifiedFiles} />
      </div>
      <EntryUsageDetails entry={entry} />
      <EntryDetails entry={entry} />
    </article>
  );
}

export function FileLists({ readFiles, modifiedFiles }: { readFiles: string[]; modifiedFiles: string[] }) {
  if (readFiles.length === 0 && modifiedFiles.length === 0) return null;
  return (
    <div className="pm-file-lists">
      {readFiles.length > 0 ? (
        <div>
          <h5 className="pm-micro-label">Read files</h5>
          <ul className="pm-file-list">
            {readFiles.map((file) => (
              <li key={file} className="pm-mono">
                {file}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {modifiedFiles.length > 0 ? (
        <div>
          <h5 className="pm-micro-label">Modified files</h5>
          <ul className="pm-file-list">
            {modifiedFiles.map((file) => (
              <li key={file} className="pm-mono">
                {file}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
