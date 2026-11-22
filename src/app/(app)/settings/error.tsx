"use client";

import { RouteError } from "@/components/layout/route-error";

export default function SettingsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="לא ניתן לטעון את ההגדרות." reset={reset} />;
}
