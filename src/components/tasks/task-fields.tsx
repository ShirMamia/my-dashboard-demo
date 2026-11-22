"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import type { DateOnly } from "@/domain/dates";
import { STATUS_LABELS, TASK_STATUSES, TITLE_MAX_LENGTH, type TaskStatus } from "@/domain/task";
import { cn } from "@/lib/utils";
import { CategoryField } from "./category-field";
import { DatePicker } from "./date-picker";
import { DeadlineField } from "./deadline-field";
import { FieldError, describedBy, selectClassName, textareaClassName, type Option } from "./form-parts";

export type Urgency = "auto" | "urgent" | "not_urgent";

export interface TaskFormValues {
  title: string;
  deadline: DateOnly;
  categoryId: string | null;
  projectId: string | null;
  notes: string;
  isImportant: boolean;
  status: TaskStatus;
  startDate: DateOnly | null;
  scheduledDate: DateOnly | null;
  scheduledTime: string;
  urgency: Urgency;
}

export type TaskFieldErrors = Partial<
  Record<
    "title" | "deadline" | "categoryId" | "projectId" | "notes" | "status" | "startDate" | "scheduledAt" | "urgency",
    string
  >
>;

/** Field ids, for the error summary's links. */
export function fieldIds(idPrefix: string) {
  return {
    title: `${idPrefix}-title`,
    deadline: `${idPrefix}-deadline`,
    categoryId: `${idPrefix}-category-legend`,
    projectId: `${idPrefix}-project`,
    notes: `${idPrefix}-notes`,
    status: `${idPrefix}-status`,
    startDate: `${idPrefix}-start`,
    scheduledAt: `${idPrefix}-scheduled-date`,
    urgency: `${idPrefix}-urgency-auto`,
  } as const;
}

export function TaskFields({
  idPrefix,
  mode,
  values,
  onChange,
  today,
  defaultDeadline,
  categories,
  projects,
  errors,
  deadlineWarning,
  urgencySlot,
  autoFocusTitle,
  detailsInitiallyOpen = false,
}: {
  idPrefix: string;
  mode: "create" | "edit";
  values: TaskFormValues;
  onChange: (patch: Partial<TaskFormValues>) => void;
  today: DateOnly;
  defaultDeadline: DateOnly;
  categories: Option[];
  projects: Option[];
  errors: TaskFieldErrors;
  deadlineWarning?: string;
  /** The edit form's urgency control. */
  urgencySlot?: React.ReactNode;
  autoFocusTitle?: boolean;
  /** Quick Create from a template opens the details, where its notes/project/Important are. */
  detailsInitiallyOpen?: boolean;
}) {
  const ids = fieldIds(idPrefix);
  const detailsId = useId();
  // Quick Create keeps the secondary fields collapsed; they open when one has an error.
  const detailsHaveError = Boolean(
    errors.projectId || errors.notes || errors.status || errors.startDate || errors.scheduledAt,
  );
  const [detailsOpen, setDetailsOpen] = useState(mode === "edit" || detailsInitiallyOpen);
  const showDetails = detailsOpen || detailsHaveError;

  const err = (name: keyof TaskFieldErrors) => (errors[name] ? `${idPrefix}-${name}-error` : undefined);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.title} className="text-sm font-medium">
          כותרת <span aria-hidden className="text-danger">*</span>
          <span className="sr-only"> (חובה)</span>
        </label>
        <Input
          id={ids.title}
          name="title"
          dir="auto"
          autoComplete="off"
          maxLength={TITLE_MAX_LENGTH}
          autoFocus={autoFocusTitle}
          aria-required
          value={values.title}
          onChange={(event) => onChange({ title: event.target.value })}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={err("title")}
        />
        <FieldError id={`${idPrefix}-title-error`} message={errors.title} />
      </div>

      <DeadlineField
        idPrefix={idPrefix}
        value={values.deadline}
        onChange={(deadline) => onChange({ deadline })}
        today={today}
        defaultDeadline={defaultDeadline}
        error={errors.deadline}
        warning={deadlineWarning}
      />

      <CategoryField
        idPrefix={idPrefix}
        categories={categories}
        value={values.categoryId}
        onChange={(categoryId) => onChange({ categoryId })}
        error={errors.categoryId}
      />

      {mode === "create" ? (
        <>
          <p className="text-sm text-text-muted">
            הדחיפות מחושבת אוטומטית לפי המועד. אפשר לשנות אותה בעריכת המשימה.
          </p>
          <button
            type="button"
            aria-expanded={showDetails}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex min-h-9 items-center gap-2 self-start rounded-md text-sm font-medium text-primary hover:underline"
          >
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", showDetails && "rotate-180")} />
            פרטים נוספים
          </button>
        </>
      ) : null}

      <div id={detailsId} hidden={!showDetails} className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.projectId} className="text-sm font-medium">
              פרויקט
            </label>
            <select
              id={ids.projectId}
              name="projectId"
              value={values.projectId ?? ""}
              onChange={(event) => onChange({ projectId: event.target.value || null })}
              aria-invalid={errors.projectId ? true : undefined}
              aria-describedby={err("projectId")}
              className={selectClassName}
            >
              <option value="">ללא פרויקט</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <FieldError id={`${idPrefix}-projectId-error`} message={errors.projectId} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.status} className="text-sm font-medium">
              סטטוס
            </label>
            <select
              id={ids.status}
              name="status"
              value={values.status}
              onChange={(event) => onChange({ status: event.target.value as TaskStatus })}
              aria-invalid={errors.status ? true : undefined}
              aria-describedby={err("status")}
              className={selectClassName}
            >
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <FieldError id={`${idPrefix}-status-error`} message={errors.status} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.notes} className="text-sm font-medium">
            תיאור
          </label>
          <textarea
            id={ids.notes}
            name="notes"
            dir="auto"
            rows={3}
            value={values.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={err("notes")}
            className={textareaClassName}
          />
          <FieldError id={`${idPrefix}-notes-error`} message={errors.notes} />
        </div>

        <label className="flex min-h-9 items-center gap-2 self-start text-base">
          <input
            type="checkbox"
            name="isImportant"
            checked={values.isImportant}
            onChange={(event) => onChange({ isImportant: event.target.checked })}
            className="size-4 accent-primary"
          />
          חשובה
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span id={`${idPrefix}-start-label`} className="text-sm font-medium">
              תאריך התחלה
            </span>
            <input type="hidden" name="startDate" value={values.startDate ?? ""} />
            <DatePicker
              id={ids.startDate}
              labelId={`${idPrefix}-start-label`}
              value={values.startDate}
              onChange={(startDate) => onChange({ startDate })}
              today={today}
              allowClear
              placeholder="ללא"
              invalid={Boolean(errors.startDate)}
              describedBy={err("startDate")}
            />
            <FieldError id={`${idPrefix}-startDate-error`} message={errors.startDate} />
          </div>

          <fieldset className="flex flex-col gap-2" aria-describedby={describedBy(`${idPrefix}-scheduled-hint`, err("scheduledAt"))}>
            <legend id={`${idPrefix}-scheduled-label`} className="mb-2 text-sm font-medium">
              זמן עבודה מתוכנן
            </legend>
            <input type="hidden" name="scheduledDate" value={values.scheduledDate ?? ""} />
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                id={ids.scheduledAt}
                labelId={`${idPrefix}-scheduled-label`}
                value={values.scheduledDate}
                onChange={(scheduledDate) =>
                  onChange(scheduledDate === null ? { scheduledDate, scheduledTime: "" } : { scheduledDate })
                }
                today={today}
                allowClear
                placeholder="ללא"
                invalid={Boolean(errors.scheduledAt)}
              />
              <label htmlFor={`${idPrefix}-scheduled-time`} className="sr-only">
                שעה (HH:MM)
              </label>
              <Input
                id={`${idPrefix}-scheduled-time`}
                name="scheduledTime"
                dir="ltr"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={values.scheduledTime}
                onChange={(event) => onChange({ scheduledTime: event.target.value })}
                aria-invalid={errors.scheduledAt ? true : undefined}
                className="w-24 text-center tabular-nums"
              />
            </div>
            <p id={`${idPrefix}-scheduled-hint`} className="text-sm text-text-muted">
              מתי מתכננים לעבוד על המשימה (שעון ישראל). לא משפיע על המועד.
            </p>
            <FieldError id={`${idPrefix}-scheduledAt-error`} message={errors.scheduledAt} />
          </fieldset>
        </div>

        {urgencySlot}
      </div>
    </div>
  );
}
