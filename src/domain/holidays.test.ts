import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/hebcal-2026.json";
import { hebcalYearParams, normalizeHebcalItems, yearsInRange, type HebcalItem } from "./holidays";

const israel = normalizeHebcalItems(fixture.israel.items as HebcalItem[]);
const on = (date: string) => israel.filter((holiday) => holiday.date === date);

describe("request parameters", () => {
  it("asks explicitly for the Israel schedule, Hebrew without nikud and the approved categories", () => {
    const params = Object.fromEntries(hebcalYearParams(2026));
    expect(params).toEqual({
      v: "1",
      cfg: "json",
      year: "2026",
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
  });

  it("rejects an unreasonable year", () => {
    expect(() => hebcalYearParams(1800)).toThrow(RangeError);
    expect(() => hebcalYearParams(2026.5)).toThrow(RangeError);
  });

  it("covers every year a range touches (one request each)", () => {
    expect(yearsInRange("2026-11-29", "2027-01-02")).toEqual([2026, 2027]);
    expect(yearsInRange("2026-03-01", "2026-04-04")).toEqual([2026]);
  });
});

describe("normalization of a recorded Israel response", () => {
  it("keeps Hebrew titles and date-only days", () => {
    expect(on("2026-04-02")).toEqual([{ date: "2026-04-02", name: "פסח א׳", kind: "holiday" }]);
    expect(israel.every((holiday) => /^\d{4}-\d{2}-\d{2}$/.test(holiday.date))).toBe(true);
  });

  it("marks holiday eves", () => {
    expect(on("2026-09-11")).toEqual([{ date: "2026-09-11", name: "ערב ראש השנה", kind: "erev" }]);
    expect(on("2026-04-01")[0]).toMatchObject({ kind: "erev", name: "ערב פסח" });
  });

  it("marks modern Israeli observances", () => {
    expect(on("2026-04-22")).toEqual([{ date: "2026-04-22", name: "יום העצמאות", kind: "observance" }]);
    expect(on("2026-04-21")[0]).toMatchObject({ kind: "observance", name: "יום הזכרון" });
  });

  it("follows the Israel schedule: one-day Shavuot, seven-day Pesach, Simchat Torah on Shmini Atzeret", () => {
    const diaspora = normalizeHebcalItems(fixture.diaspora.items as HebcalItem[]);
    // The Diaspora has an eighth day of Pesach, a second day of Shavuot and a separate Simchat Torah.
    expect(diaspora.some((holiday) => holiday.date === "2026-04-09")).toBe(true);
    expect(diaspora.some((holiday) => holiday.date === "2026-05-23")).toBe(true);
    expect(diaspora.some((holiday) => holiday.date === "2026-10-04")).toBe(true);
    expect(on("2026-04-09")).toEqual([]);
    expect(on("2026-05-23")).toEqual([]);
    expect(on("2026-10-04")).toEqual([]);
    expect(on("2026-05-22")).toEqual([{ date: "2026-05-22", name: "שבועות", kind: "holiday" }]);
  });

  it("keeps two holidays on the same day", () => {
    expect(on("2026-12-10").map((holiday) => holiday.name).sort()).toEqual(["חג הבנות", "חנוכה: ז׳ נרות"].sort());
  });

  it("drops every non-allow-listed category, even when Hebcal sends it", () => {
    const excluded = fixture.excluded as HebcalItem[];
    expect(new Set(excluded.map((item) => item.category))).toEqual(
      new Set(["zmanim", "holiday", "candles", "havdalah", "omer", "parashat", "mevarchim", "roshchodesh"]),
    );
    expect(normalizeHebcalItems(excluded)).toEqual([]);
    expect(normalizeHebcalItems([...fixture.israel.items, ...excluded] as HebcalItem[])).toEqual(israel);
  });

  it("drops duplicates, malformed dates and empty titles, and sorts by date", () => {
    const items: HebcalItem[] = [
      { date: "2026-09-21", title: "יום כיפור", category: "holiday", subcat: "major" },
      { date: "2026-09-21", title: "יום כיפור", category: "holiday", subcat: "major" },
      { date: "2026-02-30", title: "x", category: "holiday", subcat: "major" },
      { date: "2026-03-01", title: "  ", category: "holiday", subcat: "major" },
      { date: "2026-09-20T18:00:00+03:00", title: "ערב יום כיפור", category: "holiday", subcat: "major", title_orig: "Erev Yom Kippur" },
      { date: "2026-09-22", title: "ללא תת־קטגוריה", category: "holiday" },
    ];
    expect(normalizeHebcalItems(items)).toEqual([
      { date: "2026-09-20", name: "ערב יום כיפור", kind: "erev" },
      { date: "2026-09-21", name: "יום כיפור", kind: "holiday" },
    ]);
    expect(normalizeHebcalItems([])).toEqual([]);
  });
});
