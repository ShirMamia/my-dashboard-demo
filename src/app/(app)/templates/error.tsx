"use client";

import { RouteError } from "@/components/layout/route-error";

export default function TemplatesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="לא ניתן לטעון את התבניות." reset={reset} />;
}
