import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CategoriesManager } from "@/components/settings/categories-manager";
import { HorizonForm } from "@/components/settings/horizon-form";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/data/categories";
import { getSettings } from "@/server/data/settings";

export const metadata: Metadata = { title: "הגדרות · לוח בקרה" };

// MASTER_SPEC §14 Settings: default deadline horizon, categories, sign out (in the nav).
// Timezone and week start are fixed.
export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="הגדרות" />
      <Suspense fallback={<p aria-busy="true" className="text-text-muted">טוען הגדרות…</p>}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  const auth = await requireAuth();
  const [settings, categories] = await Promise.all([getSettings(auth), listCategories(auth)]);
  return (
    <>
      <section aria-labelledby="settings-tasks" className="flex flex-col gap-4 rounded-xl border bg-surface p-5">
        <h2 id="settings-tasks" className="text-md font-semibold">
          משימות חדשות
        </h2>
        <HorizonForm key={settings.defaultDeadlineDays} initialDays={settings.defaultDeadlineDays} />
      </section>
      <section aria-labelledby="settings-categories" className="flex flex-col gap-4 rounded-xl border bg-surface p-5">
        <h2 id="settings-categories" className="text-md font-semibold">
          קטגוריות
        </h2>
        <CategoriesManager categories={categories} />
      </section>
      <p className="text-sm text-text-muted">אזור הזמן (ישראל) ותחילת השבוע (יום ראשון) קבועים.</p>
    </>
  );
}
