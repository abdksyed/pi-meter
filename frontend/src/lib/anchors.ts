export function entryAnchor(index: number): string {
  return `entry-${index}`;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function scrollToAnchor(
  anchor: string,
  options: { focus?: boolean; smooth?: boolean } = {},
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const element = document.getElementById(anchor);
  if (!element) return null;
  const smooth = options.smooth ?? !prefersReducedMotion();
  element.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  if (options.focus !== false) {
    element.focus({ preventScroll: true });
  }
  return element;
}

export function scrollToElement(
  element: HTMLElement | null,
  options: { smooth?: boolean } = {},
): void {
  if (!element) return;
  const smooth = options.smooth ?? !prefersReducedMotion();
  element.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
}
