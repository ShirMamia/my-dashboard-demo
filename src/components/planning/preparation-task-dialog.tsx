"use client";

import { ListPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/tasks/form-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateOnly, type DateOnly } from "@/domain/dates";
import { defaultPreparationTitle, type PlanningItem } from "@/domain/planning";
import { TITLE_MAX_LENGTH } from "@/domain/task";
import { createPreparationTaskAction } from "@/server/actions/planning";
import { INDEPENDENCE_NOTE, PreparationPreview } from "./preparation-preview";

/** "צור משימת הכנה" for an item without one (MASTER_SPEC §11), e.g. after its task was deleted. */
export function PreparationTaskDialog({ item, today }: { item: Pick<PlanningItem, "id" | "title" | "date" | "prepLeadDays">; today: DateOnly }) {
  const inputId = `prep-${item.id.slice(0, 8)}`;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(() => defaultPreparationTitle(item.title));
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function submit() {
    startTransition(async () => {
      const result = await createPreparationTaskAction(item.id, title);
      if (!result.ok) {
        setFieldError(result.fieldError);
        setError(result.fieldError ? undefined : result.error);
        if (result.fieldError) document.getElementById(inputId)?.focus();
        return;
      }
      setOpen(false);
      showToast({
        message: (
          <>
            נוצרה משימת הכנה ל־<bdi className="font-semibold">{item.title}</bdi>, למועד{" "}
            <span className="tabular-nums">{formatDateOnly(result.data.deadline)}</span>
            {result.data.clamped ? " (היום, כי המועד המחושב כבר עבר)" : ""}.
          </>
        ),
      });
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTitle(defaultPreparationTitle(item.title));
          setError(undefined);
          setFieldError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ListPlus aria-hidden />
          צור משימת הכנה
          <span className="sr-only"> ל־{item.title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-5 p-5 sm:max-w-md">
        <div className="flex flex-col gap-1 pe-10">
          <DialogTitle className="text-lg font-semibold">יצירת משימת הכנה</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">{INDEPENDENCE_NOTE}</DialogDescription>
        </div>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit();
          }}
          className="flex flex-col gap-4"
        >
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              כותרת משימת ההכנה
            </label>
            <Input
              id={inputId}
              dir="auto"
              autoComplete="off"
              autoFocus
              maxLength={TITLE_MAX_LENGTH}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${inputId}-error` : undefined}
            />
            <FieldError id={`${inputId}-error`} message={fieldError} />
          </div>
          <PreparationPreview date={item.date} leadDays={item.prepLeadDays} today={today} />
          <div className="flex justify-end">
            <Button type="submit" size="lg" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              {pending ? "יוצר…" : "יצירת משימת הכנה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
