// Date-only values and app-timezone "today" (MASTER_SPEC §3).
//
// Date-only values are "YYYY-MM-DD" strings. Arithmetic on them runs on a
// UTC day number and never passes through local time or a timezone, so DST
// cannot shift a deadline. Instants are ISO strings / Date objects and are
// mapped to a calendar day only through APP_TIME_ZONE.

export const APP_TIME_ZONE = "Asia/Jerusalem";

/** A calendar day, "YYYY-MM-DD". */
export type DateOnly = string;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function toDayNumber(date: DateOnly): number {
  if (!isDateOnly(date)) throw new RangeError(`Invalid date-only value: ${date}`);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromDayNumber(dayNumber: number): DateOnly {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: DateOnly, days: number): DateOnly {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Calendar-day difference `a − b`. */
export function diffDays(a: DateOnly, b: DateOnly): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: DateOnly): number {
  // Day 0 (1970-01-01) was a Thursday.
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

const appDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day an instant falls on in APP_TIME_ZONE. */
export function appDateOf(instant: Date | string): DateOnly {
  const parts = appDateFormat.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "Today" in APP_TIME_ZONE, independent of the server's OS timezone. */
export function todayInAppZone(now: Date = new Date()): DateOnly {
  return appDateOf(now);
}

export interface Week {
  start: DateOnly;
  end: DateOnly;
}

/** Sunday through Saturday containing `date` (MASTER_SPEC §3). */
export function weekOf(date: DateOnly): Week {
  const start = addDays(date, -dayOfWeek(date));
  return { start, end: addDays(start, 6) };
}

export function isWithin(date: DateOnly, from: DateOnly, to: DateOnly): boolean {
  return date >= from && date <= to;
}

/** "DD.MM.YYYY" (tables). */
export function formatDateOnly(date: DateOnly): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

/** "DD.MM" (compact meta). */
export function formatDayMonth(date: DateOnly): string {
  const [, month, day] = date.split("-");
  return `${day}.${month}`;
}

/**
 * Hebrew relative text for days remaining, with dual forms:
 * "היום", "מחר", "בעוד יומיים", "בעוד 5 ימים", "באיחור של יום",
 * "באיחור של יומיים", "באיחור של 3 ימים".
 */
export function relativeDaysText(days: number): string {
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days === 2) return "בעוד יומיים";
  if (days > 2) return `בעוד ${days} ימים`;
  const late = -days;
  if (late === 1) return "באיחור של יום";
  if (late === 2) return "באיחור של יומיים";
  return `באיחור של ${late} ימים`;
}

const longDateFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: "UTC", // date-only: formatted as the same calendar day, no conversion
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "יום א׳, 8 בנובמבר 2026" (the resolved date under the deadline chips). */
export function formatDateLong(date: DateOnly): string {
  if (!isDateOnly(date)) throw new RangeError(`Invalid date-only value: ${date}`);
  return longDateFormat.format(new Date(`${date}T00:00:00Z`));
}

const timeFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "HH:MM" of an instant in APP_TIME_ZONE (24-hour). */
export function formatAppTime(instant: Date | string): string {
  return timeFormat.format(new Date(instant));
}

/**
 * The instant for a wall-clock date + "HH:MM" in APP_TIME_ZONE, as an ISO string.
 * Handles DST: the offset is resolved for that specific day and time.
 * A time that doesn't exist (the spring-forward gap) resolves to the later offset.
 */
export function appInstantOf(date: DateOnly, time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!isDateOnly(date) || !match) throw new RangeError(`Invalid date/time: ${date} ${time}`);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const wallClockUtc = Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2]));
  // Offset = (wall clock in the zone) − UTC, measured near the target; two passes settle DST.
  let instant = wallClockUtc;
  for (let pass = 0; pass < 2; pass++) {
    instant = wallClockUtc - zoneOffsetMs(instant);
  }
  return new Date(instant).toISOString();
}

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zoneOffsetMs(instant: number): number {
  const parts = Object.fromEntries(
    offsetFormat.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const monthYearFormat = new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", month: "long", year: "numeric" });

/** "נובמבר 2026" for a "YYYY-MM" month (date-only: no timezone conversion). */
export function formatMonthYear(month: string): string {
  return monthYearFormat.format(new Date(`${month}-01T00:00:00Z`));
}

const monthNameFormat = new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", month: "long" });

/** "נובמבר" for a "YYYY-MM" month (date-only: no timezone conversion). */
export function formatMonthName(month: string): string {
  return monthNameFormat.format(new Date(`${month}-01T00:00:00Z`));
}

/** Weekday names, Sunday first (MASTER_SPEC §3: the week starts on Sunday). */
export const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;
export const WEEKDAY_SHORT_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;
