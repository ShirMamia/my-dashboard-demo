"use client";

import { RouteError } from "@/components/layout/route-error";
import "./globals.css";

/** The root layout itself failed: a Hebrew RTL page of its own (it replaces the root layout). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body className="flex min-h-full flex-col bg-bg font-sans text-text-primary">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
          <RouteError title="לא ניתן לטעון את האפליקציה." reset={reset} />
        </main>
      </body>
    </html>
  );
}
