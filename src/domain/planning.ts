// Planning items / milestones (MASTER_SPEC §11): a date-only milestone with an optional, single,
// independent preparation task. The task is derived once, at creation; afterwards nothing links
// its fields to the item, so editing or deleting the item never changes it.

import { addDays, isDateOnly, type DateOnly } from "./dates";
import { TITLE_MAX_LENGTH } from "./task";

export const DEFAULT_PREP_LEAD_DAYS = 7;
export const PREP_LEAD_MAX_DAYS = 365;
const PREP_TITLE_PREFIX = "הכנה: ";

export interface PlanningItem {
  id: string;
  title: string;
  date: DateOnly;
  notes: string | null;
  prepLeadDays: number;
  projectId: string | null;
  categoryId: string | null;
  /** The generated preparation task while it exists (null after it's deleted). */
  preparationTask: { id: string; title: string; deadline: DateOnly; status: "todo" | "in_progress" | "waiting" | "done" } | null;
}

export type PlanningItemInput = Omit<PlanningItem, "id" | "preparationTask">;

export interface PlanningFieldErrors {
  title?: string;
  date?: string;
  prepLeadDays?: string;
  prepTitle?: string;
}

/** The form's raw values; the lead time arrives as text. */
export interface PlanningFormValues {
  title: string;
  date: string;
  notes: string;
  prepLeadDays: string;
  projectId: string | null;
  categoryId: string | null;
}

export function parsePlanningForm(values: PlanningFormValues): { ok: true; input: PlanningItemInput } | { ok: false; errors: PlanningFieldErrors } {
  const errors: PlanningFieldErrors = {};
  const title = values.title.trim();
  if (title.length === 0) errors.title = "יש להזין כותרת.";
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `הכותרת יכולה להכיל עד ${TITLE_MAX_LENGTH} תווים.`;
  if (!isDateOnly(values.date)) errors.date = "יש לבחור תאריך.";
  const lead = values.prepLeadDays.trim();
  const prepLeadDays = /^\d{1,3}$/.test(lead) ? Number(lead) : NaN;
  if (!(prepLeadDays >= 0 && prepLeadDays <= PREP_LEAD_MAX_DAYS)) errors.prepLeadDays = `יש להזין מספר ימים בין 0 ל־${PREP_LEAD_MAX_DAYS}.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const notes = values.notes.trim();
  return {
    ok: true,
    input: {
      title,
      date: values.date,
      notes: notes === "" ? null : notes,
      prepLeadDays,
      projectId: values.projectId,
      categoryId: values.categoryId,
    },
  };
}

/** "הכנה: <title>", within the task title limit. */
export function defaultPreparationTitle(itemTitle: string): string {
  return `${PREP_TITLE_PREFIX}${itemTitle.trim()}`.slice(0, TITLE_MAX_LENGTH);
}

export function validatePreparationTitle(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) return "יש להזין כותרת למשימת ההכנה.";
  if (trimmed.length > TITLE_MAX_LENGTH) return `הכותרת יכולה להכיל עד ${TITLE_MAX_LENGTH} תווים.`;
  return null;
}

/**
 * The preparation task's deadline: item date − lead time, date-only. A deadline that would
 * already be past is set to today, and `clamped` lets the form say so (MASTER_SPEC §11).
 */
export function preparationDeadline(itemDate: DateOnly, leadDays: number, today: DateOnly): { deadline: DateOnly; clamped: boolean } {
  const derived = addDays(itemDate, -leadDays);
  return derived < today ? { deadline: today, clamped: true } : { deadline: derived, clamped: false };
}

/**
 * The independent task to create (MASTER_SPEC §11): category and project copied, not
 * important, To Do, no start date, the derived deadline. Urgency stays automatic.
 */
export function preparationTaskInput(
  item: Pick<PlanningItem, "projectId" | "categoryId">,
  title: string,
  deadline: DateOnly,
) {
  return {
    title: title.trim(),
    notes: null,
    status: "todo" as const,
    isImportant: false,
    urgentOverride: null,
    deadline,
    startDate: null,
    scheduledAt: null,
    projectId: item.projectId,
    categoryId: item.categoryId,
    completedAt: null,
  };
}

export interface PlanningMonthGroup {
  /** "YYYY-MM". */
  month: string;
  items: PlanningItem[];
}

export interface PlanningYearGroup {
  year: string;
  months: PlanningMonthGroup[];
}

/** By date, then title and id; grouped by year, then month (MASTER_SPEC §11 list view). */
export function groupPlanningItems(items: readonly PlanningItem[]): PlanningYearGroup[] {
  const sorted = [...items].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      a.title.localeCompare(b.title, "he") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const years: PlanningYearGroup[] = [];
  for (const item of sorted) {
    const year = item.date.slice(0, 4);
    const month = item.date.slice(0, 7);
    let yearGroup = years.at(-1);
    if (yearGroup?.year !== year) {
      yearGroup = { year, months: [] };
      years.push(yearGroup);
    }
    let monthGroup = yearGroup.months.at(-1);
    if (monthGroup?.month !== month) {
      monthGroup = { month, items: [] };
      yearGroup.months.push(monthGroup);
    }
    monthGroup.items.push(item);
  }
  return years;
}
