// Gantt / Timeline read model (MASTER_SPEC §12, ARCHITECTURE §8.3).
//
// Canonical task and planning fields → a renderer-independent model: the visible range, its
// scale, and per-group entries positioned in whole days from the range start. Nothing here
// knows about pixels, CSS or the DOM; the renderer maps day offsets to its own geometry. All
// arithmetic is date-only (dates.ts), so no timezone or DST can move an item.

import { addMonths, firstDayOf, lastDayOf, monthOf } from "./calendar";
import {
  addDays,
  dayOfWeek,
  diffDays,
  formatDateOnly,
  formatMonthName,
  formatMonthYear,
  isDateOnly,
  isWithin,
  weekOf,
  WEEKDAY_SHORT_NAMES,
  type DateOnly,
} from "./dates";
import { sortProjects, type Project } from "./project";
import { isOverdue, type Task, type TaskStatus } from "./task";

export type TimelineZoom = "week" | "month" | "quarter" | "year";

/** Order of the zoom control (MASTER.md §6: שבוע is first, rightmost in RTL). */
export const TIMELINE_ZOOMS: readonly TimelineZoom[] = ["week", "month", "quarter", "year"];
export const ZOOM_LABELS: Record<TimelineZoom, string> = { week: "שבוע", month: "חודש", quarter: "רבעון", year: "שנה" };
export const DEFAULT_ZOOM: TimelineZoom = "month";

export interface TimelineRange {
  zoom: TimelineZoom;
  from: DateOnly;
  to: DateOnly;
  /** Number of days, inclusive of both ends. */
  days: number;
}

/** One labelled stretch of the axis, in day offsets from the range start. */
export interface ScaleSegment {
  key: string;
  label: string;
  start: number;
  length: number;
}

/** Two tiers: larger units on top, the units that carry grid lines below. */
export interface TimelineScale {
  major: ScaleSegment[];
  minor: ScaleSegment[];
}

// ── Zoom presets ──────────────────────────────────────────────────────────────────────────
// Four explicit presets, each with its range, navigation step, title and scale. Not a generic
// zoom engine: these are exactly the levels MASTER_SPEC §12 defines.

const pad = (value: number) => String(value).padStart(2, "0");
const yearOf = (date: DateOnly) => Number(date.slice(0, 4));
const monthNumberOf = (date: DateOnly) => Number(date.slice(5, 7));

function quarterStart(date: DateOnly): DateOnly {
  const firstMonth = Math.floor((monthNumberOf(date) - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${pad(firstMonth)}-01`;
}

const quarterNumber = (date: DateOnly) => Math.floor((monthNumberOf(date) - 1) / 3) + 1;
const nextMonthStart = (date: DateOnly) => firstDayOf(addMonths(monthOf(date), 1));
const nextQuarterStart = (date: DateOnly) => firstDayOf(addMonths(monthOf(quarterStart(date)), 3));

/**
 * Cuts [from, to] at the boundaries `next` returns (the first day of the following unit) and
 * labels each piece. Pieces at either end may be partial.
 */
function segments(
  from: DateOnly,
  to: DateOnly,
  next: (date: DateOnly) => DateOnly,
  label: (start: DateOnly) => string,
): ScaleSegment[] {
  const result: ScaleSegment[] = [];
  for (let start = from; start <= to; start = next(start)) {
    const end = next(start) > to ? to : addDays(next(start), -1);
    result.push({ key: start, label: label(start), start: diffDays(start, from), length: diffDays(end, start) + 1 });
  }
  return result;
}

const nextDay = (date: DateOnly) => addDays(date, 1);
const nextWeek = (date: DateOnly) => addDays(weekOf(date).start, 7);
const dayNumber = (date: DateOnly) => String(Number(date.slice(8, 10)));

interface ZoomPreset {
  range(anchor: DateOnly): { from: DateOnly; to: DateOnly };
  /** The anchor of the neighbouring range: one step earlier (−1) or later (+1). */
  step(from: DateOnly, direction: -1 | 1): DateOnly;
  title(from: DateOnly, to: DateOnly): string;
  scale(from: DateOnly, to: DateOnly): TimelineScale;
}

const PRESETS: Record<TimelineZoom, ZoomPreset> = {
  // Sunday–Saturday; days labelled with weekday and day of month.
  week: {
    range: (anchor) => {
      const week = weekOf(anchor);
      return { from: week.start, to: week.end };
    },
    step: (from, direction) => addDays(from, 7 * direction),
    title: (from, to) => `${formatDateOnly(from)} – ${formatDateOnly(to)}`,
    scale: (from, to) => ({
      major: segments(from, to, nextMonthStart, (start) => formatMonthYear(monthOf(start))),
      minor: segments(from, to, nextDay, (start) => `${WEEKDAY_SHORT_NAMES[dayOfWeek(start)]} ${dayNumber(start)}`),
    }),
  },
  // A calendar month; days labelled with their number.
  month: {
    range: (anchor) => ({ from: firstDayOf(monthOf(anchor)), to: lastDayOf(monthOf(anchor)) }),
    step: (from, direction) => firstDayOf(addMonths(monthOf(from), direction)),
    title: (from) => formatMonthYear(monthOf(from)),
    scale: (from, to) => ({
      major: segments(from, to, nextMonthStart, (start) => formatMonthYear(monthOf(start))),
      minor: segments(from, to, nextDay, dayNumber),
    }),
  },
  // A calendar quarter; months on top, Sunday-started weeks (labelled by their first day) below.
  quarter: {
    range: (anchor) => {
      const from = quarterStart(anchor);
      return { from, to: lastDayOf(addMonths(monthOf(from), 2)) };
    },
    step: (from, direction) => firstDayOf(addMonths(monthOf(from), 3 * direction)),
    title: (from) => `רבעון ${quarterNumber(from)} · ${yearOf(from)}`,
    scale: (from, to) => ({
      major: segments(from, to, nextMonthStart, (start) => formatMonthName(monthOf(start))),
      minor: segments(from, to, nextWeek, (start) => formatDateOnly(start).slice(0, 5)),
    }),
  },
  // A calendar year; quarters on top, months below.
  year: {
    range: (anchor) => ({ from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` }),
    step: (from, direction) => `${String(yearOf(from) + direction).padStart(4, "0")}-01-01`,
    title: (from) => String(yearOf(from)),
    scale: (from, to) => ({
      major: segments(from, to, nextQuarterStart, (start) => `רבעון ${quarterNumber(start)}`),
      minor: segments(from, to, nextMonthStart, (start) => formatMonthName(monthOf(start))),
    }),
  },
};

export function timelineRange(zoom: TimelineZoom, anchor: DateOnly): TimelineRange {
  const { from, to } = PRESETS[zoom].range(anchor);
  return { zoom, from, to, days: diffDays(to, from) + 1 };
}

export function timelineTitle(range: TimelineRange): string {
  return PRESETS[range.zoom].title(range.from, range.to);
}

export function timelineScale(range: TimelineRange): TimelineScale {
  return PRESETS[range.zoom].scale(range.from, range.to);
}

/** The anchor of the previous (−1) or next (+1) range at the same zoom. */
export function stepAnchor(range: TimelineRange, direction: -1 | 1): DateOnly {
  return PRESETS[range.zoom].step(range.from, direction);
}

/** Switching zoom keeps today when it is in view, otherwise the start of the current range. */
export function zoomAnchor(range: TimelineRange, today: DateOnly): DateOnly {
  return isWithin(today, range.from, range.to) ? today : range.from;
}

// ── URL state ─────────────────────────────────────────────────────────────────────────────

export interface TimelineParams {
  zoom: TimelineZoom;
  /** Any day inside the range to show; today when absent. */
  anchor: DateOnly;
  /** "הצג גם משימות עם מועד בלבד" (only meaningful at Quarter and Year). */
  showDeadlineOnly: boolean;
  /** Done tasks are shown muted by default (MASTER_SPEC §12); the toggle hides them. */
  showDone: boolean;
  /** The accessible list instead of the chart (always the list below 768px). */
  list: boolean;
}

const isZoom = (value: unknown): value is TimelineZoom => TIMELINE_ZOOMS.includes(value as TimelineZoom);

export function parseTimelineParams(params: Record<string, string | undefined>, today: DateOnly): TimelineParams {
  const date = params.date;
  return {
    zoom: isZoom(params.zoom) ? params.zoom : DEFAULT_ZOOM,
    anchor: date !== undefined && isDateOnly(date) ? date : today,
    showDeadlineOnly: params.deadlines === "1",
    showDone: params.done !== "0",
    list: params.view === "list",
  };
}

/** `/timeline` with only the non-default parameters; no anchor means "the range with today". */
export function timelineHref(params: Omit<TimelineParams, "anchor"> & { anchor?: DateOnly }): string {
  const search = new URLSearchParams();
  if (params.zoom !== DEFAULT_ZOOM) search.set("zoom", params.zoom);
  if (params.anchor) search.set("date", params.anchor);
  if (params.showDeadlineOnly) search.set("deadlines", "1");
  if (!params.showDone) search.set("done", "0");
  if (params.list) search.set("view", "list");
  const query = search.toString();
  return query ? `/timeline?${query}` : "/timeline";
}

// ── Items ─────────────────────────────────────────────────────────────────────────────────

export type TimelineTask = Pick<Task, "id" | "title" | "status" | "startDate" | "deadline" | "projectId">;

export interface TimelinePlanningItem {
  id: string;
  title: string;
  date: DateOnly;
  projectId: string | null;
}

export type TimelineEntry =
  | {
      /** A task with a start date: start → deadline, both inclusive. */
      kind: "span";
      key: string;
      taskId: string;
      title: string;
      status: TaskStatus;
      startDate: DateOnly;
      deadline: DateOnly;
      overdue: boolean;
      /** First visible day offset (inclusive). */
      start: number;
      /** Day offset after the last visible day (exclusive). */
      end: number;
      /** The span continues before / after the visible range. */
      clippedStart: boolean;
      clippedEnd: boolean;
    }
  | {
      /** A task without a start date: a marker on its deadline. */
      kind: "deadline";
      key: string;
      taskId: string;
      title: string;
      status: TaskStatus;
      deadline: DateOnly;
      overdue: boolean;
      at: number;
    }
  | {
      /** A planning item / milestone: a point in time. */
      kind: "milestone";
      key: string;
      itemId: string;
      title: string;
      date: DateOnly;
      at: number;
    };

export interface TimelineGroup {
  key: string;
  /** null: "ללא פרויקט", always last. */
  projectId: string | null;
  name: string;
  archived: boolean;
  /** Completed (UAT-03): its tasks still show by the usual rules; the heading says it. */
  completed: boolean;
  entries: TimelineEntry[];
}

export interface TimelineModel {
  range: TimelineRange;
  scale: TimelineScale;
  /** Day offset of today, or null when today is outside the range. */
  today: number | null;
  groups: TimelineGroup[];
  /** Quarter/Year hide deadline-only tasks by default (MASTER_SPEC §12). */
  densityFilter: boolean;
  /** Deadline-only tasks in the range that this view hides (0 when nothing is hidden). */
  hiddenDeadlineOnly: number;
}

export const NO_PROJECT_NAME = "ללא פרויקט";

/** Quarter and Year show long-term planning only, unless deadline-only tasks are asked for. */
export function hidesDeadlineOnly(zoom: TimelineZoom): boolean {
  return zoom === "quarter" || zoom === "year";
}

/** Whether a task's start → deadline interval (or its deadline alone) touches the range. */
export function overlapsRange(task: Pick<TimelineTask, "startDate" | "deadline">, range: TimelineRange): boolean {
  return task.deadline >= range.from && (task.startDate ?? task.deadline) <= range.to;
}

/**
 * The density filter (display only; the data is never changed): which tasks the view shows,
 * and how many deadline-only tasks it hides.
 */
export function applyDensity<T extends Pick<TimelineTask, "startDate">>(
  tasks: readonly T[],
  zoom: TimelineZoom,
  showDeadlineOnly: boolean,
): { shown: T[]; hidden: number } {
  if (!hidesDeadlineOnly(zoom) || showDeadlineOnly) return { shown: [...tasks], hidden: 0 };
  const shown = tasks.filter((task) => task.startDate !== null);
  return { shown, hidden: tasks.length - shown.length };
}

/** "משימה אחת עם מועד בלבד מוסתרת" / "12 משימות עם מועד בלבד מוסתרות". */
export function hiddenDeadlineOnlyText(count: number): string {
  return count === 1 ? "משימה אחת עם מועד בלבד מוסתרת" : `${count} משימות עם מועד בלבד מוסתרות`;
}

function taskEntry(task: TimelineTask, range: TimelineRange, today: DateOnly): TimelineEntry {
  const overdue = isOverdue(task, today);
  if (task.startDate === null) {
    return {
      kind: "deadline",
      key: `t:${task.id}`,
      taskId: task.id,
      title: task.title,
      status: task.status,
      deadline: task.deadline,
      overdue,
      at: diffDays(task.deadline, range.from),
    };
  }
  return {
    kind: "span",
    key: `t:${task.id}`,
    taskId: task.id,
    title: task.title,
    status: task.status,
    startDate: task.startDate,
    deadline: task.deadline,
    overdue,
    start: Math.max(0, diffDays(task.startDate, range.from)),
    end: Math.min(range.days, diffDays(task.deadline, range.from) + 1),
    clippedStart: task.startDate < range.from,
    clippedEnd: task.deadline > range.to,
  };
}

const entryDate = (entry: TimelineEntry) =>
  entry.kind === "span" ? entry.startDate : entry.kind === "deadline" ? entry.deadline : entry.date;
const KIND_ORDER: Record<TimelineEntry["kind"], number> = { milestone: 0, span: 1, deadline: 2 };
const titleCollator = new Intl.Collator("he", { sensitivity: "base", numeric: true });

/** By the date the entry starts on, then milestones → spans → markers, title, and key. */
function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  const dateA = entryDate(a);
  const dateB = entryDate(b);
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    titleCollator.compare(a.title, b.title) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/**
 * The whole view: items in the range after the Done and density filters, grouped by project
 * (projects in their usual order, "ללא פרויקט" last, empty groups omitted).
 */
export function buildTimeline(input: {
  range: TimelineRange;
  today: DateOnly;
  tasks: readonly TimelineTask[];
  planningItems: readonly TimelinePlanningItem[];
  projects: readonly (Pick<Project, "id" | "name" | "archivedAt"> & Partial<Pick<Project, "completedAt">>)[];
  showDone: boolean;
  showDeadlineOnly: boolean;
}): TimelineModel {
  const { range, today } = input;
  const inRange = input.tasks.filter((task) => overlapsRange(task, range) && (input.showDone || task.status !== "done"));
  const { shown, hidden } = applyDensity(inRange, range.zoom, input.showDeadlineOnly);
  const entries = [
    ...shown.map((task) => ({ projectId: task.projectId, entry: taskEntry(task, range, today) })),
    ...input.planningItems
      .filter((item) => isWithin(item.date, range.from, range.to))
      .map((item) => ({
        projectId: item.projectId,
        entry: {
          kind: "milestone",
          key: `p:${item.id}`,
          itemId: item.id,
          title: item.title,
          date: item.date,
          at: diffDays(item.date, range.from),
        } satisfies TimelineEntry,
      })),
  ];

  const known = new Set(input.projects.map((project) => project.id));
  const byProject = new Map<string | null, TimelineEntry[]>();
  for (const { projectId, entry } of entries) {
    // A project the list doesn't know (it can't happen under the FKs) falls back to "no project".
    const key = projectId !== null && known.has(projectId) ? projectId : null;
    byProject.set(key, [...(byProject.get(key) ?? []), entry]);
  }

  const groups: TimelineGroup[] = sortProjects(input.projects)
    .filter((project) => byProject.has(project.id))
    .map((project) => ({
      key: project.id,
      projectId: project.id,
      name: project.name,
      archived: project.archivedAt !== null,
      completed: (project.completedAt ?? null) !== null,
      entries: byProject.get(project.id)!.sort(compareEntries),
    }));
  const unassigned = byProject.get(null);
  if (unassigned) {
    groups.push({ key: "none", projectId: null, name: NO_PROJECT_NAME, archived: false, completed: false, entries: unassigned.sort(compareEntries) });
  }

  return {
    range,
    scale: timelineScale(range),
    today: isWithin(today, range.from, range.to) ? diffDays(today, range.from) : null,
    groups,
    densityFilter: hidesDeadlineOnly(range.zoom),
    hiddenDeadlineOnly: hidden,
  };
}
