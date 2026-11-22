import { describe, expect, it } from "vitest";
import {
  addDays,
  appInstantOf,
  appDateOf,
  dayOfWeek,
  diffDays,
  formatDateOnly,
  formatAppTime,
  formatDateLong,
  formatDayMonth,
  isDateOnly,
  relativeDaysText,
  todayInAppZone,
  weekOf,
} from "./dates";

describe("isDateOnly", () => {
  it.each(["2026-11-01", "2028-02-29", "2026-03-27"])("accepts %s", (value) => {
    expect(isDateOnly(value)).toBe(true);
  });
  it.each(["2026-02-29", "2026-13-01", "2026-11-1", "2026-11-01T00:00", ""])(
    "rejects %s",
    (value) => {
      expect(isDateOnly(value)).toBe(false);
    },
  );
});

describe("date-only arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("is DST-independent across both Israeli transitions", () => {
    expect(diffDays("2026-03-28", "2026-03-26")).toBe(2);
    expect(addDays("2026-03-26", 1)).toBe("2026-03-27");
    expect(addDays("2026-03-27", 1)).toBe("2026-03-28");
    expect(diffDays("2026-10-26", "2026-10-24")).toBe(2);
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("returns the weekday with Sunday = 0", () => {
    expect(dayOfWeek("2026-11-01")).toBe(0);
    expect(dayOfWeek("2026-10-31")).toBe(6);
    expect(dayOfWeek("1969-12-31")).toBe(3);
  });

  it("rejects malformed input", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("app timezone (Asia/Jerusalem)", () => {
  it("differs from the UTC date around midnight", () => {
    // 22:30 UTC on 1 Nov is 00:30 on 2 Nov in Jerusalem (UTC+2).
    expect(todayInAppZone(new Date("2026-11-01T22:30:00Z"))).toBe("2026-11-02");
    expect(todayInAppZone(new Date("2026-11-01T21:59:59Z"))).toBe("2026-11-01");
  });

  it("handles DST start (27 Mar 2026, UTC+2 → UTC+3)", () => {
    expect(appDateOf("2026-03-26T21:59:59Z")).toBe("2026-03-26");
    expect(appDateOf("2026-03-26T22:00:00Z")).toBe("2026-03-27");
    expect(appDateOf("2026-03-27T20:59:59Z")).toBe("2026-03-27");
    expect(appDateOf("2026-03-27T21:00:00Z")).toBe("2026-03-28");
  });

  it("handles DST end (25 Oct 2026, UTC+3 → UTC+2)", () => {
    expect(appDateOf("2026-10-24T20:59:59Z")).toBe("2026-10-24");
    expect(appDateOf("2026-10-24T21:00:00Z")).toBe("2026-10-25");
    expect(appDateOf("2026-10-25T21:59:59Z")).toBe("2026-10-25");
    expect(appDateOf("2026-10-25T22:00:00Z")).toBe("2026-10-26");
  });
});

describe("weekOf", () => {
  it("runs Sunday through Saturday", () => {
    expect(weekOf("2026-11-01")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
    expect(weekOf("2026-11-04")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
    expect(weekOf("2026-10-31")).toEqual({ start: "2026-10-25", end: "2026-10-31" });
  });
});

describe("formatting", () => {
  it("formats date-only values without timezone conversion", () => {
    expect(formatDateOnly("2026-03-27")).toBe("27.03.2026");
    expect(formatDayMonth("2026-11-08")).toBe("08.11");
  });

  it.each([
    [0, "היום"],
    [1, "מחר"],
    [2, "בעוד יומיים"],
    [5, "בעוד 5 ימים"],
    [-1, "באיחור של יום"],
    [-2, "באיחור של יומיים"],
    [-3, "באיחור של 3 ימים"],
  ])("relative text for %i days", (days, text) => {
    expect(relativeDaysText(days)).toBe(text);
  });
});

describe("long date", () => {
  it("formats the resolved deadline in Hebrew without shifting the day", () => {
    const text = formatDateLong("2026-11-08");
    expect(text).toContain("8");
    expect(text).toContain("בנובמבר");
    expect(text).toContain("2026");
    expect(text).toMatch(/יום א/);
    // DST start day stays the same calendar day.
    expect(formatDateLong("2026-03-27")).toContain("27");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDateLong("2026-02-30")).toThrow(RangeError);
  });
});

describe("scheduled time (Asia/Jerusalem wall clock ↔ instant)", () => {
  it.each([
    ["2026-01-15", "09:00", "2026-01-15T07:00:00.000Z"], // winter, UTC+2
    ["2026-07-15", "09:00", "2026-07-15T06:00:00.000Z"], // summer, UTC+3
    ["2026-03-27", "01:30", "2026-03-26T23:30:00.000Z"], // DST start day, before the jump
    ["2026-03-27", "03:30", "2026-03-27T00:30:00.000Z"], // DST start day, after the jump
    ["2026-10-25", "12:00", "2026-10-25T10:00:00.000Z"], // DST end day, after fall-back
    ["2026-11-01", "00:15", "2026-10-31T22:15:00.000Z"], // just after Jerusalem midnight
  ])("%s %s → %s", (date, time, iso) => {
    const instant = appInstantOf(date, time);
    expect(instant).toBe(iso);
    expect(appDateOf(instant)).toBe(date);
    expect(formatAppTime(instant)).toBe(time);
  });

  it("rejects malformed times", () => {
    expect(() => appInstantOf("2026-11-01", "24:00")).toThrow(RangeError);
    expect(() => appInstantOf("2026-11-01", "9:00")).toThrow(RangeError);
  });
});
