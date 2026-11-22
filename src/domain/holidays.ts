// Israeli holidays and holiday eves from the Hebcal REST API (MASTER_SPEC §10.3, ARCHITECTURE §8.2).
// Pure: the request parameters, the allow-list and the mapping to the Calendar's holiday model.
// Raw Hebcal items never leave this module and the server adapter.

import { isDateOnly, type DateOnly } from "./dates";

export type HolidayKind = "holiday" | "erev" | "observance";

export interface Holiday {
  date: DateOnly;
  /** Hebrew, without nikud, as supplied by Hebcal. */
  name: string;
  kind: HolidayKind;
}

/**
 * One request per Gregorian year. Every parameter that changes the output is explicit, so the
 * request (and the cache key built from it) never depends on Hebcal defaults:
 * - `i=on`: the Israel holiday schedule (not the Diaspora one);
 * - `lg=he-x-NoNikud`: Hebrew titles without nikud;
 * - major, minor and modern Israeli holidays on;
 * - Rosh Chodesh, minor fasts, special Shabbatot, parashot, candle-lighting/havdalah, Omer,
 *   Daf Yomi / learning schedules and dates off.
 */
export function hebcalYearParams(year: number): URLSearchParams {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new RangeError(`Unsupported year: ${year}`);
  return new URLSearchParams({
    v: "1",
    cfg: "json",
    year: String(year),
    i: "on",
    lg: "he-x-NoNikud",
    maj: "on",
    min: "on",
    mod: "on",
    nx: "off",
    mf: "off",
    ss: "off",
    s: "off",
    c: "off",
    o: "off",
    D: "off",
    d: "off",
  });
}

/** The fields this app reads from a Hebcal item, after the server adapter validated them. */
export interface HebcalItem {
  date: string;
  title: string;
  category: string;
  subcat?: string;
  /** The English title, e.g. "Erev Pesach". */
  title_orig?: string;
}

/** The only Hebcal categories shown. Anything else is dropped, even if the API sends it. */
const ALLOWED_SUBCATEGORIES: ReadonlySet<string> = new Set(["major", "minor", "modern"]);

function kindOf(item: HebcalItem): HolidayKind {
  if (item.title_orig?.startsWith("Erev ")) return "erev";
  return item.subcat === "modern" ? "observance" : "holiday";
}

/**
 * Raw items → holidays: allow-listed categories only, date-only values (a timed item's time
 * part is ignored), one entry per date and name, sorted by date.
 */
export function normalizeHebcalItems(items: readonly HebcalItem[]): Holiday[] {
  const seen = new Set<string>();
  const holidays: Holiday[] = [];
  for (const item of items) {
    if (item.category !== "holiday" || !item.subcat || !ALLOWED_SUBCATEGORIES.has(item.subcat)) continue;
    const date = item.date.slice(0, 10);
    const name = item.title.trim();
    if (!isDateOnly(date) || name === "") continue;
    const key = `${date}\n${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    holidays.push({ date, name, kind: kindOf(item) });
  }
  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Calendar years a date range touches (one Hebcal request each). */
export function yearsInRange(from: DateOnly, to: DateOnly): number[] {
  const first = Number(from.slice(0, 4));
  const last = Number(to.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export const HOLIDAY_ATTRIBUTION = {
  text: "נתוני חגים: Hebcal.com · CC BY 4.0",
  sourceUrl: "https://www.hebcal.com/",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
} as const;

/** What the Calendar receives from the holiday source (server/data/holidays.ts). */
export interface HolidayResult {
  holidays: Holiday[];
  /** Some or all years couldn't be loaded and had no cached copy. */
  unavailable: boolean;
}

/** Holidays by date, each day in source order. */
export function groupHolidaysByDate(holidays: readonly Holiday[]): Map<DateOnly, Holiday[]> {
  const byDate = new Map<DateOnly, Holiday[]>();
  for (const holiday of holidays) {
    const list = byDate.get(holiday.date);
    if (list) list.push(holiday);
    else byDate.set(holiday.date, [holiday]);
  }
  return byDate;
}

/** The spoken type of a holiday label. */
export function holidayKindLabel(kind: HolidayKind): string {
  return kind === "erev" ? "ערב חג" : kind === "observance" ? "מועד" : "חג";
}
