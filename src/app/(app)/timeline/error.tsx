"use client";

import { RouteError } from "@/components/layout/route-error";

export default function TimelineError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="לא ניתן לטעון את הגאנט." reset={reset} />;
}
