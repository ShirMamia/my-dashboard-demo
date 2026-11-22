// Task shape and task-level rules (MASTER_SPEC §4).

import { addDays, appDateOf, diffDays, isWithin, weekOf, type DateOnly } from "./dates";

export type TaskStatus = "todo" | "in_progress" | "waiting" | "done";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "waiting", "done"];

/** Status copy [PROPOSED DEFAULT] (MASTER.md §1). */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "לביצוע",
  in_progress: "בתהליך",
  waiting: "ממתינה",
  done: "הושלמה",
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  isImportant: boolean;
  /** null = automatic (MASTER_SPEC §5.2). */
  urgentOverride: boolean | null;
  deadline: DateOnly;
  startDate: DateOnly | null;
  /** Planned work slot, ISO instant. */
  scheduledAt: string | null;
  projectId: string | null;
  categoryId: string | null;
  /** ISO instant; set exactly while status is "done". */
  completedAt: string | null;
  /** ISO instant. */
  createdAt: string;
}

/** A task without its notes: the Dashboard's load, which never shows notes. */
export type TaskSummary = Omit<Task, "notes">;

export const TITLE_MAX_LENGTH = 200;
export const DEFAULT_DEADLINE_HORIZON_DAYS = 7;
export const DEADLINE_HORIZON_MAX_DAYS = 365;

export function isOpen(task: Pick<Task, "status">): boolean {
  return task.status !== "done";
}

/** Overdue = deadline < today and not Done (MASTER_SPEC §3). */
export function isOverdue(task: Pick<Task, "status" | "deadline">, today: DateOnly): boolean {
  return isOpen(task) && task.deadline < today;
}

/** Done with completedAt in the week (Sunday–Saturday, app timezone) containing `today`. */
export function isCompletedInWeekOf(task: Pick<Task, "status" | "completedAt">, today: DateOnly): boolean {
  if (task.status !== "done" || task.completedAt === null) return false;
  const week = weekOf(today);
  return isWithin(appDateOf(task.completedAt), week.start, week.end);
}

export function daysRemaining(task: Pick<Task, "deadline">, today: DateOnly): number {
  return diffDays(task.deadline, today);
}

/** Entering Done sets completedAt; leaving Done clears it. */
export function applyStatusChange(
  task: Pick<Task, "status" | "completedAt">,
  nextStatus: TaskStatus,
  now: Date,
): Pick<Task, "status" | "completedAt"> {
  if (nextStatus === task.status) return { status: task.status, completedAt: task.completedAt };
  return {
    status: nextStatus,
    completedAt: nextStatus === "done" ? now.toISOString() : null,
  };
}

export function defaultDeadline(today: DateOnly, horizonDays: number): DateOnly {
  return addDays(today, horizonDays);
}

export function isValidHorizon(days: number): boolean {
  return Number.isInteger(days) && days >= 0 && days <= DEADLINE_HORIZON_MAX_DAYS;
}

export interface TaskFieldErrors {
  title?: string;
  startDate?: string;
}

export function validateTaskFields(fields: {
  title: string;
  deadline: DateOnly;
  startDate: DateOnly | null;
}): TaskFieldErrors {
  const errors: TaskFieldErrors = {};
  const title = fields.title.trim();
  if (title.length === 0) errors.title = "יש להזין כותרת.";
  else if (title.length > TITLE_MAX_LENGTH)
    errors.title = `הכותרת יכולה להכיל עד ${TITLE_MAX_LENGTH} תווים.`;
  if (fields.startDate !== null && fields.startDate > fields.deadline)
    errors.startDate = "תאריך ההתחלה לא יכול להיות אחרי המועד.";
  return errors;
}
