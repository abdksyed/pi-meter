import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { buildSearchUnits, findMatches } from "../lib/search";
import type { TranscriptItem } from "../lib/sessionTypes";

export interface TranscriptSearch {
  query: string;
  activeQuery: string;
  queryValid: boolean;
  matches: { key: string; anchor: string; count: number }[];
  matchedItemKeys: Set<string>;
  entryMatchCount: number;
  occurrenceCount: number;
  activeIndex: number;
  activeItemKey?: string;
  activeAnchorId?: string;
  next: () => void;
  prev: () => void;
  clear: () => void;
}

export function useTranscriptSearch(items: TranscriptItem[], query: string): TranscriptSearch {
  const activeQuery = useDeferredValue(query.trim());
  const queryValid = activeQuery.length >= 2;
  const matches = useMemo(
    () => (queryValid ? findMatches(buildSearchUnits(items), activeQuery) : []),
    [items, activeQuery, queryValid],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeQuery, items]);

  const matchedItemKeys = useMemo(
    () => new Set(matches.map((match) => match.key)),
    [matches],
  );

  const occurrenceCount = useMemo(
    () => matches.reduce((total, match) => total + match.count, 0),
    [matches],
  );

  const safeIndex = matches.length === 0 ? 0 : Math.min(activeIndex, matches.length - 1);
  const activeMatch = matches[safeIndex];

  const next = useCallback(() => {
    setActiveIndex((current) => (matches.length === 0 ? 0 : (current + 1) % matches.length));
  }, [matches.length]);

  const prev = useCallback(() => {
    setActiveIndex((current) =>
      matches.length === 0 ? 0 : (current - 1 + matches.length) % matches.length,
    );
  }, [matches.length]);

  const clear = useCallback(() => setActiveIndex(0), []);

  return {
    query,
    activeQuery,
    queryValid,
    matches,
    matchedItemKeys,
    entryMatchCount: matches.length,
    occurrenceCount,
    activeIndex: safeIndex,
    activeItemKey: activeMatch?.key,
    activeAnchorId: activeMatch?.anchor,
    next,
    prev,
    clear,
  };
}
