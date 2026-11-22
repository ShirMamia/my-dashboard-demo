// Urgent / Important / Overdue signals (MASTER_SPEC §5).

import type { DateOnly } from "./dates";
import { daysRemaining, isOpen, isOverdue, type Task } from "./task";

/** Auto-urgent = overdue, due today or due tomorrow (MASTER_SPEC §5.1). */
export const AUTO_URGENT_MAX_DAYS = 1;

type UrgencyFields = Pick<Task, "status" | "deadline" | "urgentOverride">;

export function isAutoUrgent(task: Pick<Task, "deadline">, today: DateOnly): boolean {
  return daysRemaining(task, today) <= AUTO_URGENT_MAX_DAYS;
}

/**
 * Effective urgent = override ?? auto. A Done task is never urgent,
 * matching Overdue, which also excludes Done.
 */
export function isEffectiveUrgent(task: UrgencyFields, today: DateOnly): boolean {
  if (!isOpen(task)) return false;
  return task.urgentOverride ?? isAutoUrgent(task, today);
}

/** Saving a different deadline clears the override (MASTER_SPEC §5.2). */
export function urgentOverrideAfterEdit(
  previous: Pick<Task, "deadline">,
  next: Pick<Task, "deadline" | "urgentOverride">,
): boolean | null {
  return next.deadline !== previous.deadline ? null : next.urgentOverride;
}

/** Whether the form should warn "שינוי המועד יחזיר את הדחיפות לחישוב אוטומטי." */
export function deadlineChangeClearsOverride(
  previous: Pick<Task, "deadline" | "urgentOverride">,
  nextDeadline: DateOnly,
): boolean {
  return previous.urgentOverride !== null && nextDeadline !== previous.deadline;
}

export const DEADLINE_CHANGE_WARNING = "שינוי המועד יחזיר את הדחיפות לחישוב אוטומטי.";

export type OverrideMetadata = "urgent" | "not_urgent";

export interface TaskSignals {
  overdue: boolean;
  daysRemaining: number;
  important: boolean;
  /** Show the "דחופה" badge. Never when overdue (MASTER_SPEC §5.4). */
  urgentBadge: boolean;
  /** The badge carries the "ידני" marker. */
  urgentBadgeManual: boolean;
  /**
   * A manual override the badge does not convey, shown only as subtle
   * metadata (e.g. any override on an overdue task).
   */
  overrideMetadata: OverrideMetadata | null;
}

/** The single display rule every view uses for a task row. */
export function taskSignals(
  task: UrgencyFields & Pick<Task, "isImportant">,
  today: DateOnly,
): TaskSignals {
  const overdue = isOverdue(task, today);
  const urgentBadge = isEffectiveUrgent(task, today) && !overdue;
  const urgentBadgeManual = urgentBadge && task.urgentOverride !== null;
  const overrideMetadata =
    task.urgentOverride === null || urgentBadgeManual
      ? null
      : task.urgentOverride
        ? "urgent"
        : "not_urgent";
  return {
    overdue,
    daysRemaining: daysRemaining(task, today),
    important: task.isImportant,
    urgentBadge,
    urgentBadgeManual,
    overrideMetadata,
  };
}

/**
 * The quick "דחופה" action in a task row (UAT-05). It only ever marks a task manually urgent
 * (true) or returns it to automatic (null). "Manual not urgent" (false) stays an explicit choice
 * in the edit form, and an automatically urgent task gets no quick action, so the deadline rule
 * is never switched off by accident.
 */
export type QuickUrgency =
  /** Done: urgency doesn't apply. */
  | { kind: "none" }
  /** Urgent by its deadline, no override: shown, not toggled. */
  | { kind: "auto" }
  /** Manually urgent: the action returns it to automatic. */
  | { kind: "manual"; next: null }
  /** Not urgent (automatically, or by a manual "not urgent"): the action marks it urgent. */
  | { kind: "mark"; next: true };

export function quickUrgency(task: UrgencyFields, today: DateOnly): QuickUrgency {
  return quickUrgencyFor(task.urgentOverride, isOpen(task), isAutoUrgent(task, today));
}

/** The same rule from its inputs, so a row can show the next state before the server answers. */
export function quickUrgencyFor(urgentOverride: boolean | null, open: boolean, autoUrgent: boolean): QuickUrgency {
  if (!open) return { kind: "none" };
  if (urgentOverride === true) return { kind: "manual", next: null };
  if (urgentOverride === null && autoUrgent) return { kind: "auto" };
  return { kind: "mark", next: true };
}
