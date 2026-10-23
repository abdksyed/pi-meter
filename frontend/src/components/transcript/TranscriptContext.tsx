import { createContext, useContext } from "react";
import type { TranscriptExpansion } from "../../hooks/useTranscriptExpansion";
import type { TranscriptFilter } from "../../lib/sessionTypes";

export interface TranscriptContextValue {
  expansion: TranscriptExpansion;
  query: string;
  matchedItemKeys: Set<string>;
  filter: TranscriptFilter;
  entryAnchors: Map<string, string>;
  activeItemKey?: string;
  announce: (message: string) => void;
}

const fallbackExpansion: TranscriptExpansion = {
  mode: "default",
  isOpen: (_key, defaultOpen) => defaultOpen,
  toggle: () => undefined,
  expandAll: () => undefined,
  collapseAll: () => undefined,
  reset: () => undefined,
};

export const TranscriptContext = createContext<TranscriptContextValue>({
  expansion: fallbackExpansion,
  query: "",
  matchedItemKeys: new Set<string>(),
  filter: "all",
  entryAnchors: new Map<string, string>(),
  announce: () => undefined,
});

export function useTranscriptContext(): TranscriptContextValue {
  return useContext(TranscriptContext);
}
