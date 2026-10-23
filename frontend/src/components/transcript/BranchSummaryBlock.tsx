import { Markdown } from "../../lib/markdown";
import { useTranscriptContext } from "./TranscriptContext";
import type { TranscriptItem } from "../../lib/sessionTypes";
import { formatNumber } from "../session/format";
import { CollapsibleSection } from "./controls/CollapsibleSection";
import { CopyButton } from "./controls/CopyButton";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryUsageDetails } from "./controls/EntryUsageDetails";
import { EntryHeader } from "./EntryHeader";
import { FileLists } from "./CompactionBlock";

export function BranchSummaryBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const { query, matchedItemKeys } = useTranscriptContext();
  const summary = entry.summary ?? "";
  const titleId = `${item.anchor}-title`;

  return (
    <article className="pm-entry__article pm-branch-summary" aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        Branch summary at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone="neutral"
        label="BRANCH SUMMARY"
        timestamp={entry.timestamp}
        meta={
          <>
            {entry.parentId ? <span className="pm-mono">parent {entry.parentId}</span> : null}
            {summary ? <span>{formatNumber(summary.length)} chars</span> : null}
          </>
        }
      />
      <div className="pm-entry__body">
        {summary ? (
          <CollapsibleSection
            title="Summary"
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
