import { useEffect, useRef } from "react";
import type { TranscriptSearch as TranscriptSearchState } from "../../hooks/useTranscriptSearch";

interface TranscriptSearchProps {
  value: string;
  onChange: (value: string) => void;
  search: TranscriptSearchState;
}

export function TranscriptSearch({ value, onChange, search }: TranscriptSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="pm-search" role="search" aria-label="Search transcript">
      <input
        ref={inputRef}
        type="search"
        className="pm-search__input"
        placeholder="Search transcript…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) search.prev();
            else search.next();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onChange("");
            search.clear();
          }
        }}
        aria-describedby="pm-search-status"
      />
      <span className="pm-search__status" id="pm-search-status" aria-live="polite">
        {value.trim().length === 0
          ? "Press / to search"
          : !search.queryValid
            ? "Type at least 2 characters"
            : search.entryMatchCount === 0
              ? "No matches"
              : `${search.entryMatchCount} entries · ${search.occurrenceCount} matches`}
      </span>
      <span className="pm-search__controls">
        <button
          type="button"
          className="pm-btn pm-btn--compact"
          onClick={search.prev}
          disabled={search.entryMatchCount === 0}
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
        >
          Prev
        </button>
        <button
          type="button"
          className="pm-btn pm-btn--compact"
          onClick={search.next}
          disabled={search.entryMatchCount === 0}
          aria-label="Next match"
          title="Next match (Enter)"
        >
          Next
        </button>
        {value ? (
          <button
            type="button"
            className="pm-btn pm-btn--quiet"
            onClick={() => {
              onChange("");
              search.clear();
            }}
          >
            Clear
          </button>
        ) : null}
      </span>
    </div>
  );
}
