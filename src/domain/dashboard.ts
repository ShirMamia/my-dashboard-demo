// Dashboard sections and KPIs (MASTER_SPEC §7).

import { addDays, isWithin, type DateOnly } from "./dates";
import { isCompletedInWeekOf, isOpen, isOverdue, type TaskSummary } from "./task";
import {
  UPCOMING_WINDOW_DAYS,
  buildToday,
  pickCandidates,
  type TodayItem,
  type TodayPick,
} from "./today";
import { isEffectiveUrgent } from "./urgency";

export const SECTION_ROW_LIMIT = 5;

export interface DashboardSection {
  /** Up to SECTION_ROW_LIMIT rows, deduplicated against higher sections. */
  rows: TaskSummary[];
  /** Every qualifying task, not deduplicated ("הצגת הכול"). */
  total: number;
}

export interface DashboardSections {
  urgent: DashboardSection;
  important: DashboardSection;
  upcoming: DashboardSection;
}

function byDeadlineThenStable(a: TaskSummary, b: TaskSummary): number {
  if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
  if (a.createdAt !== b.createdAt) return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function isUpcoming(task: Pick<TaskSummary, "deadline">, today: DateOnly): boolean {
  return isWithin(task.deadline, addDays(today, 1), addDays(today, UPCOMING_WINDOW_DAYS));
}

/**
 * Display precedence Today → Urgent → Important → Upcoming: a task shown in a
 * higher section is not repeated lower down (MASTER_SPEC §7.2).
 */
export function buildSections(input: {
  tasks: readonly TaskSummary[];
  todayTaskIds: readonly string[];
  today: DateOnly;
}): DashboardSections {
  const { today } = input;
  const open = input.tasks.filter(isOpen);
  const shown = new Set(input.todayTaskIds);

  const section = (qualifying: TaskSummary[]): DashboardSection => {
    const rows = qualifying.filter((task) => !shown.has(task.id)).slice(0, SECTION_ROW_LIMIT);
    for (const task of rows) shown.add(task.id);
    return { rows, total: qualifying.length };
  };

  const urgent = section(
    open
      .filter((task) => isEffectiveUrgent(task, today))
      .sort(
        (a, b) =>
          Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || byDeadlineThenStable(a, b),
      ),
  );
  const important = section(open.filter((task) => task.isImportant).sort(byDeadlineThenStable));
  const upcoming = section(
    open.filter((task) => isUpcoming(task, today)).sort(byDeadlineThenStable),
  );
  return { urgent, important, upcoming };
}

export interface DashboardKpis {
  open: number;
  overdue: number;
  completedThisWeek: number;
}

/** KPIs are not deduplicated (MASTER_SPEC §7.3). */
export function computeKpis(tasks: readonly TaskSummary[], today: DateOnly): DashboardKpis {
  let open = 0;
  let overdue = 0;
  let completedThisWeek = 0;
  for (const task of tasks) {
    if (isOpen(task)) open++;
    if (isOverdue(task, today)) overdue++;
    if (isCompletedInWeekOf(task, today)) completedThisWeek++;
  }
  return { open, overdue, completedThisWeek };
}

export interface Dashboard {
  today: TodayItem[];
  sections: DashboardSections;
  kpis: DashboardKpis;
  /** Manual picks of open tasks; at TODAY_LIMIT the picker shows the limit message. */
  openPickCount: number;
  /** "הוספת משימה להיום": every open task not picked yet (dismissed ones too), deadline order. */
  pickCandidates: TaskSummary[];
}

/**
 * The whole Dashboard from one load: Today, the deduplicated sections and the KPIs.
 * `openTasks` are the user's non-Done tasks; `completed` holds at least this week's Done
 * tasks (extra rows are ignored). Picks and dismissals must belong to `today`.
 */
export function buildDashboard(input: {
  openTasks: readonly TaskSummary[];
  completed: readonly TaskSummary[];
  picks: readonly TodayPick[];
  dismissedTaskIds: readonly string[];
  today: DateOnly;
}): Dashboard {
  const { openTasks, picks, today } = input;
  const todayItems = buildToday({ tasks: openTasks, picks, dismissedTaskIds: input.dismissedTaskIds, today });
  const pickedIds = picks.map((pick) => pick.taskId);
  return {
    today: todayItems,
    sections: buildSections({ tasks: openTasks, todayTaskIds: todayItems.map((item) => item.task.id), today }),
    kpis: computeKpis([...openTasks, ...input.completed], today),
    openPickCount: todayItems.filter((item) => item.source === "pick").length,
    pickCandidates: pickCandidates(openTasks, pickedIds).sort(byDeadlineThenStable),
  };
}
