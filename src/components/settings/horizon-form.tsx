"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { FieldError } from "@/components/tasks/form-parts";
import { DEADLINE_HORIZON_MAX_DAYS } from "@/domain/task";
import { saveSettingsAction } from "@/server/actions/settings";

/** Default deadline horizon (MASTER_SPEC §4): only pre-fills future tasks. */
export function HorizonForm({ initialDays }: { initialDays: number }) {
  const [days, setDays] = useState(String(initialDays));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveSettingsAction(null, formData);
          if (!result.ok) {
            setError(result.error);
            document.getElementById("horizon")?.focus();
            return;
          }
          setError(undefined);
          setDays(String(result.data.defaultDeadlineDays));
          showToast({ message: "ברירת המחדל של המועד נשמרה." });
        });
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="horizon" className="text-sm font-medium">
        מועד ברירת מחדל למשימה חדשה (ימים מהיום)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="horizon"
          name="defaultDeadlineDays"
          inputMode="numeric"
          dir="ltr"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "horizon-hint horizon-error" : "horizon-hint"}
          className="w-24 text-center tabular-nums"
        />
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
      </div>
      <p id="horizon-hint" className="text-sm text-text-muted">
        בין 0 ל־{DEADLINE_HORIZON_MAX_DAYS}. 0 = היום. השינוי משפיע רק על משימות חדשות.
      </p>
      <FieldError id="horizon-error" message={error} />
    </form>
  );
}
