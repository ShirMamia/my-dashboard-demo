import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "הדף לא נמצא · לוח בקרה" };

/** Any URL that matches no view (Hebrew, instead of the framework's default 404). */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-xl font-semibold">הדף לא נמצא</h1>
      <EmptyState
        icon={SearchX}
        title="אין דף בכתובת הזו."
        description="ייתכן שהקישור שגוי או ישן."
        action={
          <Button asChild variant="outline">
            <Link href="/">חזרה ללוח הבקרה</Link>
          </Button>
        }
      />
    </main>
  );
}
