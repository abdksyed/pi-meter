import { useCallback, useEffect, useRef, useState } from "react";
import { scrollToElement } from "../lib/anchors";

export interface JumpToLatest {
  isAtBottom: boolean;
  showFloating: boolean;
  sentinelRef: (node: HTMLDivElement | null) => void;
  jumpToLatest: () => void;
}

function scrollParentOf(element: HTMLElement | null): HTMLElement | null {
  let parent = element?.parentElement ?? null;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function useJumpToLatest(): JumpToLatest {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrolled, setScrolled] = useState(0);
  const scrollParent = useRef<HTMLElement | null>(null);

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinel(node);
  }, []);

  useEffect(() => {
    if (!sentinel) return;
    const parent = scrollParentOf(sentinel);
    scrollParent.current = parent;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIsAtBottom(entry.isIntersecting);
      },
      { root: parent, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);

  useEffect(() => {
    const parent = scrollParent.current ?? scrollParentOf(sentinel);
    const target: HTMLElement | Window = parent ?? window;
    const read = () => setScrolled(parent ? parent.scrollTop : window.scrollY);
    read();
    target.addEventListener("scroll", read, { passive: true });
    return () => target.removeEventListener("scroll", read);
  }, [sentinel]);

  const jumpToLatest = useCallback(() => {
    scrollToElement(sentinel);
  }, [sentinel]);

  return {
    isAtBottom,
    showFloating: !isAtBottom && scrolled > 400,
    sentinelRef,
    jumpToLatest,
  };
}
