// Hebcal REST client (ARCHITECTURE §8.2): server-side fetch, response validation and mapping.
// No Next.js APIs here, so it can be tested with a fake fetch; `holidays.ts` adds caching.
// Only `server/data/holidays.ts` imports this module.

import { z } from "zod";
import { hebcalYearParams, normalizeHebcalItems, type Holiday } from "@/domain/holidays";

export const HEBCAL_DEFAULT_URL = "https://www.hebcal.com/hebcal";
const TIMEOUT_MS = 4000;

/** Validates the fields we read; anything else in the response is ignored. */
const responseSchema = z.object({
  items: z.array(
    z.object({
      date: z.string(),
      title: z.string(),
      category: z.string(),
      subcat: z.string().optional(),
      title_orig: z.string().optional(),
    }),
  ),
});

export type HebcalFailure = "rate_limited" | "http" | "invalid" | "network";

export class HebcalError extends Error {
  constructor(
    readonly reason: HebcalFailure,
    /** For "rate_limited": when to try again (epoch ms). */
    readonly retryAt?: number,
  ) {
    super(`Hebcal request failed: ${reason}`);
    this.name = "HebcalError";
  }
}

/** Retry-After as seconds or an HTTP date; defaults to one minute. */
export function retryAtFrom(header: string | null, now: number): number {
  const seconds = header !== null && /^\d+$/.test(header.trim()) ? Number(header) : NaN;
  if (Number.isFinite(seconds)) return now + seconds * 1000;
  const date = header ? Date.parse(header) : NaN;
  return Number.isFinite(date) ? date : now + 60_000;
}

/** Parses a Hebcal JSON body into holidays, or throws HebcalError("invalid"). */
export function parseHebcalResponse(body: unknown): Holiday[] {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new HebcalError("invalid");
  return normalizeHebcalItems(parsed.data.items);
}

/**
 * One year of Israeli holidays. Throws HebcalError on a non-2xx status (429 carries Retry-After),
 * an unexpected body, a timeout or a network failure. Never retries by itself.
 */
export async function fetchHebcalYear(
  year: number,
  options: { baseUrl?: string; fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<Holiday[]> {
  const { baseUrl = HEBCAL_DEFAULT_URL, fetchImpl = fetch, now = Date.now } = options;
  const url = `${baseUrl}?${hebcalYearParams(year).toString()}`;
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  } catch {
    throw new HebcalError("network");
  }
  if (response.status === 429) throw new HebcalError("rate_limited", retryAtFrom(response.headers.get("retry-after"), now()));
  if (!response.ok) throw new HebcalError("http");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new HebcalError("invalid");
  }
  return parseHebcalResponse(body);
}
