"use client";

import { RouteError } from "@/components/layout/route-error";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="לא ניתן לטעון את לוח הבקרה." reset={reset} />;
}
