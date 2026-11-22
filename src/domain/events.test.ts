import { describe, expect, it } from "vitest";
import { expandEvents, parseEventForm, yearlyDateIn, type AllDayEvent, type CalendarEvent, type EventFormValues, type TimedEvent } from "./events";

const form = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
  title: "פגישת Review API",
  notes: "",
  allDay: true,
  startDate: "2026-11-10",
  endDate: "2026-11-10",
  startTime: "",
  endTime: "",
  yearly: false,
  ...overrides,
});

const allDay = (overrides: Partial<AllDayEvent> = {}): AllDayEvent => ({
  id: "e1",
  title: "חופשה New York",
  notes: null,
  recurrence: "none",
  allDay: true,
  startDate: "2026-11-10",
  endDate: "2026-11-10",
  ...overrides,
});

const timed = (overrides: Partial<TimedEvent> = {}): TimedEvent => ({
  id: "t1",
  title: "פגישה",
  notes: null,
  recurrence: "none",
  allDay: false,
  startsAt: "2026-11-10T07:00:00.000Z",
  endsAt: "2026-11-10T08:00:00.000Z",
  ...overrides,
});

const dates = (events: CalendarEvent[], from: string, to: string) => expandEvents(events, from, to).map((day) => day.date);

describe("parseEventForm", () => {
  it("accepts an all-day range and trims text", () => {
    expect(parseEventForm(form({ title: "  חופשה  ", endDate: "2026-11-14", notes: " טיסה " }))).toEqual({
      ok: true,
      input: { allDay: true, title: "חופשה", notes: "טיסה", startDate: "2026-11-10", endDate: "2026-11-14", recurrence: "none" },
    });
  });

  it("converts a timed event from Asia/Jerusalem wall-clock to instants, across DST", () => {
    // Winter (UTC+2) and summer (UTC+3).
    expect(parseEventForm(form({ allDay: false, startTime: "09:00", endTime: "10:30" }))).toMatchObject({
      ok: true,
      input: { allDay: false, startsAt: "2026-11-10T07:00:00.000Z", endsAt: "2026-11-10T08:30:00.000Z" },
    });
    expect(parseEventForm(form({ allDay: false, startDate: "2026-07-14", endDate: "2026-07-14", startTime: "09:00", endTime: "10:00" }))).toMatchObject({
      input: { startsAt: "2026-07-14T06:00:00.000Z", endsAt: "2026-07-14T07:00:00.000Z" },
    });
    // The night DST ends (25 Oct 2026): 01:30 happens in the second (UTC+2) hour only after 02:00 → 01:00.
    expect(parseEventForm(form({ allDay: false, startDate: "2026-10-25", endDate: "2026-10-25", startTime: "00:30", endTime: "03:00" }))).toMatchObject({
      input: { startsAt: "2026-10-24T21:30:00.000Z", endsAt: "2026-10-25T01:00:00.000Z" },
    });
  });

  it("validates required fields, ordering and the yearly rule", () => {
    expect(parseEventForm(form({ title: " ", startDate: "", endDate: "2026-02-30" }))).toEqual({
      ok: false,
      errors: { title: "יש להזין כותרת.", startDate: "יש לבחור תאריך התחלה.", endDate: "יש לבחור תאריך סיום." },
    });
    expect(parseEventForm(form({ endDate: "2026-11-09" }))).toMatchObject({
      ok: false,
      errors: { endDate: "תאריך הסיום לא יכול להיות לפני תאריך ההתחלה." },
    });
    expect(parseEventForm(form({ allDay: false, startTime: "9:00", endTime: "25:00" }))).toMatchObject({
      ok: false,
      errors: { startTime: "יש להזין שעת התחלה בפורמט HH:MM.", endTime: "יש להזין שעת סיום בפורמט HH:MM." },
    });
    expect(parseEventForm(form({ allDay: false, startTime: "10:00", endTime: "09:00" }))).toEqual({
      ok: false,
      errors: { endTime: "שעת הסיום לא יכולה להיות לפני שעת ההתחלה." },
    });
    expect(parseEventForm(form({ yearly: true, endDate: "2026-11-11" }))).toMatchObject({
      ok: false,
      errors: { yearly: "אירוע שחוזר מדי שנה הוא אירוע של יום אחד." },
    });
    expect(parseEventForm(form({ yearly: true, allDay: false, startTime: "09:00", endTime: "10:00" }))).toMatchObject({
      ok: false,
      errors: { yearly: "רק אירוע של יום שלם יכול לחזור מדי שנה." },
    });
    expect(parseEventForm(form({ yearly: true }))).toMatchObject({ ok: true, input: { recurrence: "yearly" } });
  });
});

describe("expandEvents", () => {
  it("places a single all-day event on its date only", () => {
    expect(dates([allDay()], "2026-11-01", "2026-12-05")).toEqual(["2026-11-10"]);
    expect(dates([allDay()], "2026-12-01", "2026-12-31")).toEqual([]);
  });

  it("spans a multi-day range across a month boundary, clipped to the visible range", () => {
    const trip = allDay({ startDate: "2026-11-28", endDate: "2026-12-03" });
    expect(expandEvents([trip], "2026-11-01", "2026-11-30").map((d) => [d.date, d.dayIndex, d.dayCount])).toEqual([
      ["2026-11-28", 1, 6],
      ["2026-11-29", 2, 6],
      ["2026-11-30", 3, 6],
    ]);
    expect(dates([trip], "2026-11-29", "2027-01-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"]);
  });

  it("repeats a yearly event once per year in range, never before it starts", () => {
    const birthday = allDay({ startDate: "2025-03-14", endDate: "2025-03-14", recurrence: "yearly" });
    expect(dates([birthday], "2026-03-01", "2026-04-04")).toEqual(["2026-03-14"]);
    expect(dates([birthday], "2024-01-01", "2024-12-31")).toEqual([]);
    expect(dates([birthday], "2025-12-28", "2027-04-01")).toEqual(["2026-03-14", "2027-03-14"]);
  });

  it("is idempotent across overlapping or repeated requests (no duplicate occurrences)", () => {
    const birthday = allDay({ startDate: "2020-11-30", endDate: "2020-11-30", recurrence: "yearly" });
    // November's grid ends on 5 Dec and December's starts on 29 Nov: both show 30 Nov, once each.
    expect(dates([birthday], "2026-11-01", "2026-12-05")).toEqual(["2026-11-30"]);
    expect(dates([birthday], "2026-11-29", "2027-01-02")).toEqual(["2026-11-30"]);
    expect(expandEvents([birthday], "2026-11-01", "2026-12-05")).toEqual(expandEvents([birthday], "2026-11-01", "2026-12-05"));
  });

  it("shows a 29 February event on 28 February in non-leap years (MASTER_SPEC §10.2)", () => {
    expect(yearlyDateIn("2024-02-29", 2026)).toBe("2026-02-28");
    expect(yearlyDateIn("2024-02-29", 2028)).toBe("2028-02-29");
    expect(yearlyDateIn("2024-02-29", 2100)).toBe("2100-02-28");
    expect(yearlyDateIn("2024-02-29", 2000)).toBeNull();
    expect(dates([allDay({ startDate: "2024-02-29", endDate: "2024-02-29", recurrence: "yearly" })], "2027-02-01", "2027-03-06")).toEqual(["2027-02-28"]);
  });

  it("places timed events on their Asia/Jerusalem day, not the UTC day", () => {
    // 00:30 Jerusalem on 11 Nov is still 10 Nov in UTC.
    expect(dates([timed({ startsAt: "2026-11-10T22:30:00.000Z", endsAt: "2026-11-10T23:30:00.000Z" })], "2026-11-01", "2026-11-30")).toEqual(["2026-11-11"]);
    // 23:30 Jerusalem in summer (UTC+3) stays on its own day.
    expect(dates([timed({ startsAt: "2026-07-14T20:30:00.000Z", endsAt: "2026-07-14T20:45:00.000Z" })], "2026-07-01", "2026-07-31")).toEqual(["2026-07-14"]);
  });

  it("spreads an overnight timed event over both days, but not past an exact midnight end", () => {
    const overnight = timed({ startsAt: "2026-11-10T20:00:00.000Z", endsAt: "2026-11-11T06:00:00.000Z" }); // 22:00 → 08:00
    expect(dates([overnight], "2026-11-01", "2026-11-30")).toEqual(["2026-11-10", "2026-11-11"]);
    const untilMidnight = timed({ startsAt: "2026-11-10T20:00:00.000Z", endsAt: "2026-11-10T22:00:00.000Z" }); // 22:00 → 00:00
    expect(dates([untilMidnight], "2026-11-01", "2026-11-30")).toEqual(["2026-11-10"]);
  });
});
