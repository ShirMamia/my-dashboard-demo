"use client";

import { RouteError } from "@/components/layout/route-error";

export default function TasksError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="לא ניתן לטעון את המשימות." reset={reset} />;
}
