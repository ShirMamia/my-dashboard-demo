import { describe, expect, it } from "vitest";
import {
  applyDensity,
  buildTimeline,
  hiddenDeadlineOnlyText,
  NO_PROJECT_NAME,
  parseTimelineParams,
  stepAnchor,
  timelineHref,
  timelineRange,
  timelineScale,
  timelineTitle,
  zoomAnchor,
  type TimelineEntry,
  type TimelinePlanningItem,
  type TimelineTask,
  type TimelineZoom,
} from "./timeline";

const today = "2026-11-03";

let sequence = 0;
const task = (overrides: Partial<TimelineTask> = {}): TimelineTask => ({
  id: `t${++sequence}`,
  title: `משימה ${sequence}`,
  status: "todo",
  startDate: null,
  deadline: "2026-11-10",
  projectId: null,
  ...overrides,
});
const milestone = (overrides: Partial<TimelinePlanningItem> = {}): TimelinePlanningItem => ({
  id: `p${++sequence}`,
  title: `אבן דרך ${sequence}`,
  date: "2026-11-20",
  projectId: null,
  ...overrides,
});

const projects = [
  { id: "proj-site", name: "אתר", archivedAt: null },
  { id: "proj-api", name: "Review API", archivedAt: null },
  { id: "proj-old", name: "ארכיון ישן", archivedAt: "2026-10-01T00:00:00Z" },
];

function build(zoom: TimelineZoom, anchor: string, tasks: TimelineTask[], options: Partial<{ showDone: boolean; showDeadlineOnly: boolean; planningItems: TimelinePlanningItem[] }> = {}) {
  return buildTimeline({
    range: timelineRange(zoom, anchor),
    today,
    tasks,
    planningItems: options.planningItems ?? [],
    projects,
    showDone: options.showDone ?? true,
    showDeadlineOnly: options.showDeadlineOnly ?? false,
  });
}

const only = (entries: TimelineEntry[]) => {
  expect(entries).toHaveLength(1);
  return entries[0]!;
};

describe("ranges per zoom (MASTER_SPEC §12)", () => {
  it("Week is Sunday–Saturday, across a month and a year", () => {
    expect(timelineRange("week", "2026-11-03")).toEqual({ zoom: "week", from: "2026-11-01", to: "2026-11-07", days: 7 });
    expect(timelineRange("week", "2027-01-01")).toEqual({ zoom: "week", from: "2026-12-27", to: "2027-01-02", days: 7 });
  });

  it("Month is the calendar month, including leap February", () => {
    expect(timelineRange("month", "2026-11-17")).toMatchObject({ from: "2026-11-01", to: "2026-11-30", days: 30 });
    expect(timelineRange("month", "2028-02-10")).toMatchObject({ from: "2028-02-01", to: "2028-02-29", days: 29 });
    expect(timelineRange("month", "2027-02-10")).toMatchObject({ days: 28 });
  });

  it("Quarter is the calendar quarter; Year the calendar year (366 days in a leap year)", () => {
    expect(timelineRange("quarter", "2026-11-03")).toMatchObject({ from: "2026-10-01", to: "2026-12-31", days: 92 });
    expect(timelineRange("quarter", "2028-01-31")).toMatchObject({ from: "2028-01-01", to: "2028-03-31", days: 91 });
    expect(timelineRange("year", "2026-11-03")).toMatchObject({ from: "2026-01-01", to: "2026-12-31", days: 365 });
    expect(timelineRange("year", "2028-06-01")).toMatchObject({ days: 366 });
  });

  it("titles", () => {
    expect(timelineTitle(timelineRange("week", today))).toBe("01.11.2026 – 07.11.2026");
    expect(timelineTitle(timelineRange("month", today))).toBe("נובמבר 2026");
    expect(timelineTitle(timelineRange("quarter", today))).toBe("רבעון 4 · 2026");
    expect(timelineTitle(timelineRange("year", today))).toBe("2026");
  });
});

describe("navigation", () => {
  it("steps one range earlier or later, across month, quarter and year boundaries", () => {
    const step = (zoom: TimelineZoom, anchor: string, direction: -1 | 1) =>
      timelineRange(zoom, stepAnchor(timelineRange(zoom, anchor), direction)).from;
    expect(step("week", "2026-12-30", 1)).toBe("2027-01-03");
    expect(step("week", "2026-11-03", -1)).toBe("2026-10-25");
    expect(step("month", "2026-12-15", 1)).toBe("2027-01-01");
    expect(step("month", "2026-01-31", -1)).toBe("2025-12-01");
    expect(step("quarter", "2026-11-03", 1)).toBe("2027-01-01");
    expect(step("quarter", "2026-02-03", -1)).toBe("2025-10-01");
    expect(step("year", "2026-11-03", 1)).toBe("2027-01-01");
    expect(step("year", "2026-11-03", -1)).toBe("2025-01-01");
  });

  it("switching zoom keeps today when visible, otherwise the range start", () => {
    expect(zoomAnchor(timelineRange("year", today), today)).toBe(today);
    expect(zoomAnchor(timelineRange("month", "2027-03-15"), today)).toBe("2027-03-01");
  });

  it("URL state round-trips; defaults are omitted; invalid values fall back", () => {
    const params = { zoom: "quarter", date: "2027-02-01", deadlines: "1", done: "0", view: "list" };
    const parsed = parseTimelineParams(params, today);
    expect(parsed).toEqual({ zoom: "quarter", anchor: "2027-02-01", showDeadlineOnly: true, showDone: false, list: true });
    expect(timelineHref(parsed)).toBe("/timeline?zoom=quarter&date=2027-02-01&deadlines=1&done=0&view=list");
    expect(parseTimelineParams({ zoom: "decade", date: "2026-02-30" }, today)).toEqual({
      zoom: "month",
      anchor: today,
      showDeadlineOnly: false,
      showDone: true,
      list: false,
    });
    expect(timelineHref({ zoom: "month", showDeadlineOnly: false, showDone: true, list: false })).toBe("/timeline");
  });
});

describe("scale", () => {
  it("Week: weekdays below, the month(s) above", () => {
    const scale = timelineScale(timelineRange("week", "2026-12-30"));
    expect(scale.minor.map((segment) => segment.label)).toEqual(["א׳ 27", "ב׳ 28", "ג׳ 29", "ד׳ 30", "ה׳ 31", "ו׳ 1", "ש׳ 2"]);
    expect(scale.major.map(({ label, start, length }) => [label, start, length])).toEqual([
      ["דצמבר 2026", 0, 5],
      ["ינואר 2027", 5, 2],
    ]);
  });

  it("Quarter: months above, Sunday weeks below (partial at both ends), covering every day once", () => {
    const range = timelineRange("quarter", today);
    const scale = timelineScale(range);
    expect(scale.major.map(({ label, length }) => [label, length])).toEqual([
      ["אוקטובר", 31],
      ["נובמבר", 30],
      ["דצמבר", 31],
    ]);
    // 2026-10-01 is a Thursday: the first week segment runs to Saturday 3.10.
    expect(scale.minor[0]).toMatchObject({ label: "01.10", start: 0, length: 3 });
    expect(scale.minor[1]).toMatchObject({ label: "04.10", start: 3, length: 7 });
    expect(scale.minor.at(-1)).toMatchObject({ label: "27.12", length: 5 });
    expect(scale.minor.reduce((sum, segment) => sum + segment.length, 0)).toBe(range.days);
  });

  it("Year: quarters above, months below; leap February has 29 days", () => {
    const scale = timelineScale(timelineRange("year", "2028-05-05"));
    expect(scale.major.map((segment) => segment.label)).toEqual(["רבעון 1", "רבעון 2", "רבעון 3", "רבעון 4"]);
    expect(scale.minor).toHaveLength(12);
    expect(scale.minor[1]).toMatchObject({ label: "פברואר", start: 31, length: 29 });
    expect(scale.minor[11]).toMatchObject({ label: "דצמבר", start: 335, length: 31 });
  });
});

describe("positions (date-only day offsets)", () => {
  it("a span starts on its start date and ends after its deadline (inclusive)", () => {
    const entry = only(build("month", today, [task({ startDate: "2026-11-05", deadline: "2026-11-12" })]).groups[0]!.entries);
    expect(entry).toMatchObject({ kind: "span", start: 4, end: 12, clippedStart: false, clippedEnd: false });
  });

  it("a span is clipped at the start and at the end of the range", () => {
    const early = only(build("month", today, [task({ startDate: "2026-10-20", deadline: "2026-11-03" })]).groups[0]!.entries);
    expect(early).toMatchObject({ start: 0, end: 3, clippedStart: true, clippedEnd: false });
    const late = only(build("month", today, [task({ startDate: "2026-11-28", deadline: "2026-12-04" })]).groups[0]!.entries);
    expect(late).toMatchObject({ start: 27, end: 30, clippedStart: false, clippedEnd: true });
    const both = only(build("week", today, [task({ startDate: "2026-10-01", deadline: "2027-01-31" })]).groups[0]!.entries);
    expect(both).toMatchObject({ start: 0, end: 7, clippedStart: true, clippedEnd: true });
  });

  it("a one-day span, a deadline marker and a milestone sit on their day", () => {
    const model = build("month", today, [task({ startDate: "2026-11-30", deadline: "2026-11-30" }), task({ deadline: "2026-11-01" })], {
      planningItems: [milestone({ date: "2026-11-15" })],
    });
    const entries = model.groups[0]!.entries;
    expect(entries.find((entry) => entry.kind === "span")).toMatchObject({ start: 29, end: 30 });
    expect(entries.find((entry) => entry.kind === "deadline")).toMatchObject({ at: 0 });
    expect(entries.find((entry) => entry.kind === "milestone")).toMatchObject({ at: 14 });
  });

  it("across a year boundary and leap day", () => {
    const year = only(build("year", "2028-03-01", [task({ deadline: "2028-12-31" })], { showDeadlineOnly: true }).groups[0]!.entries);
    expect(year).toMatchObject({ kind: "deadline", at: 365 });
    const leap = only(build("quarter", "2028-02-01", [task({ startDate: "2028-02-28", deadline: "2028-03-01" })]).groups[0]!.entries);
    expect(leap).toMatchObject({ start: 58, end: 61 });
    const crossing = only(build("week", "2026-12-30", [task({ deadline: "2027-01-01" })]).groups[0]!.entries);
    expect(crossing).toMatchObject({ kind: "deadline", at: 5 });
  });

  it("today's offset, or null when outside the range", () => {
    expect(build("month", today, []).today).toBe(2);
    expect(build("year", today, []).today).toBe(306);
    expect(build("month", "2026-12-01", []).today).toBeNull();
  });

  it("items outside the range are excluded", () => {
    const model = build("month", today, [task({ deadline: "2026-10-31" }), task({ startDate: "2026-12-01", deadline: "2026-12-02" })], {
      planningItems: [milestone({ date: "2026-12-01" })],
    });
    expect(model.groups).toEqual([]);
  });
});

describe("density by zoom (MASTER_SPEC §12)", () => {
  const tasks = () => [
    task({ startDate: "2026-11-02", deadline: "2026-11-09" }),
    task({ deadline: "2026-11-10" }),
    task({ deadline: "2026-12-10" }),
  ];

  it("Week and Month show deadline-only tasks", () => {
    expect(applyDensity(tasks(), "week", false).hidden).toBe(0);
    expect(build("month", today, tasks()).groups[0]!.entries.map((entry) => entry.kind)).toEqual(["span", "deadline"]);
    expect(build("month", today, tasks()).densityFilter).toBe(false);
  });

  it("Quarter and Year hide them by default and count them", () => {
    for (const zoom of ["quarter", "year"] as const) {
      const model = build(zoom, today, tasks());
      expect(model.densityFilter).toBe(true);
      expect(model.groups[0]!.entries.map((entry) => entry.kind)).toEqual(["span"]);
      expect(model.hiddenDeadlineOnly).toBe(2);
    }
  });

  it("the toggle shows them; nothing is hidden", () => {
    const model = build("year", today, tasks(), { showDeadlineOnly: true });
    expect(model.groups[0]!.entries).toHaveLength(3);
    expect(model.hiddenDeadlineOnly).toBe(0);
  });

  it("the count is only what this view hides (not hidden Done tasks, not other ranges)", () => {
    const model = build("quarter", today, [...tasks(), task({ deadline: "2026-11-11", status: "done" }), task({ deadline: "2027-02-01" })], {
      showDone: false,
    });
    expect(model.hiddenDeadlineOnly).toBe(2);
  });

  it("hidden count text", () => {
    expect(hiddenDeadlineOnlyText(1)).toBe("משימה אחת עם מועד בלבד מוסתרת");
    expect(hiddenDeadlineOnlyText(12)).toBe("12 משימות עם מועד בלבד מוסתרות");
  });
});

describe("Done tasks", () => {
  it("are shown (muted in the view) by default and excluded when hidden", () => {
    const done = task({ startDate: "2026-11-02", deadline: "2026-11-05", status: "done" });
    expect(only(build("month", today, [done]).groups[0]!.entries)).toMatchObject({ status: "done", overdue: false });
    expect(build("month", today, [done], { showDone: false }).groups).toEqual([]);
  });

  it("an open task past its deadline is overdue", () => {
    expect(only(build("month", today, [task({ deadline: "2026-11-02" })]).groups[0]!.entries)).toMatchObject({ overdue: true });
  });
});

describe("grouping and order", () => {
  it("projects in their usual order (active by name, then archived); ללא פרויקט last; empty groups omitted", () => {
    const model = build("month", today, [
      task({ projectId: null }),
      task({ projectId: "proj-old" }),
      task({ projectId: "proj-site" }),
    ], { planningItems: [milestone({ projectId: "proj-api" })] });
    expect(model.groups.map((group) => [group.name, group.archived])).toEqual([
      ["אתר", false],
      ["Review API", false],
      ["ארכיון ישן", true],
      [NO_PROJECT_NAME, false],
    ]);
  });

  it("planning items join their project's group", () => {
    const model = build("month", today, [task({ projectId: "proj-site" })], { planningItems: [milestone({ projectId: "proj-site" })] });
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]!.entries.map((entry) => entry.kind).sort()).toEqual(["deadline", "milestone"]);
  });

  it("entries order by start day, then milestone → span → marker, then title; independent of input order", () => {
    const input = [
      task({ id: "a", title: "ב", deadline: "2026-11-10" }),
      task({ id: "b", title: "א", deadline: "2026-11-10" }),
      task({ id: "c", title: "ספרינט", startDate: "2026-11-10", deadline: "2026-11-20" }),
      task({ id: "d", title: "מוקדם", startDate: "2026-11-02", deadline: "2026-11-30" }),
    ];
    const items = [milestone({ id: "m", title: "השקה", date: "2026-11-10" })];
    const keys = (tasks: TimelineTask[]) =>
      build("month", today, tasks, { planningItems: items }).groups[0]!.entries.map((entry) => entry.key);
    expect(keys(input)).toEqual(["t:d", "p:m", "t:c", "t:b", "t:a"]);
    expect(keys([...input].reverse())).toEqual(keys(input));
  });
});
