import type { TranscriptCounts, TranscriptFilter } from "../../lib/sessionTypes";
import type { TranscriptSearch as TranscriptSearchState } from "../../hooks/useTranscriptSearch";
import { TranscriptActions } from "./TranscriptActions";
import { TranscriptFilters } from "./TranscriptFilters";
import { TranscriptSearch } from "./TranscriptSearch";

interface TranscriptToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  search: TranscriptSearchState;
  filter: TranscriptFilter;
  counts: TranscriptCounts;
  onFilterChange: (filter: TranscriptFilter) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onJumpToLatest: () => void;
  latestDisabled: boolean;
}

export function TranscriptToolbar({
  query,
  onQueryChange,
  search,
  filter,
  counts,
  onFilterChange,
  onExpandAll,
  onCollapseAll,
  onJumpToLatest,
  latestDisabled,
}: TranscriptToolbarProps) {
  return (
    <div className="pm-toolbar">
      <div className="pm-toolbar__row">
        <TranscriptSearch value={query} onChange={onQueryChange} search={search} />
        <TranscriptFilters filter={filter} counts={counts} onChange={onFilterChange} />
        <TranscriptActions
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
          onJumpToLatest={onJumpToLatest}
          latestDisabled={latestDisabled}
        />
      </div>
    </div>
  );
}
