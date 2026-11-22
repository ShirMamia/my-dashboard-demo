import "server-only";
import { z } from "zod";
import { appInstantOf, isDateOnly } from "@/domain/dates";
import { TASK_STATUSES, TITLE_MAX_LENGTH, validateTaskFields } from "@/domain/task";
import type { TaskFormInput } from "@/domain/task-edit";
import { DataError } from "@/server/data/errors";

/** Field names used by the task forms. */
export type TaskField =
  | "title"
  | "deadline"
  | "categoryId"
  | "projectId"
  | "notes"
  | "status"
  | "startDate"
  | "scheduledAt"
  | "urgency";

export type FieldErrors = Partial<Record<TaskField, string>>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export const FORM_ERROR_SUMMARY = "לא ניתן לשמור. יש לתקן את השדות המסומנים.";
export const UNEXPECTED_ERROR = "משהו השתבש. יש לנסות שוב.";

const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(z.uuid({ error: "הערך שנבחר אינו תקין." }).nullable());

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || isDateOnly(value), { error: "יש לבחור תאריך תקין." });

const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "יש להזין כותרת." })
    .max(TITLE_MAX_LENGTH, { error: `הכותרת יכולה להכיל עד ${TITLE_MAX_LENGTH} תווים.` }),
  deadline: z.string().trim().refine(isDateOnly, { error: "יש לבחור מועד." }),
  categoryId: optionalId,
  projectId: optionalId,
  notes: z.string().max(10_000, { error: "התיאור ארוך מדי." }),
  isImportant: z.boolean(),
  status: z.enum(TASK_STATUSES as [string, ...string[]], { error: "יש לבחור סטטוס תקין." }),
  startDate: optionalDate,
  scheduledDate: optionalDate,
  scheduledTime: z
    .string()
    .trim()
    .refine((value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), {
      error: "יש להזין שעה בפורמט HH:MM, למשל 09:30.",
    }),
  urgency: z.enum(["auto", "urgent", "not_urgent"], { error: "יש לבחור דחיפות תקינה." }),
});

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export interface ParsedTaskForm {
  input: TaskFormInput;
  urgentOverride: boolean | null;
}

/** Validates task form data at the server boundary (zod + domain rules). */
export function parseTaskForm(
  formData: FormData,
): { ok: true; value: ParsedTaskForm } | { ok: false; fieldErrors: FieldErrors } {
  const parsed = taskFormSchema.safeParse({
    title: text(formData, "title"),
    deadline: text(formData, "deadline"),
    categoryId: text(formData, "categoryId"),
    projectId: text(formData, "projectId"),
    notes: text(formData, "notes"),
    isImportant: formData.get("isImportant") === "on",
    status: text(formData, "status") || "todo",
    startDate: text(formData, "startDate"),
    scheduledDate: text(formData, "scheduledDate"),
    scheduledTime: text(formData, "scheduledTime"),
    urgency: text(formData, "urgency") || "auto",
  });

  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const fieldErrors: FieldErrors = {};
    for (const [name, messages] of Object.entries(fields)) {
      const key = (name === "scheduledDate" || name === "scheduledTime" ? "scheduledAt" : name) as TaskField;
      if (messages?.[0] && !fieldErrors[key]) fieldErrors[key] = messages[0];
    }
    return { ok: false, fieldErrors };
  }

  const value = parsed.data;
  const fieldErrors: FieldErrors = {};
  const domainErrors = validateTaskFields({
    title: value.title,
    deadline: value.deadline,
    startDate: value.startDate,
  });
  if (domainErrors.title) fieldErrors.title = domainErrors.title;
  if (domainErrors.startDate) fieldErrors.startDate = domainErrors.startDate;

  // Scheduled time needs both parts; a date alone or a time alone is ambiguous.
  let scheduledAt: string | null = null;
  if (value.scheduledDate && value.scheduledTime) {
    scheduledAt = appInstantOf(value.scheduledDate, value.scheduledTime);
  } else if (value.scheduledDate || value.scheduledTime) {
    fieldErrors.scheduledAt = value.scheduledDate
      ? "יש להזין גם שעה לזמן העבודה המתוכנן."
      : "יש לבחור גם תאריך לזמן העבודה המתוכנן.";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    value: {
      input: {
        title: value.title,
        notes: value.notes,
        status: value.status as TaskFormInput["status"],
        isImportant: value.isImportant,
        deadline: value.deadline,
        startDate: value.startDate,
        scheduledAt,
        projectId: value.projectId,
        categoryId: value.categoryId,
      },
      urgentOverride: value.urgency === "auto" ? null : value.urgency === "urgent",
    },
  };
}

/**
 * Maps a DB rejection to field errors. Composite FKs reject another user's (or a deleted)
 * project/category; check constraints back up the form rules.
 */
export function taskDataErrorToResult(error: unknown): ActionResult<never> {
  if (error instanceof DataError && error.code === "invalid") {
    if (error.message.includes("project_id")) {
      return { ok: false, error: FORM_ERROR_SUMMARY, fieldErrors: { projectId: "הפרויקט שנבחר אינו זמין." } };
    }
    if (error.message.includes("category_id")) {
      return { ok: false, error: FORM_ERROR_SUMMARY, fieldErrors: { categoryId: "הקטגוריה שנבחרה אינה זמינה." } };
    }
    return { ok: false, error: FORM_ERROR_SUMMARY };
  }
  if (error instanceof DataError && error.code === "not_found") {
    return { ok: false, error: "המשימה לא נמצאה. ייתכן שנמחקה." };
  }
  return { ok: false, error: UNEXPECTED_ERROR };
}
