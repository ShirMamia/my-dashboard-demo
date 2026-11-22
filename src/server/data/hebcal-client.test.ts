import { describe, expect, it } from "vitest";
import fixture from "@/domain/__fixtures__/hebcal-2026.json";
import { HebcalError, fetchHebcalYear, parseHebcalResponse, retryAtFrom } from "./hebcal-client";

// The adapter boundary with a fake fetch: no network in tests.

function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return respond(String(input));
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

async function failure(promise: Promise<unknown>): Promise<HebcalError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HebcalError) return error;
    throw error;
  }
  throw new Error("expected a HebcalError");
}

describe("fetchHebcalYear", () => {
  it("requests one year with the Israel/Hebrew parameters and maps the response", async () => {
    const { impl, calls } = fakeFetch(() => json({ title: "Hebcal Israel 2026", items: [...fixture.israel.items, ...fixture.excluded] }));
    const holidays = await fetchHebcalYear(2026, { baseUrl: "https://example.test/hebcal", fetchImpl: impl });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!);
    expect(url.origin + url.pathname).toBe("https://example.test/hebcal");
    expect(url.searchParams.get("year")).toBe("2026");
    expect(url.searchParams.get("i")).toBe("on");
    expect(url.searchParams.get("lg")).toBe("he-x-NoNikud");
    // Only allow-listed items; the excluded categories are gone.
    expect(holidays).toHaveLength(fixture.israel.items.length);
    expect(holidays.find((holiday) => holiday.date === "2026-09-11")).toEqual({ date: "2026-09-11", name: "ערב ראש השנה", kind: "erev" });
  });

  it("returns an empty list for an empty year", async () => {
    const { impl } = fakeFetch(() => json({ items: [] }));
    await expect(fetchHebcalYear(2026, { fetchImpl: impl })).resolves.toEqual([]);
  });

  it("fails on a non-2xx status", async () => {
    const { impl } = fakeFetch(() => new Response("oops", { status: 503 }));
    expect((await failure(fetchHebcalYear(2026, { fetchImpl: impl }))).reason).toBe("http");
  });

  it("fails on 429 with the Retry-After time, without retrying", async () => {
    const { impl, calls } = fakeFetch(() => new Response("", { status: 429, headers: { "retry-after": "30" } }));
    const error = await failure(fetchHebcalYear(2026, { fetchImpl: impl, now: () => 1_000_000 }));
    expect(error).toMatchObject({ reason: "rate_limited", retryAt: 1_030_000 });
    expect(calls).toHaveLength(1);
  });

  it("fails on a network error or timeout", async () => {
    const { impl } = fakeFetch(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    expect((await failure(fetchHebcalYear(2026, { fetchImpl: impl }))).reason).toBe("network");
  });

  it("fails on a body that isn't JSON or doesn't match", async () => {
    const notJson = fakeFetch(() => new Response("<html>", { status: 200 }));
    expect((await failure(fetchHebcalYear(2026, { fetchImpl: notJson.impl }))).reason).toBe("invalid");
    const wrongShape = fakeFetch(() => json({ items: [{ date: 20260101, title: null }] }));
    expect((await failure(fetchHebcalYear(2026, { fetchImpl: wrongShape.impl }))).reason).toBe("invalid");
  });
});

describe("parsing", () => {
  it("rejects a response without items", () => {
    expect(() => parseHebcalResponse({ error: "bad" })).toThrow(HebcalError);
    expect(() => parseHebcalResponse(null)).toThrow(HebcalError);
  });

  it("ignores fields it doesn't read", () => {
    expect(
      parseHebcalResponse({
        items: [{ date: "2026-09-21", title: "יום כיפור", category: "holiday", subcat: "major", leyning: { torah: "…" }, memo: "…" }],
      }),
    ).toEqual([{ date: "2026-09-21", name: "יום כיפור", kind: "holiday" }]);
  });

  it("reads Retry-After as seconds or an HTTP date, defaulting to a minute", () => {
    expect(retryAtFrom("120", 0)).toBe(120_000);
    expect(retryAtFrom("Mon, 02 Nov 2026 20:00:00 GMT", 0)).toBe(Date.parse("2026-11-02T20:00:00Z"));
    expect(retryAtFrom(null, 5)).toBe(60_005);
    expect(retryAtFrom("soon", 5)).toBe(60_005);
  });
});
