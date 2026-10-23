import { useMemo, type Ref } from "react";
import type { TranscriptExpansion } from "../../hooks/useTranscriptExpansion";
import type { TranscriptSearch as TranscriptSearchState } from "../../hooks/useTranscriptSearch";
import type { TranscriptFilter, TranscriptItem } from "../../lib/sessionTypes";
import { TranscriptContext } from "./TranscriptContext";
import { TranscriptEntry } from "./TranscriptEntry";

interface TranscriptProps {
  items: TranscriptItem[];
  allItemsCount: number;
  filter: TranscriptFilter;
  search: TranscriptSearchState;
  expansion: TranscriptExpansion;
  sentinelRef: Ref<HTMLDivElement>;
  emptyReason?: string;
  announce: (message: string) => void;
  onShowAll: () => void;
  onClearSearch: () => void;
  onSearchAll: () => void;
}

export function Transcript({
  items,
  allItemsCount,
  filter,
  search,
  expansion,
  sentinelRef,
  emptyReason,
  announce,
  onShowAll,
  onClearSearch,
  onSearchAll,
}: TranscriptProps) {
  const entryAnchors = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.entry.id) map.set(item.entry.id, item.anchor);
    }
    return map;
  }, [items]);

  const contextValue = useMemo(
    () => ({
      expansion,
      query: search.activeQuery,
      matchedItemKeys: search.matchedItemKeys,
      filter,
      entryAnchors,
      activeItemKey: search.activeItemKey,
      announce,
    }),
    [expansion, search.activeQuery, search.matchedItemKeys, filter, entryAnchors, search.activeItemKey, announce],
  );

  const searchEmpty =
    search.queryValid && search.entryMatchCount === 0 && items.length > 0;
  const filteredEmpty = Boolean(emptyReason);

  return (
    <TranscriptContext.Provider value={contextValue}>
      <section className="pm-transcript-section" aria-labelledby="pm-transcript-heading">
        <h2 id="pm-transcript-heading" className="pm-sr-only">
          Conversation timeline
        </h2>
        {allItemsCount === 0 ? (
          <p className="pm-transcript-empty">No transcript entries were parsed from this session.</p>
        ) : searchEmpty ? (
          <div className="pm-transcript-empty">
            <p>
              No matches for <strong>“{search.activeQuery}”</strong> in this scope.
            </p>
            <div className="pm-transcript-empty__actions">
              <button type="button" className="pm-btn" onClick={onClearSearch}>
                Clear search
              </button>
              {filter !== "all" ? (
                <button type="button" className="pm-btn pm-btn--primary" onClick={onSearchAll}>
                  Search all entries
                </button>
              ) : null}
            </div>
          </div>
        ) : filteredEmpty ? (
          <div className="pm-transcript-empty">
            <p>{emptyReason}</p>
            <div className="pm-transcript-empty__actions">
              <button type="button" className="pm-btn" onClick={onShowAll}>
                Show all
              </button>
            </div>
          </div>
        ) : (
          <ol className="pm-transcript" id="pm-transcript">
            {items.map((item) => (
              <TranscriptEntry key={item.key} item={item} toolsOnly={filter === "tools"} />
            ))}
          </ol>
        )}
        <div ref={sentinelRef} className="pm-transcript__sentinel" aria-hidden="true" />
      </section>
    </TranscriptContext.Provider>
  );
}
