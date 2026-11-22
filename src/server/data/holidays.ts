import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isWithin, type DateOnly } from "@/domain/dates";
import { yearsInRange, type Holiday, type HolidayResult } from "@/domain/holidays";
import { HEBCAL_DEFAULT_URL, fetchHebcalYear, type HebcalError } from "./hebcal-client";

// Holidays are public, the same for every user, and change rarely: cached per Gregorian year
// (ARCHITECTURE §8.2). The request parameters are fixed in domain/holidays.ts, so the year (and
// the source URL) is the whole cache key. After `revalidate` the cached year is served while it
// refreshes in the background; a failed refresh keeps the previous data until `expire`.
// Failures throw, so an empty result is never cached.

/** Overridable for tests (a local stand-in server); production uses the official endpoint. */
function hebcalUrl(): string {
  return process.env.HEBCAL_API_URL || HEBCAL_DEFAULT_URL;
}

let rateLimitedUntil = 0;

async function holidayYear(year: number, baseUrl: string): Promise<Holiday[]> {
  "use cache";
  cacheLife({ stale: 60 * 60, revalidate: 7 * 24 * 60 * 60, expire: 60 * 24 * 60 * 60 });
  cacheTag("holidays");
  return fetchHebcalYear(year, { baseUrl });
}

/** Holidays in [from, to]. Never throws: a Hebcal failure only sets `unavailable`. */
export async function getHolidays(from: DateOnly, to: DateOnly): Promise<HolidayResult> {
  // Honor a 429's Retry-After instead of asking again on every render.
  if (Date.now() < rateLimitedUntil) return { holidays: [], unavailable: true };
  const baseUrl = hebcalUrl();
  const results = await Promise.allSettled(yearsInRange(from, to).map((year) => holidayYear(year, baseUrl)));
  const holidays: Holiday[] = [];
  let unavailable = false;
  for (const result of results) {
    if (result.status === "fulfilled") {
      holidays.push(...result.value.filter((holiday) => isWithin(holiday.date, from, to)));
      continue;
    }
    unavailable = true;
    // Read the fields, not the class: the error may cross the cache boundary as a plain object.
    const { reason, retryAt } = (result.reason ?? {}) as Partial<Pick<HebcalError, "reason" | "retryAt">>;
    if (reason === "rate_limited" && typeof retryAt === "number") {
      rateLimitedUntil = Math.max(rateLimitedUntil, retryAt);
    }
    console.error("Holidays unavailable", reason ?? "unknown");
  }
  return { holidays, unavailable };
}
