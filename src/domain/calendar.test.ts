import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildCalendarDays,
  calendarHref,
  layoutWeek,
  monthGrid,
  parseDayParam,
  parseMonthParam,
  shiftMonthKeepingDay,
  type CalendarItem,
  type CalendarTask,
} from "./calendar";
import type { CalendarEvent } from "./events";
import { groupHolidaysByDate } from "./holidays";

const today = "2026-11-02";

const task = (overrides: Partial<CalendarTask> = {}): CalendarTask => ({
  id: "t1",
  title: "BI Dashboard deadline",
  status: "todo",
  deadline: "2026-11-10",
  scheduledAt: null,
  ...overrides,
});

describe("month and visible range", () => {
  it("covers whole Sunday–Saturday weeks around the month", () => {
    const grid = monthGrid("2026-11");
    expect([grid.from, grid.to]).toEqual(["2026-11-01", "2026-12-05"]);
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks[0]![0]).toBe("2026-11-01"); // a Sunday
  });

  it("includes leading and trailing days from adjacent months", () => {
    const october = monthGrid("2026-10");
    expect([october.from, october.to]).toEqual(["2026-09-27", "2026-10-31"]);
    const february = monthGrid("2026-02"); // starts on a Sunday, 28 days
    expect([february.from, february.to, february.weeks.length]).toEqual(["2026-02-01", "2026-02-28", 4]);
    expect(monthGrid("2026-08").weeks).toHaveLength(6);
  });

  it("crosses the year boundary", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-11", 14)).toBe("2028-01");
    const january = monthGrid("2027-01");
    expect([january.from, january.to]).toEqual(["2026-12-27", "2027-02-06"]);
  });

  it("moves a month at a time, keeping the day when it exists (PageUp/PageDown)", () => {
    expect(shiftMonthKeepingDay("2026-11-15", 1)).toBe("2026-12-15");
    expect(shiftMonthKeepingDay("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonthKeepingDay("2028-01-31", 1)).toBe("2028-02-29");
    expect(shiftMonthKeepingDay("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("validates the URL params strictly, with sensible fallbacks", () => {
    expect(parseMonthParam("2027-01", today)).toBe("2027-01");
    for (const bad of [undefined, "", "2026-13", "2026-1", "26-11", "2026-11-01", "1800-01", "abc"]) {
      expect(parseMonthParam(bad, today)).toBe("2026-11");
    }
    const grid = monthGrid("2026-11");
    expect(parseDayParam("2026-11-20", grid, today)).toBe("2026-11-20");
    expect(parseDayParam("2026-12-05", grid, today)).toBe("2026-12-05"); // a visible trailing day
    expect(parseDayParam("2026-12-06", grid, today)).toBe(today);
    expect(parseDayParam("2026-11-31", grid, today)).toBe(today);
    expect(parseDayParam(undefined, monthGrid("2027-01"), today)).toBe("2027-01-01");
    expect(calendarHref("2026-11", "2026-11-20")).toBe("/calendar?month=2026-11&day=2026-11-20");
    expect(calendarHref("2026-11", undefined, true)).toBe("/calendar?month=2026-11&done=1");
  });
});

describe("buildCalendarDays", () => {
  const range = { from: "2026-11-01", to: "2026-12-05", today };
  const kinds = (items: CalendarItem[] | undefined) => (items ?? []).map((item) => item.kind);

  it("puts a deadline on its date-only day, with the overdue state from the domain", () => {
    const days = buildCalendarDays({ ...range, tasks: [task(), task({ id: "t2", deadline: "2026-11-01" })], events: [] });
    expect(days.get("2026-11-10")).toMatchObject([{ kind: "deadline", taskId: "t1", overdue: false }]);
    expect(days.get("2026-11-01")).toMatchObject([{ kind: "deadline", taskId: "t2", overdue: true }]);
    const done = buildCalendarDays({ ...range, tasks: [task({ deadline: "2026-11-01", status: "done" })], events: [] });
    expect(done.get("2026-11-01")).toMatchObject([{ overdue: false, status: "done" }]);
  });

  it("shows scheduled work at its Asia/Jerusalem day and time, separately from the deadline", () => {
    const both = task({ deadline: "2026-11-12", scheduledAt: "2026-11-09T22:15:00.000Z" }); // 10 Nov 00:15 Jerusalem
    const days = buildCalendarDays({ ...range, tasks: [both], events: [] });
    expect(days.get("2026-11-10")).toMatchObject([{ kind: "scheduled", taskId: "t1", time: "00:15" }]);
    expect(days.get("2026-11-12")).toMatchObject([{ kind: "deadline", taskId: "t1" }]);
    expect(days.get("2026-11-09")).toBeUndefined();
  });

  it("uses summer time for a scheduled slot in July", () => {
    const july = buildCalendarDays({
      from: "2026-06-28",
      to: "2026-08-01",
      today,
      tasks: [task({ deadline: "2026-07-20", scheduledAt: "2026-07-14T05:30:00.000Z" })],
      events: [],
    });
    expect(july.get("2026-07-14")).toMatchObject([{ kind: "scheduled", time: "08:30" }]);
  });

  it("orders a day: all-day events → deadlines → timed items by time", () => {
    const events: CalendarEvent[] = [
      { id: "late", title: "ב", notes: null, recurrence: "none", allDay: false, startsAt: "2026-11-10T16:00:00.000Z", endsAt: "2026-11-10T17:00:00.000Z" },
      { id: "all", title: "חופשה New York", notes: null, recurrence: "none", allDay: true, startDate: "2026-11-09", endDate: "2026-11-11" },
    ];
    const days = buildCalendarDays({
      ...range,
      tasks: [task(), task({ id: "t2", title: "x", deadline: "2026-11-30", scheduledAt: "2026-11-10T07:00:00.000Z" })],
      events,
    });
    expect(kinds(days.get("2026-11-10"))).toEqual(["event", "deadline", "scheduled", "event"]);
    const timed = days.get("2026-11-10")!.at(-1);
    expect(timed).toMatchObject({ kind: "event", eventId: "late", startTime: "18:00", endTime: "19:00" });
    expect(days.get("2026-11-11")).toMatchObject([{ kind: "event", eventId: "all", dayIndex: 3, dayCount: 3 }]);
  });

  it("places planning markers on their date-only day, after all-day events and before deadlines", () => {
    const days = buildCalendarDays({
      ...range,
      tasks: [task({ deadline: "2026-11-20" })],
      events: [{ id: "trip", title: "חופשה", notes: null, recurrence: "none", allDay: true, startDate: "2026-11-20", endDate: "2026-11-20" }],
      planningItems: [
        { id: "m1", title: "Project Q4 milestone", date: "2026-11-20" },
        { id: "m2", title: "מחוץ לטווח", date: "2026-12-06" },
      ],
    });
    expect(kinds(days.get("2026-11-20"))).toEqual(["event", "planning", "deadline"]);
    expect(days.get("2026-11-20")![1]).toEqual({ kind: "planning", key: "p:m1", itemId: "m1", title: "Project Q4 milestone" });
    expect(days.has("2026-12-06")).toBe(false);
  });

  it("drops anything outside the visible range and keeps one entry per item and day", () => {
    const days = buildCalendarDays({
      ...range,
      tasks: [task({ deadline: "2026-12-06" })],
      events: [{ id: "y", title: "יום הולדת", notes: null, recurrence: "yearly", allDay: true, startDate: "2020-11-30", endDate: "2020-11-30" }],
    });
    expect([...days.keys()]).toEqual(["2026-11-30"]);
    // A yearly occurrence keeps the stored first date, so editing it never moves the series.
    expect(days.get("2026-11-30")).toMatchObject([{ kind: "event", yearly: true, startDate: "2020-11-30" }]);
  });
});

describe("layoutWeek: multi-day events as continuous spans", () => {
  const allDayEvent = (id: string, startDate: string, endDate: string): CalendarEvent => ({
    id,
    title: `אירוע ${id}`,
    notes: null,
    recurrence: "none",
    allDay: true,
    startDate,
    endDate,
  });
  /** The November 2026 grid with these events, laid out week by week. */
  function layout(events: CalendarEvent[], tasks: CalendarTask[] = [], month = "2026-11") {
    const grid = monthGrid(month);
    const days = Object.fromEntries(buildCalendarDays({ from: grid.from, to: grid.to, today, tasks, events }));
    return grid.weeks.map((week) => ({ week, ...layoutWeek(week, days) }));
  }
  const spanRows = (weeks: ReturnType<typeof layout>) =>
    weeks.flatMap(({ week, spans }) =>
      spans.map((span) => [week[span.startColumn], week[span.endColumn], span.lane, span.continuesBefore, span.continuesAfter]),
    );

  it("draws a 2-day event as one segment, in lane 0", () => {
    const weeks = layout([allDayEvent("a", "2026-11-03", "2026-11-04")]); // Tue–Wed
    expect(spanRows(weeks)).toEqual([["2026-11-03", "2026-11-04", 0, false, false]]);
    expect(weeks[0]!.laneCount).toBe(1);
    expect(weeks[1]!.laneCount).toBe(0);
  });

  it("draws a full Sunday–Saturday week as one segment", () => {
    expect(spanRows(layout([allDayEvent("a", "2026-11-08", "2026-11-14")]))).toEqual([["2026-11-08", "2026-11-14", 0, false, false]]);
  });

  it("splits an event crossing a week boundary into one segment per week", () => {
    // Thu 5 Nov – Tue 10 Nov.
    expect(spanRows(layout([allDayEvent("a", "2026-11-05", "2026-11-10")]))).toEqual([
      ["2026-11-05", "2026-11-07", 0, false, true],
      ["2026-11-08", "2026-11-10", 0, true, false],
    ]);
  });

  it("continues across a month boundary inside the visible grid", () => {
    // November's grid runs to Sat 5 Dec.
    expect(spanRows(layout([allDayEvent("a", "2026-11-28", "2026-12-03")]))).toEqual([
      ["2026-11-28", "2026-11-28", 0, false, true],
      ["2026-11-29", "2026-12-03", 0, true, false],
    ]);
  });

  it("marks events that begin before or end after the visible grid as continuing", () => {
    // November's grid starts on Sun 1 Nov and ends on Sat 5 Dec.
    expect(spanRows(layout([allDayEvent("a", "2026-10-28", "2026-11-02"), allDayEvent("b", "2026-12-04", "2026-12-09")]))).toEqual([
      ["2026-11-01", "2026-11-02", 0, true, false],
      ["2026-12-04", "2026-12-05", 0, false, true],
    ]);
  });

  it("stacks overlapping spans in lanes, reusing a lane once it's free", () => {
    const weeks = layout([
      allDayEvent("long", "2026-11-08", "2026-11-12"),
      allDayEvent("overlap", "2026-11-10", "2026-11-11"),
      allDayEvent("after", "2026-11-13", "2026-11-14"),
    ]);
    expect(spanRows(weeks)).toEqual([
      ["2026-11-08", "2026-11-12", 0, false, false],
      ["2026-11-10", "2026-11-11", 1, false, false],
      ["2026-11-13", "2026-11-14", 0, false, false],
    ]);
    expect(weeks[1]!.laneCount).toBe(2);
  });

  it("counts each item once per day: spans take lane rows, singles fill the rest, the remainder is hidden", () => {
    const tasks = Array.from({ length: 4 }, (_, index) => task({ id: `t${index}`, title: `משימה ${index}`, deadline: "2026-11-10" }));
    const weeks = layout([allDayEvent("trip", "2026-11-09", "2026-11-11")], tasks);
    const cell = weeks[1]!.cells["2026-11-10"]!;
    // 1 lane + 2 chips of 3 rows; 2 deadlines hidden. The span is not a chip and not hidden.
    expect(cell.chips.map((item) => item.kind)).toEqual(["deadline", "deadline"]);
    expect(cell.hidden).toBe(2);
    // A neighbouring day the span covers counts nothing extra.
    expect(weeks[1]!.cells["2026-11-11"]).toEqual({ chips: [], hidden: 0 });
  });

  it("counts spans beyond the lane limit as hidden on every day they cover", () => {
    const weeks = layout([
      allDayEvent("a", "2026-11-08", "2026-11-10"),
      allDayEvent("b", "2026-11-08", "2026-11-10"),
      allDayEvent("c", "2026-11-09", "2026-11-10"),
    ]);
    const week = weeks[1]!;
    expect(week.spans).toHaveLength(2);
    expect(week.cells["2026-11-08"]!.hidden).toBe(0);
    expect(week.cells["2026-11-09"]!.hidden).toBe(1);
    expect(week.cells["2026-11-10"]!.hidden).toBe(1);
  });

  it("keeps single-day and timed events as chips, never spans", () => {
    const weeks = layout([
      allDayEvent("one", "2026-11-10", "2026-11-10"),
      { id: "night", title: "x", notes: null, recurrence: "none", allDay: false, startsAt: "2026-11-10T20:00:00.000Z", endsAt: "2026-11-11T06:00:00.000Z" },
    ]);
    expect(weeks.flatMap((week) => week.spans)).toEqual([]);
    expect(weeks[1]!.cells["2026-11-10"]!.chips).toHaveLength(2);
  });
});

describe("holidays by date", () => {
  it("groups holidays per day, keeping two on the same day", () => {
    const grouped = groupHolidaysByDate([
      { date: "2026-12-10", name: "חג הבנות", kind: "holiday" },
      { date: "2026-12-10", name: "חנוכה: ז׳ נרות", kind: "holiday" },
      { date: "2026-12-11", name: "חנוכה: ח׳ נרות", kind: "holiday" },
    ]);
    expect(grouped.get("2026-12-10")?.map((holiday) => holiday.name)).toEqual(["חג הבנות", "חנוכה: ז׳ נרות"]);
    expect(grouped.get("2026-12-12")).toBeUndefined();
  });
});
