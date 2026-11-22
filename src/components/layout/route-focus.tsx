"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const SETTLE_MS = 5000;

/** The page's visible <h1>. Next.js may keep the previous page in the DOM, hidden (<Activity>). */
function visibleHeading(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("#main h1")].find((h1) => h1.checkVisibility());
}

/**
 * Moves focus to the page's <h1> after a client-side route change (MASTER.md §8), so keyboard and
 * screen-reader users start at the new content. Not on first load, and not when only the search
 * params change (filters keep focus where it is).
 *
 * Page content may stream in after the route changes (Suspense), and a loading heading may be
 * replaced by the real one. So until the page settles, focus follows the heading as it appears or
 * is replaced, unless the user has started interacting.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;

    const main = document.getElementById("main");
    if (!main) return;
    let focusedOnce = false;

    const focusHeading = () => {
      const heading = visibleHeading();
      if (!heading || document.activeElement === heading) return;
      heading.tabIndex = -1;
      heading.focus();
      focusedOnce = true;
    };

    focusHeading();
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      const focusLost = !active || active === document.body || !active.isConnected;
      if (!focusedOnce || focusLost) focusHeading();
    });
    observer.observe(main, { childList: true, subtree: true });

    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
    const timer = window.setTimeout(stop, SETTLE_MS);
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    return stop;
  }, [pathname]);

  return null;
}
