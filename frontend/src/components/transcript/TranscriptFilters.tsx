import type { TranscriptCounts, TranscriptFilter } from "../../lib/sessionTypes";

const FILTERS: { key: TranscriptFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "user", label: "User" },
  { key: "assistant", label: "Assistant" },
  { key: "tools", label: "Tools" },
  { key: "errors", label: "Errors" },
];

interface TranscriptFiltersProps {
  filter: TranscriptFilter;
  counts: TranscriptCounts;
  onChange: (filter: TranscriptFilter) => void;
}

export function TranscriptFilters({ filter, counts, onChange }: TranscriptFiltersProps) {
  return (
    <div className="pm-filters" role="group" aria-label="Filter transcript">
      {FILTERS.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className={`pm-filter${filter === entry.key ? " is-active" : ""}`}
          aria-pressed={filter === entry.key}
          onClick={() => onChange(entry.key)}
        >
          {entry.label} <span className="pm-filter__count">({counts[entry.key]})</span>
        </button>
      ))}
    </div>
  );
}
