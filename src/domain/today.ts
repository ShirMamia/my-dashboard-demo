// Today recommendations (MASTER_SPEC §6).

import { relativeDaysText, type DateOnly } from "./dates";
import { daysRemaining, isOpen, isOverdue, type TaskSummary } from "./task";
import { isEffectiveUrgent } from "./urgency";

export const TODAY_LIMIT = 5;
/** Shared with the Dashboard's Upcoming section (MASTER_SPEC §7.2). */
export const UPCOMING_WINDOW_DAYS = 7;
export const PICK_LIMIT_MESSAGE = "ניתן לבחור עד 5 משימות להיום.";

export interface TodayPick {
  taskId: string;
  /** ISO instant; picks are shown in the order they were added. */
  createdAt: string;
}

export type TodayReason =
  | { code: "manual" }
  | { code: "overdue"; daysRemaining: number }
  | { code: "due_today" }
  | { code: "urgent_override" }
  | { code: "due_tomorrow" }
  | { code: "important"; daysRemaining: number }
  | { code: "upcoming"; daysRemaining: number };

export interface TodayItem {
  task: TaskSummary;
  source: "pick" | "recommended";
  reason: TodayReason;
  reasonText: string;
  /** Overdue but the reason isn't the overdue reason: show the indicator too. */
  showOverdueIndicator: boolean;
  /** A picked task whose start date is still ahead ("מתחילה ב-DD.MM"). */
  startsOn: DateOnly | null;
}

export function reasonText(reason: TodayReason): string {
  switch (reason.code) {
    case "manual":
      return "נבחרה ידנית";
    case "overdue":
      return relativeDaysText(reason.daysRemaining);
    case "due_today":
      return "המועד היום";
    case "urgent_override":
      return "סומנה כדחופה";
    case "due_tomorrow":
      return "המועד מחר";
    case "important":
      return `חשובה · המועד ${relativeDaysText(reason.daysRemaining)}`;
    case "upcoming":
      return `המועד ${relativeDaysText(reason.daysRemaining)}`;
  }
}

function systemReason(task: TaskSummary, today: DateOnly): TodayReason {
  const days = daysRemaining(task, today);
  if (isOverdue(task, today)) return { code: "overdue", daysRemaining: days };
  if (days === 0) return { code: "due_today" };
  if (task.urgentOverride === true) return { code: "urgent_override" };
  if (isEffectiveUrgent(task, today)) return { code: "due_tomorrow" };
  if (task.isImportant) return { code: "important", daysRemaining: days };
  return { code: "upcoming", daysRemaining: days };
}

/** Eligibility for system recommendation (MASTER_SPEC §6.2), excluding pick/dismiss state. */
export function isRecommendable(task: TaskSummary, today: DateOnly): boolean {
  if (task.status !== "todo" && task.status !== "in_progress") return false;
  if (task.startDate !== null && task.startDate > today) return false;
  return (
    isOverdue(task, today) ||
    isEffectiveUrgent(task, today) ||
    task.isImportant ||
    daysRemaining(task, today) <= UPCOMING_WINDOW_DAYS
  );
}

/**
 * Deterministic Today ordering (MASTER_SPEC §6.3). For key 2 an overdue task
 * counts as urgent, so urgent_override = false never lowers it.
 */
export function compareForToday(a: TaskSummary, b: TaskSummary, today: DateOnly): number {
  const overdueA = isOverdue(a, today);
  const overdueB = isOverdue(b, today);
  const keys: [number, number][] = [
    [Number(overdueB), Number(overdueA)],
    [
      Number(overdueB || isEffectiveUrgent(b, today)),
      Number(overdueA || isEffectiveUrgent(a, today)),
    ],
    [Number(b.isImportant), Number(a.isImportant)],
  ];
  for (const [x, y] of keys) if (x !== y) return x - y;
  if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  const inProgressA = a.status === "in_progress";
  const inProgressB = b.status === "in_progress";
  if (inProgressA !== inProgressB) return inProgressA ? -1 : 1;
  if (a.createdAt !== b.createdAt) return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildToday(input: {
  tasks: readonly TaskSummary[];
  picks: readonly TodayPick[];
  dismissedTaskIds: readonly string[];
  today: DateOnly;
}): TodayItem[] {
  const { tasks, today } = input;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const dismissed = new Set(input.dismissedTaskIds);

  const pickedTasks = [...input.picks]
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0),
    )
    .map((pick) => byId.get(pick.taskId))
    .filter((task): task is TaskSummary => task !== undefined && isOpen(task))
    .slice(0, TODAY_LIMIT);
  const pickedIds = new Set(pickedTasks.map((task) => task.id));

  const recommended = tasks
    .filter(
      (task) => !pickedIds.has(task.id) && !dismissed.has(task.id) && isRecommendable(task, today),
    )
    .sort((a, b) => compareForToday(a, b, today))
    .slice(0, TODAY_LIMIT - pickedTasks.length);

  const item = (task: TaskSummary, source: TodayItem["source"]): TodayItem => {
    const reason: TodayReason = source === "pick" ? { code: "manual" } : systemReason(task, today);
    return {
      task,
      source,
      reason,
      reasonText: reasonText(reason),
      showOverdueIndicator: isOverdue(task, today) && reason.code !== "overdue",
      startsOn: task.startDate !== null && task.startDate > today ? task.startDate : null,
    };
  };

  return [
    ...pickedTasks.map((task) => item(task, "pick")),
    ...recommended.map((task) => item(task, "recommended")),
  ];
}

/** Lowest free pick slot 1–5, or null when all are taken (the DB enforces the same limit). */
export function nextPickSlot(usedSlots: readonly number[]): number | null {
  const used = new Set(usedSlots);
  for (let slot = 1; slot <= TODAY_LIMIT; slot++) if (!used.has(slot)) return slot;
  return null;
}

/** Tasks offered by "הוספת משימה להיום": every non-Done task not already picked. */
export function pickCandidates(tasks: readonly TaskSummary[], pickedTaskIds: readonly string[]): TaskSummary[] {
  const picked = new Set(pickedTaskIds);
  return tasks.filter((task) => isOpen(task) && !picked.has(task.id));
}
