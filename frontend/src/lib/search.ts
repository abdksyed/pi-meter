import type { TranscriptItem } from "./sessionTypes";

export interface SearchUnit {
  key: string;
  anchor: string;
  text: string;
}

export interface SearchMatch {
  key: string;
  anchor: string;
  count: number;
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

export function buildSearchUnits(items: TranscriptItem[]): SearchUnit[] {
  return items
    .filter((item) => item.type !== "system-prompt" && item.searchText.length > 0)
    .map((item) => ({ key: item.key, anchor: item.anchor, text: item.searchText }));
}

export function countOccurrences(text: string, query: string): number {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export function findMatches(units: SearchUnit[], query: string): SearchMatch[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const matches: SearchMatch[] = [];
  for (const unit of units) {
    const count = countOccurrences(unit.text, trimmed);
    if (count > 0) matches.push({ key: unit.key, anchor: unit.anchor, count });
  }
  return matches;
}

export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const trimmed = query.trim();
  if (!trimmed) return [{ text, hit: false }];
  const segments: HighlightSegment[] = [];
  const haystack = text.toLowerCase();
  const needle = trimmed.toLowerCase();
  let cursor = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    if (index > cursor) segments.push({ text: text.slice(cursor, index), hit: false });
    segments.push({ text: text.slice(index, index + needle.length), hit: true });
    cursor = index + needle.length;
    index = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}
