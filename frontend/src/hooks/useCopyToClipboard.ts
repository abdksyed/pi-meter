import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";

export interface ClipboardState {
  copied: boolean;
  error: boolean;
  copy: (text: string) => Promise<boolean>;
}

export function useCopyToClipboard(resetMs = 1600): ClipboardState {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      setCopied(ok);
      setError(!ok);
      timer.current = window.setTimeout(() => {
        setCopied(false);
        setError(false);
      }, resetMs);
      return ok;
    },
    [resetMs],
  );

  return { copied, error, copy };
}
