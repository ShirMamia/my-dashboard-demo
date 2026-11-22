"use client";

import { useEffect, useRef } from "react";

/**
 * The chart's own horizontal scroll area (the page itself never scrolls sideways). LTR, so time
 * runs left → right and the scroll starts at the earliest day. Focusable, so the arrow keys scroll
 * it. When a range opens, it scrolls once (no animation) to center today if today is in view.
 */
export function TimelineScroller({
  label,
  resetKey,
  children,
}: {
  label: string;
  /** Changes with the range: scroll again only then. */
  resetKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const region = ref.current;
    // Not rendered (narrow screens, list view): nothing to scroll.
    if (!region || region.offsetParent === null) return;
    const today = region.querySelector<HTMLElement>("[data-today]");
    const labels = region.querySelector<HTMLElement>("[data-label-column]")?.offsetWidth ?? 0;
    region.scrollLeft = today ? Math.max(0, today.offsetLeft - (region.clientWidth - labels) / 2) : 0;
  }, [resetKey]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      dir="ltr"
      className="overflow-x-auto rounded-xl border bg-surface [--label-w:11rem] [scroll-padding-inline-end:var(--label-w)] lg:[--label-w:15rem]"
    >
      {children}
    </div>
  );
}
