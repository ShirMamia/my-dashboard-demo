// Calendar month view (MASTER_SPEC §10): the visible range, URL state and the per-day read model.
// One visible range (whole Sunday–Saturday weeks around the month) drives the queries, the
// yearly expansion, the holiday fetch and the grid, so leading/trailing days are never empty.

import { addDays, appDateOf, formatAppTime, isDateOnly, isWithin, weekOf, type DateOnly } from "./dates";
import { expandEvents, type CalendarEvent } from "./events";
import type { PlanningItem } from "./planning";
import { isOverdue, type Task, type TaskStatus } from "./task";

/** "YYYY-MM". */
export type MonthKey = string;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthOf(date: DateOnly): MonthKey {
  return date.slice(0, 7);
}

export function firstDayOf(month: MonthKey): DateOnly {
  return `${month}-01`;
}

export function addMonths(month: MonthKey, months: number): MonthKey {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + months;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function lastDayOf(month: MonthKey): DateOnly {
  return addDays(firstDayOf(addMonths(month, 1)), -1);
}

/** The "month" URL param: a valid month in a sane range, else the current month. */
export function parseMonthParam(value: string | undefined, today: DateOnly): MonthKey {
  const match = value ? MONTH_KEY.exec(value) : null;
  if (!match) return monthOf(today);
  const year = Number(match[1]);
  return year >= 1900 && year <= 2200 ? value! : monthOf(today);
}

export interface MonthGrid {
  month: MonthKey;
  /** First and last visible day: whole weeks, Sunday through Saturday. */
  from: DateOnly;
  to: DateOnly;
  /** 4–6 rows of 7 dates. */
  weeks: DateOnly[][];
}

export function monthGrid(month: MonthKey): MonthGrid {
  const from = weekOf(firstDayOf(month)).start;
  const to = weekOf(lastDayOf(month)).end;
  const weeks: DateOnly[][] = [];
  for (let start = from; start <= to; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(start, index)));
  }
  return { month, from, to, weeks };
}

/** The "day" URL param when it's in the visible grid; else today (if visible) or the 1st. */
export function parseDayParam(value: string | undefined, grid: MonthGrid, today: DateOnly): DateOnly {
  if (value && isDateOnly(value) && isWithin(value, grid.from, grid.to)) return value;
  return monthOf(today) === grid.month ? today : firstDayOf(grid.month);
}

/** The Calendar URL for a month and selected day. */
export function calendarHref(month: MonthKey, day?: DateOnly, showDone = false): string {
  const params = new URLSearchParams({ month });
  if (day) params.set("day", day);
  if (showDone) params.set("done", "1");
  return `/calendar?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Read model: one discriminated union for the local items the grid and the day panel show.
// It is derived per request and never stored. Holidays are not part of it: they come from an
// external source and render independently (domain/holidays.ts), so they never delay it.
// ---------------------------------------------------------------------------

export type CalendarItem =
  | {
      kind: "event";
      key: string;
      eventId: string;
      title: string;
      notes: string | null;
      /**
       * The stored event, as the form edits it: all-day dates (a yearly event's first date), or a
       * timed event's Asia/Jerusalem dates and "HH:MM" times.
       */
      allDay: boolean;
      startDate: DateOnly;
      endDate: DateOnly;
      startTime: string | null;
      endTime: string | null;
      yearly: boolean;
      /** Position within a multi-day occurrence (1 of 1 for a single day). */
      dayIndex: number;
      dayCount: number;
      /** Sort time within the day: start instant on its first day, else none. */
      sortAt: string | null;
    }
  | { kind: "planning"; key: string; itemId: string; title: string }
  | { kind: "deadline"; key: string; taskId: string; title: string; status: TaskStatus; overdue: boolean }
  | { kind: "scheduled"; key: string; taskId: string; title: string; status: TaskStatus; time: string; sortAt: string };

export type CalendarTask = Pick<Task, "id" | "title" | "status" | "deadline" | "scheduledAt">;

/**
 * All-day events → planning markers → task deadlines → timed items by time (MASTER.md §6
 * Calendar; holiday labels sit above).
 */
function rank(item: CalendarItem): number {
  if (item.kind === "event") return item.allDay || item.dayIndex > 1 ? 0 : 3;
  if (item.kind === "planning") return 1;
  return item.kind === "deadline" ? 2 : 3;
}

function sortTime(item: CalendarItem): string {
  return item.kind === "deadline" || item.kind === "planning" ? "" : (item.sortAt ?? "");
}

function compareItems(a: CalendarItem, b: CalendarItem): number {
  return (
    rank(a) - rank(b) ||
    sortTime(a).localeCompare(sortTime(b)) ||
    a.title.localeCompare(b.title, "he") ||
    a.key.localeCompare(b.key)
  );
}

/**
 * Every local item of the visible range, grouped by date and ordered within each day.
 * - Task deadlines: date-only, on the deadline itself (never converted through a timezone).
 * - Scheduled work: the Asia/Jerusalem day and time of the instant. A task with both shows both.
 * - Events: all-day ranges on each covered day; timed events on each app-zone day they cover.
 * - Planning items: a marker on their date-only day (Phase 10).
 */
export function buildCalendarDays(input: {
  from: DateOnly;
  to: DateOnly;
  today: DateOnly;
  tasks: readonly CalendarTask[];
  events: readonly CalendarEvent[];
  planningItems?: readonly Pick<PlanningItem, "id" | "title" | "date">[];
}): Map<DateOnly, CalendarItem[]> {
  const { from, to, today } = input;
  const days = new Map<DateOnly, CalendarItem[]>();
  const add = (date: DateOnly, item: CalendarItem) => {
    if (!isWithin(date, from, to)) return;
    const list = days.get(date);
    if (list) list.push(item);
    else days.set(date, [item]);
  };

  for (const task of input.tasks) {
    add(task.deadline, {
      kind: "deadline",
      key: `d:${task.id}`,
      taskId: task.id,
      title: task.title,
      status: task.status,
      overdue: isOverdue(task, today),
    });
    if (task.scheduledAt) {
      add(appDateOf(task.scheduledAt), {
        kind: "scheduled",
        key: `s:${task.id}`,
        taskId: task.id,
        title: task.title,
        status: task.status,
        time: formatAppTime(task.scheduledAt),
        sortAt: new Date(task.scheduledAt).toISOString(),
      });
    }
  }
  for (const item of input.planningItems ?? []) {
    add(item.date, { kind: "planning", key: `p:${item.id}`, itemId: item.id, title: item.title });
  }
  for (const { event, date, dayIndex, dayCount } of expandEvents(input.events, from, to)) {
    add(date, {
      kind: "event",
      key: `e:${event.id}:${date}`,
      eventId: event.id,
      title: event.title,
      notes: event.notes,
      allDay: event.allDay,
      startDate: event.allDay ? event.startDate : appDateOf(event.startsAt),
      endDate: event.allDay ? event.endDate : appDateOf(event.endsAt),
      startTime: event.allDay ? null : formatAppTime(event.startsAt),
      endTime: event.allDay ? null : formatAppTime(event.endsAt),
      yearly: event.recurrence === "yearly",
      dayIndex,
      dayCount,
      sortAt: !event.allDay && dayIndex === 1 ? new Date(event.startsAt).toISOString() : null,
    });
  }
  for (const list of days.values()) list.sort(compareItems);
  return days;
}

// ---------------------------------------------------------------------------
// Week layout: multi-day all-day events as continuous spans (MASTER.md §6 Calendar)
// ---------------------------------------------------------------------------

/** Rows of items per day cell on wide screens: span lanes plus single-day chips. */
export const CELL_ITEM_LIMIT = 3;
/** At most this many lanes of spans per week; further spans count in "+N נוספים". */
export const MAX_SPAN_LANES = 2;

type EventItem = Extract<CalendarItem, { kind: "event" }>;

/** A multi-day all-day event, drawn as one continuous bar. */
export function isSpanItem(item: CalendarItem): item is EventItem {
  return item.kind === "event" && item.allDay && item.dayCount > 1;
}

export interface WeekSpan {
  key: string;
  eventId: string;
  title: string;
  /** 0-based columns within the week (0 = Sunday, inline-start). */
  startColumn: number;
  endColumn: number;
  lane: number;
  /** The event started before this week's first covered day / continues after its last. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface WeekLayout {
  /** Spans drawn in lanes 0 … laneCount − 1. */
  spans: WeekSpan[];
  laneCount: number;
  /** Per day: the single-day items shown after the lanes, and how many items are not shown. */
  cells: Record<DateOnly, { chips: CalendarItem[]; hidden: number }>;
}

/**
 * Lays out one week row. Each multi-day all-day event becomes one segment per week (a span
 * can't cross grid rows), placed in the first free lane; earlier and longer segments first.
 * Every item counts once per day it occurs on: a span is a single item for each day it
 * covers, whether drawn in a lane or (beyond MAX_SPAN_LANES) counted as hidden.
 */
export function layoutWeek(
  week: readonly DateOnly[],
  days: Readonly<Record<DateOnly, readonly CalendarItem[]>>,
  limit = CELL_ITEM_LIMIT,
  maxLanes = MAX_SPAN_LANES,
): WeekLayout {
  const segments = new Map<string, Omit<WeekSpan, "lane">>();
  week.forEach((date, column) => {
    for (const item of days[date] ?? []) {
      if (!isSpanItem(item)) continue;
      const segment = segments.get(item.eventId);
      if (segment) {
        segment.endColumn = column;
        segment.continuesAfter = item.dayIndex < item.dayCount;
      } else {
        segments.set(item.eventId, {
          key: `${item.eventId}:${date}`,
          eventId: item.eventId,
          title: item.title,
          startColumn: column,
          endColumn: column,
          continuesBefore: item.dayIndex > 1,
          continuesAfter: item.dayIndex < item.dayCount,
        });
      }
    }
  });

  const ordered = [...segments.values()].sort(
    (a, b) =>
      a.startColumn - b.startColumn ||
      b.endColumn - b.startColumn - (a.endColumn - a.startColumn) ||
      a.title.localeCompare(b.title, "he") ||
      a.key.localeCompare(b.key),
  );
  const laneEnds: number[] = [];
  const spans: WeekSpan[] = [];
  const hiddenSpans: Omit<WeekSpan, "lane">[] = [];
  for (const segment of ordered) {
    const free = laneEnds.findIndex((end) => end < segment.startColumn);
    const lane = free === -1 ? laneEnds.length : free;
    if (lane >= maxLanes) {
      hiddenSpans.push(segment);
      continue;
    }
    laneEnds[lane] = segment.endColumn;
    spans.push({ ...segment, lane });
  }
  const laneCount = laneEnds.length;

  const cells: WeekLayout["cells"] = {};
  week.forEach((date, column) => {
    const singles = (days[date] ?? []).filter((item) => !isSpanItem(item));
    const room = Math.max(0, limit - laneCount);
    const hiddenSpanCount = hiddenSpans.filter((span) => span.startColumn <= column && column <= span.endColumn).length;
    cells[date] = { chips: singles.slice(0, room), hidden: Math.max(0, singles.length - room) + hiddenSpanCount };
  });
  return { spans, laneCount, cells };
}

/** The same day of the month `months` away, clamped to that month's length (PageUp/PageDown). */
export function shiftMonthKeepingDay(date: DateOnly, months: number): DateOnly {
  const month = addMonths(monthOf(date), months);
  const last = lastDayOf(month);
  const day = `${month}-${date.slice(8, 10)}`;
  return isDateOnly(day) && day <= last ? day : last;
}
