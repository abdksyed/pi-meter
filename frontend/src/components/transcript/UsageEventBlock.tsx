import type { TranscriptItem } from "../../lib/sessionTypes";
import { formatCost, formatTokens } from "../session/format";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryUsageDetails } from "./controls/EntryUsageDetails";
import { EntryHeader } from "./EntryHeader";

export function UsageEventBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const titleId = `${item.anchor}-title`;
  return (
    <article className="pm-entry__article pm-usage-event" aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        Usage record at {entry.timestamp ?? "unknown time"}
      </h3>
      <EntryHeader
        tone="neutral"
        label="USAGE"
        timestamp={entry.timestamp}
        meta={entry.model ? <span className="pm-chip pm-mono">{entry.model}</span> : undefined}
        telemetry={
          <>
            {entry.usage ? <span className="pm-mono">{formatTokens(entry.usage.totalTokens)}</span> : null}
            {entry.cost ? <span className="pm-mono">{formatCost(entry.cost.total)}</span> : null}
          </>
        }
      />
      <EntryUsageDetails entry={entry} />
      <EntryDetails entry={entry} />
    </article>
  );
}
