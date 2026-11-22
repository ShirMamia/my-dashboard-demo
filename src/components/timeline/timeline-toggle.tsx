"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";

/**
 * A checkbox whose state lives in the URL: toggling navigates (Back/Forward restore it). It shows
 * the new state at once while the page for it loads.
 */
export function TimelineToggle({
  label,
  checked,
  checkedHref,
  uncheckedHref,
}: {
  label: string;
  checked: boolean;
  checkedHref: string;
  uncheckedHref: string;
}) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(checked);
  return (
    <label className="flex min-h-9 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={shown}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(() => {
            setShown(next);
            router.push(next ? checkedHref : uncheckedHref, { scroll: false });
          });
        }}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}
