// Tasks list filters and sort (MASTER_SPEC §13). The URL query string is the source of truth.
//
// Combination rule: every active filter must match (AND); within the status filter any
// selected status matches (OR). Done tasks are hidden unless "show completed" is on or the
// status filter explicitly selects Done.

import { addDays, isDateOnly, isWithin, weekOf, type DateOnly } from "./dates";
import { isCompletedInWeekOf, isOverdue, isTaskStatus, type Task, type TaskStatus } from "./task";
import { isEffectiveUrgent } from "./urgency";

export type DueRange = "today" | "week" | "next7" | "custom";
export type SortKey = "deadline" | "created" | "title";
export type SortDirection = "asc" | "desc";

/** `null` = any; "none" = tasks without a project/category. */
export type RefFilter = string | "none" | null;

export interface TaskFilters {
  q: string;
  statuses: TaskStatus[];
  projectId: RefFilter;
  categoryId: RefFilter;
  important: boolean;
  urgent: boolean;
  overdue: boolean;
  due: DueRange | null;
  /** Only with due = "custom"; either bound may be open. */
  from: DateOnly | null;
  to: DateOnly | null;
  showCompleted: boolean;
  /** Done tasks completed this week (the Dashboard's "הושלמו השבוע" KPI). */
  completedThisWeek: boolean;
  sort: SortKey;
  dir: SortDirection;
}

export const DEFAULT_FILTERS: TaskFilters = {
  q: "",
  statuses: [],
  projectId: null,
  categoryId: null,
  important: false,
  urgent: false,
  overdue: false,
  due: null,
  from: null,
  to: null,
  showCompleted: false,
  completedThisWeek: false,
  sort: "deadline",
  dir: "asc",
};

export const DUE_RANGE_LABELS: Record<DueRange, string> = {
  today: "היום",
  week: "השבוע",
  next7: "7 הימים הקרובים",
  custom: "טווח מותאם",
};

export const SORT_LABELS: Record<SortKey, string> = {
  deadline: "מועד",
  created: "תאריך יצירה",
  title: "כותרת",
};

const DUE_RANGES: readonly DueRange[] = ["today", "week", "next7", "custom"];
const SORT_KEYS: readonly SortKey[] = ["deadline", "created", "title"];
const Q_MAX_LENGTH = 200;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function flag(value: string | string[] | undefined): boolean {
  return first(value) === "1";
}

function ref(value: string | string[] | undefined): RefFilter {
  const v = first(value)?.trim();
  return v ? v : null;
}

function dateOrNull(value: string | string[] | undefined): DateOnly | null {
  const v = first(value);
  return v && isDateOnly(v) ? v : null;
}

/** Parses URL search params; unknown or malformed values fall back to the defaults. */
export function parseTaskFilters(params: SearchParams): TaskFilters {
  const statuses = (first(params.status) ?? "")
    .split(",")
    .filter(isTaskStatus)
    .filter((status, index, all) => all.indexOf(status) === index);
  const due = first(params.due);
  const sort = first(params.sort);
  const parsedDue = DUE_RANGES.includes(due as DueRange) ? (due as DueRange) : null;
  return {
    q: (first(params.q) ?? "").trim().slice(0, Q_MAX_LENGTH),
    statuses,
    projectId: ref(params.project),
    categoryId: ref(params.category),
    important: flag(params.important),
    urgent: flag(params.urgent),
    overdue: flag(params.overdue),
    due: parsedDue,
    from: parsedDue === "custom" ? dateOrNull(params.from) : null,
    to: parsedDue === "custom" ? dateOrNull(params.to) : null,
    showCompleted: flag(params.done),
    completedThisWeek: first(params.completed) === "week",
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_FILTERS.sort,
    dir: first(params.dir) === "desc" ? "desc" : "asc",
  };
}

/** The query string for `filters`, omitting defaults, in a stable key order. */
export function serializeTaskFilters(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.statuses.length) params.set("status", filters.statuses.join(","));
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.important) params.set("important", "1");
  if (filters.urgent) params.set("urgent", "1");
  if (filters.overdue) params.set("overdue", "1");
  if (filters.due) params.set("due", filters.due);
  if (filters.due === "custom" && filters.from) params.set("from", filters.from);
  if (filters.due === "custom" && filters.to) params.set("to", filters.to);
  if (filters.showCompleted) params.set("done", "1");
  if (filters.completedThisWeek) params.set("completed", "week");
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.dir !== DEFAULT_FILTERS.dir) params.set("dir", filters.dir);
  return params.toString();
}

/** A link to the Tasks list with `patch` applied to the default filters (Dashboard links). */
export function tasksHref(patch: Partial<TaskFilters>): string {
  const query = serializeTaskFilters({ ...DEFAULT_FILTERS, ...patch });
  return query ? `/tasks?${query}` : "/tasks";
}

/** Whether any filter narrows the list (sort and "show completed" don't count). */
/**
 * How many filter criteria narrow the list (the mobile "סינון (N)" count). Each criterion counts
 * once: several selected statuses are one criterion. Sort and "show completed" don't count.
 */
export function activeFilterCount(filters: TaskFilters): number {
  return [
    filters.q !== "",
    filters.statuses.length > 0,
    filters.projectId !== null,
    filters.categoryId !== null,
    filters.important,
    filters.urgent,
    filters.overdue,
    filters.due !== null,
    filters.completedThisWeek,
  ].filter(Boolean).length;
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return activeFilterCount(filters) > 0;
}

/** Whether Done tasks must be loaded at all. */
export function includesDone(filters: TaskFilters): boolean {
  return filters.showCompleted || filters.completedThisWeek || filters.statuses.includes("done");
}

/** Inclusive deadline bounds for a due range; `null` bound = open. */
export function dueBounds(
  filters: Pick<TaskFilters, "due" | "from" | "to">,
  today: DateOnly,
): { from: DateOnly | null; to: DateOnly | null } | null {
  switch (filters.due) {
    case null:
      return null;
    case "today":
      return { from: today, to: today };
    case "week": {
      const week = weekOf(today);
      return { from: week.start, to: week.end };
    }
    case "next7":
      return { from: today, to: addDays(today, 7) };
    case "custom":
      return { from: filters.from, to: filters.to };
  }
}

function matchesRef(value: string | null, filter: RefFilter): boolean {
  if (filter === null) return true;
  if (filter === "none") return value === null;
  return value === filter;
}

export function matchesFilters(task: Task, filters: TaskFilters, today: DateOnly): boolean {
  if (task.status === "done" && !includesDone(filters)) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false;
  if (!matchesRef(task.projectId, filters.projectId)) return false;
  if (!matchesRef(task.categoryId, filters.categoryId)) return false;
  if (filters.important && !task.isImportant) return false;
  if (filters.urgent && !isEffectiveUrgent(task, today)) return false;
  if (filters.overdue && !isOverdue(task, today)) return false;
  if (filters.completedThisWeek && !isCompletedInWeekOf(task, today)) return false;

  const bounds = dueBounds(filters, today);
  if (bounds) {
    if (bounds.from && bounds.to && !isWithin(task.deadline, bounds.from, bounds.to)) return false;
    if (bounds.from && !bounds.to && task.deadline < bounds.from) return false;
    if (!bounds.from && bounds.to && task.deadline > bounds.to) return false;
  }

  if (filters.q) {
    const needle = filters.q.toLocaleLowerCase();
    const haystack = `${task.title}\n${task.notes ?? ""}`.toLocaleLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

const titleCollator = new Intl.Collator("he", { sensitivity: "base", numeric: true });

function compareBy(sort: SortKey, a: Task, b: Task): number {
  switch (sort) {
    case "deadline":
      return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
    case "created":
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    case "title":
      return titleCollator.compare(a.title, b.title);
  }
}

/** Sorted copy. Ties fall back to deadline, created date, then id, so the order is deterministic. */
export function sortTasks(tasks: readonly Task[], sort: SortKey, dir: SortDirection): Task[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...tasks].sort(
    (a, b) =>
      sign * compareBy(sort, a, b) ||
      compareBy("deadline", a, b) ||
      compareBy("created", a, b) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function applyTaskFilters(tasks: readonly Task[], filters: TaskFilters, today: DateOnly): Task[] {
  return sortTasks(
    tasks.filter((task) => matchesFilters(task, filters, today)),
    filters.sort,
    filters.dir,
  );
}
