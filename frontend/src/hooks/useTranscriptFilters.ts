import { useMemo } from "react";
import { computeTranscriptCounts, filterTranscriptItems } from "../lib/transcriptItems";
import type { TranscriptFilter, TranscriptItem } from "../lib/sessionTypes";

export interface TranscriptFilters {
  counts: ReturnType<typeof computeTranscriptCounts>;
  visibleItems: TranscriptItem[];
  emptyReason?: string;
}

const EMPTY_REASON: Record<TranscriptFilter, string> = {
  all: "",
  user: "No user messages in this session.",
  assistant: "No assistant responses in this session.",
  tools: "No tool calls or tool results in this session.",
  errors: "No errors recorded in this session.",
};

export function useTranscriptFilters(
  items: TranscriptItem[],
  filter: TranscriptFilter,
  warningCount = 0,
): TranscriptFilters {
  const counts = useMemo(
    () => computeTranscriptCounts(items, warningCount),
    [items, warningCount],
  );
  const visibleItems = useMemo(() => filterTranscriptItems(items, filter), [items, filter]);
  const emptyReason =
    visibleItems.length === 0 && filter !== "all"
      ? filter === "errors" && warningCount > 0
        ? undefined
        : EMPTY_REASON[filter]
      : undefined;
  return { counts, visibleItems, emptyReason };
}
