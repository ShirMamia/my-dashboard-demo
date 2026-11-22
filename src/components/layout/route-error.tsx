"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * A view that failed to load (MASTER.md §7 table "Error": "לא ניתן לטעון…" + retry). The heading
 * takes focus, so keyboard and screen-reader users land on the message and the retry button.
 */
export function RouteError({ title, reset }: { title: string; reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <section role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-danger bg-surface px-6 py-12 text-center">
      <CircleAlert aria-hidden className="size-6 text-danger" />
      <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        {title}
      </h1>
      <p className="text-text-secondary">ייתכן שיש בעיית חיבור. אפשר לנסות שוב.</p>
      <Button onClick={reset}>נסה שוב</Button>
    </section>
  );
}
