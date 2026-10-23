import { useCallback, useMemo, useState } from "react";

export type ExpansionMode = "default" | "all-open" | "all-closed";

export interface TranscriptExpansion {
  mode: ExpansionMode;
  isOpen: (key: string, defaultOpen: boolean) => boolean;
  toggle: (key: string, defaultOpen: boolean) => void;
  expandAll: () => void;
  collapseAll: () => void;
  reset: () => void;
}

export function useTranscriptExpansion(): TranscriptExpansion {
  const [mode, setMode] = useState<ExpansionMode>("default");
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());

  const isOpen = useCallback(
    (key: string, defaultOpen: boolean) => {
      const override = overrides.get(key);
      if (override !== undefined) return override;
      if (mode === "all-open") return true;
      if (mode === "all-closed") return false;
      return defaultOpen;
    },
    [mode, overrides],
  );

  const toggle = useCallback(
    (key: string, defaultOpen: boolean) => {
      const next = !isOpen(key, defaultOpen);
      setOverrides((current) => {
        const copy = new Map(current);
        copy.set(key, next);
        return copy;
      });
    },
    [isOpen],
  );

  const expandAll = useCallback(() => {
    setOverrides(new Map());
    setMode("all-open");
  }, []);

  const collapseAll = useCallback(() => {
    setOverrides(new Map());
    setMode("all-closed");
  }, []);

  const reset = useCallback(() => {
    setOverrides(new Map());
    setMode("default");
  }, []);

  return useMemo(
    () => ({ mode, isOpen, toggle, expandAll, collapseAll, reset }),
    [mode, isOpen, toggle, expandAll, collapseAll, reset],
  );
}
