"use client";

import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { DatePicker } from "@/components/tasks/date-picker";
import { CategoryField } from "@/components/tasks/category-field";
import { ErrorSummary, FieldError, selectClassName, textareaClassName, type Option } from "@/components/tasks/form-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateOnly, type DateOnly } from "@/domain/dates";
import {
  DEFAULT_PREP_LEAD_DAYS,
  PREP_LEAD_MAX_DAYS,
  defaultPreparationTitle,
  type PlanningFieldErrors,
  type PlanningFormValues,
  type PlanningItem,
} from "@/domain/planning";
import { TITLE_MAX_LENGTH } from "@/domain/task";
import { savePlanningItemAction } from "@/server/actions/planning";
import { PreparationPreview, INDEPENDENCE_NOTE } from "./preparation-preview";

const FIELD_ORDER: (keyof PlanningFieldErrors)[] = ["title", "date", "prepLeadDays", "prepTitle"];

/**
 * Create or edit a planning item (MASTER_SPEC §11). On create, "צור משימת הכנה" (unchecked by
 * default) also generates the one preparation task; its title is editable and its deadline is
 * previewed. Editing changes only the item, never an existing preparation task.
 */
export function PlanningItemDialog({
  item,
  today,
  projects,
  categories,
}: {
  /** Absent: create. */
  item?: PlanningItem & { projectName?: string; projectSuffix?: string };
  today: DateOnly;
  /** Active projects (the picker never offers archived ones). */
  projects: Option[];
  categories: Option[];
}) {
  const isEdit = item !== undefined;
  const prefix = isEdit ? `planning-${item.id.slice(0, 8)}` : "planning-new";
  const initial: PlanningFormValues = isEdit
    ? {
        title: item.title,
        date: item.date,
        notes: item.notes ?? "",
        prepLeadDays: String(item.prepLeadDays),
        projectId: item.projectId,
        categoryId: item.categoryId,
      }
    : { title: "", date: "", notes: "", prepLeadDays: String(DEFAULT_PREP_LEAD_DAYS), projectId: null, categoryId: null };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [withTask, setWithTask] = useState(false);
  const [prepTitle, setPrepTitle] = useState("");
  const [prepTitleEdited, setPrepTitleEdited] = useState(false);
  const [errors, setErrors] = useState<PlanningFieldErrors>({});
  const [summary, setSummary] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const set = (patch: Partial<PlanningFormValues>) => setValues((current) => ({ ...current, ...patch }));

  // A completed or archived project stays selectable for the item that already has it, marked as such.
  const projectOptions =
    isEdit && item.projectSuffix && item.projectId && item.projectName
      ? [...projects, { id: item.projectId, name: `${item.projectName}${item.projectSuffix}` }]
      : projects;

  const ids = {
    title: `${prefix}-title`,
    date: `${prefix}-date`,
    prepLeadDays: `${prefix}-lead`,
    prepTitle: `${prefix}-prep-title`,
  };
  const err = (field: keyof PlanningFieldErrors) => (errors[field] ? `${ids[field]}-error` : undefined);
  // The task title follows the item title until the user edits it.
  const effectivePrepTitle = prepTitleEdited ? prepTitle : defaultPreparationTitle(values.title);
  const lead = /^\d{1,3}$/.test(values.prepLeadDays.trim()) ? Number(values.prepLeadDays.trim()) : null;

  function submit() {
    startTransition(async () => {
      const result = await savePlanningItemAction(isEdit ? item.id : null, values, isEdit ? undefined : { create: withTask, title: effectivePrepTitle });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setSummary(result.error);
        return;
      }
      setOpen(false);
      const name = <bdi className="font-semibold">{result.data.title}</bdi>;
      if (result.preparationError) {
        showToast({ message: <>פריט התכנון {name} נשמר, אבל משימת ההכנה לא נוצרה: {result.preparationError}</>, tone: "error" });
      } else if (result.preparation) {
        showToast({
          message: (
            <>
              פריט התכנון {name} נוסף, עם משימת הכנה למועד <span className="tabular-nums">{formatDateOnly(result.preparation.deadline)}</span>
              {result.preparation.clamped ? " (היום, כי המועד המחושב כבר עבר)" : ""}.
            </>
          ),
        });
      } else {
        showToast({ message: <>פריט התכנון {name} {isEdit ? "נשמר." : "נוסף."}</> });
      }
    });
  }

  const summaryErrors = FIELD_ORDER.flatMap((field): [string, string][] => (errors[field] ? [[ids[field], errors[field]!]] : []));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(initial);
          setWithTask(false);
          setPrepTitle("");
          setPrepTitleEdited(false);
          setErrors({});
          setSummary(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost">
            <Pencil aria-hidden />
            עריכה
            <span className="sr-only"> של פריט התכנון {item.title}</span>
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden />
            פריט תכנון חדש
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-5 sm:max-w-xl">
        <div className="flex flex-col gap-1 pe-10">
          <DialogTitle className="text-lg font-semibold">{isEdit ? "עריכת פריט תכנון" : "פריט תכנון חדש"}</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            {isEdit
              ? "שינוי התאריך או זמן ההכנה לא משנה משימת הכנה שכבר נוצרה."
              : "אבן דרך או תאריך חשוב בשנה. אפשר ליצור לו משימת הכנה אחת."}
          </DialogDescription>
        </div>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit();
          }}
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} errors={summaryErrors} />

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.title} className="text-sm font-medium">
              כותרת <span aria-hidden className="text-danger">*</span>
              <span className="sr-only"> (חובה)</span>
            </label>
            <Input
              id={ids.title}
              dir="auto"
              autoComplete="off"
              autoFocus
              aria-required
              maxLength={TITLE_MAX_LENGTH}
              value={values.title}
              onChange={(event) => set({ title: event.target.value })}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={err("title")}
            />
            <FieldError id={`${ids.title}-error`} message={errors.title} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span id={`${ids.date}-label`} className="text-sm font-medium">
                תאריך <span aria-hidden className="text-danger">*</span>
                <span className="sr-only"> (חובה)</span>
              </span>
              <DatePicker
                id={ids.date}
                labelId={`${ids.date}-label`}
                value={values.date || null}
                onChange={(date) => date && set({ date })}
                today={today}
                invalid={Boolean(errors.date)}
                describedBy={err("date")}
              />
              <FieldError id={`${ids.date}-error`} message={errors.date} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={ids.prepLeadDays} className="text-sm font-medium">
                זמן הכנה (ימים לפני התאריך)
              </label>
              <Input
                id={ids.prepLeadDays}
                inputMode="numeric"
                dir="ltr"
                maxLength={3}
                value={values.prepLeadDays}
                onChange={(event) => set({ prepLeadDays: event.target.value })}
                aria-invalid={errors.prepLeadDays ? true : undefined}
                aria-describedby={`${ids.prepLeadDays}-hint ${err("prepLeadDays") ?? ""}`.trim()}
                className="w-24 text-center tabular-nums"
              />
              <p id={`${ids.prepLeadDays}-hint`} className="text-sm text-text-muted">
                בין 0 ל־{PREP_LEAD_MAX_DAYS}. ברירת המחדל {DEFAULT_PREP_LEAD_DAYS}.
              </p>
              <FieldError id={`${ids.prepLeadDays}-error`} message={errors.prepLeadDays} />
            </div>
          </div>

          <CategoryField idPrefix={prefix} categories={categories} value={values.categoryId} onChange={(categoryId) => set({ categoryId })} />

          <div className="flex flex-col gap-2">
            <label htmlFor={`${prefix}-project`} className="text-sm font-medium">
              פרויקט
            </label>
            <select
              id={`${prefix}-project`}
              value={values.projectId ?? ""}
              onChange={(event) => set({ projectId: event.target.value || null })}
              className={selectClassName}
            >
              <option value="">ללא פרויקט</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${prefix}-notes`} className="text-sm font-medium">
              הערות
            </label>
            <textarea
              id={`${prefix}-notes`}
              dir="auto"
              rows={2}
              value={values.notes}
              onChange={(event) => set({ notes: event.target.value })}
              className={textareaClassName}
            />
          </div>

          {isEdit ? null : (
            <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
              <legend className="sr-only">משימת הכנה</legend>
              <label className="flex min-h-9 items-center gap-2 self-start text-base">
                <input
                  type="checkbox"
                  checked={withTask}
                  onChange={(event) => setWithTask(event.target.checked)}
                  aria-describedby={`${prefix}-independence`}
                  className="size-4 accent-primary"
                />
                צור משימת הכנה
              </label>
              <p id={`${prefix}-independence`} className="text-sm text-text-muted">
                {INDEPENDENCE_NOTE}
              </p>
              {withTask ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label htmlFor={ids.prepTitle} className="text-sm font-medium">
                      כותרת משימת ההכנה
                    </label>
                    <Input
                      id={ids.prepTitle}
                      dir="auto"
                      autoComplete="off"
                      maxLength={TITLE_MAX_LENGTH}
                      value={effectivePrepTitle}
                      onChange={(event) => {
                        setPrepTitleEdited(true);
                        setPrepTitle(event.target.value);
                      }}
                      aria-invalid={errors.prepTitle ? true : undefined}
                      aria-describedby={err("prepTitle")}
                    />
                    <FieldError id={`${ids.prepTitle}-error`} message={errors.prepTitle} />
                  </div>
                  <PreparationPreview date={values.date || null} leadDays={lead} today={today} />
                </>
              ) : null}
            </fieldset>
          )}

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" size="lg" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              {pending ? "שומר…" : isEdit ? "שמירה" : "הוספת פריט"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
