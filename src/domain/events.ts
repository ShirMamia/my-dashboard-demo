// User calendar events (MASTER_SPEC §10.2): all-day date ranges or timed instants, with
// recurrence "none" | "yearly" only. No recurrence engine: yearly events are expanded for the
// requested range on read, never stored as extra rows.

import { addDays, appDateOf, appInstantOf, diffDays, isDateOnly, isWithin, type DateOnly } from "./dates";
import { TITLE_MAX_LENGTH } from "./task";

export type EventRecurrence = "none" | "yearly";

interface EventBase {
  id: string;
  title: string;
  notes: string | null;
  recurrence: EventRecurrence;
}

/** All-day: an inclusive date-only range (a single day when start = end). */
export interface AllDayEvent extends EventBase {
  allDay: true;
  startDate: DateOnly;
  endDate: DateOnly;
}

/** Timed: two instants, shown in Asia/Jerusalem. Never yearly (DB check). */
export interface TimedEvent extends EventBase {
  allDay: false;
  startsAt: string;
  endsAt: string;
}

export type CalendarEvent = AllDayEvent | TimedEvent;

export type EventInput = Omit<AllDayEvent, "id"> | Omit<TimedEvent, "id">;

// ---------------------------------------------------------------------------
// Form validation (the server action's boundary)
// ---------------------------------------------------------------------------

/** The event form's raw values. Dates are "YYYY-MM-DD"; times "HH:MM" (Asia/Jerusalem). */
export interface EventFormValues {
  title: string;
  notes: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  yearly: boolean;
}

export type EventFieldErrors = Partial<Record<"title" | "startDate" | "endDate" | "startTime" | "endTime" | "yearly", string>>;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseEventForm(values: EventFormValues): { ok: true; input: EventInput } | { ok: false; errors: EventFieldErrors } {
  const errors: EventFieldErrors = {};
  const title = values.title.trim();
  if (title.length === 0) errors.title = "יש להזין כותרת.";
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `הכותרת יכולה להכיל עד ${TITLE_MAX_LENGTH} תווים.`;

  const startValid = isDateOnly(values.startDate);
  const endValid = isDateOnly(values.endDate);
  if (!startValid) errors.startDate = "יש לבחור תאריך התחלה.";
  if (!endValid) errors.endDate = "יש לבחור תאריך סיום.";
  if (startValid && endValid && values.endDate < values.startDate) {
    errors.endDate = "תאריך הסיום לא יכול להיות לפני תאריך ההתחלה.";
  }

  if (!values.allDay) {
    if (!TIME.test(values.startTime)) errors.startTime = "יש להזין שעת התחלה בפורמט HH:MM.";
    if (!TIME.test(values.endTime)) errors.endTime = "יש להזין שעת סיום בפורמט HH:MM.";
    if (values.yearly) errors.yearly = "רק אירוע של יום שלם יכול לחזור מדי שנה.";
  } else if (values.yearly && startValid && endValid && values.startDate !== values.endDate) {
    errors.yearly = "אירוע שחוזר מדי שנה הוא אירוע של יום אחד.";
  }

  const notes = values.notes.trim() === "" ? null : values.notes.trim();
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  if (values.allDay) {
    return {
      ok: true,
      input: {
        allDay: true,
        title,
        notes,
        startDate: values.startDate,
        endDate: values.endDate,
        recurrence: values.yearly ? "yearly" : "none",
      },
    };
  }
  const startsAt = appInstantOf(values.startDate, values.startTime);
  const endsAt = appInstantOf(values.endDate, values.endTime);
  if (Date.parse(endsAt) < Date.parse(startsAt)) {
    return { ok: false, errors: { endTime: "שעת הסיום לא יכולה להיות לפני שעת ההתחלה." } };
  }
  return { ok: true, input: { allDay: false, title, notes, startsAt, endsAt, recurrence: "none" } };
}

// ---------------------------------------------------------------------------
// Occurrences for a visible range
// ---------------------------------------------------------------------------

/** One event on one calendar day of the visible range. */
export interface EventDay {
  event: CalendarEvent;
  date: DateOnly;
  /** 1-based position within a multi-day occurrence, and its length in days. */
  dayIndex: number;
  dayCount: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The date of a yearly event in `year`. 29 February falls on 28 February in non-leap years
 * (MASTER_SPEC §10.2). Events don't occur before the year they start.
 */
export function yearlyDateIn(startDate: DateOnly, year: number): DateOnly | null {
  const startYear = Number(startDate.slice(0, 4));
  if (year < startYear) return null;
  const monthDay = startDate.slice(5);
  const date = monthDay === "02-29" && !isLeapYear(year) ? "02-28" : monthDay;
  return `${String(year).padStart(4, "0")}-${date}`;
}

/** The app-timezone days a timed event covers. An event ending exactly at midnight doesn't spill into the next day. */
function timedDays(event: TimedEvent): { first: DateOnly; last: DateOnly } {
  const first = appDateOf(event.startsAt);
  const end = Date.parse(event.endsAt);
  const lastInstant = end > Date.parse(event.startsAt) ? new Date(end - 1) : new Date(end);
  const last = appDateOf(lastInstant);
  return { first, last: last < first ? first : last };
}

/**
 * Every day of the range on which an event occurs, once per event and day. Overlapping or
 * repeated requests for the same range produce the same list (no stored occurrences).
 */
export function expandEvents(events: readonly CalendarEvent[], from: DateOnly, to: DateOnly): EventDay[] {
  const days: EventDay[] = [];
  const push = (event: CalendarEvent, first: DateOnly, last: DateOnly) => {
    const dayCount = diffDays(last, first) + 1;
    const start = first < from ? from : first;
    const end = last > to ? to : last;
    for (let date = start; date <= end; date = addDays(date, 1)) {
      days.push({ event, date, dayIndex: diffDays(date, first) + 1, dayCount });
    }
  };

  for (const event of events) {
    if (!event.allDay) {
      const { first, last } = timedDays(event);
      push(event, first, last);
    } else if (event.recurrence === "yearly") {
      const firstYear = Number(from.slice(0, 4));
      const lastYear = Number(to.slice(0, 4));
      for (let year = firstYear; year <= lastYear; year++) {
        const date = yearlyDateIn(event.startDate, year);
        if (date && isWithin(date, from, to)) push(event, date, date);
      }
    } else {
      push(event, event.startDate, event.endDate);
    }
  }
  return days;
}
