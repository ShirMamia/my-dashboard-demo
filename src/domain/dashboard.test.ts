import { describe, expect, it } from "vitest";
import { buildDashboard, buildSections, computeKpis, isUpcoming } from "./dashboard";
import { todayInAppZone } from "./dates";
import { projectProgress } from "./project-progress";
import type { Task, TaskSummary } from "./task";
import { makeTask, shuffled } from "./testing";

const today = "2026-11-04"; // Wednesday; week = 2026-11-01 … 2026-11-07
const ids = (tasks: TaskSummary[]) => tasks.map((task) => task.id);

describe("sections", () => {
  it("Urgent: effective urgent incl. Waiting, overdue first then deadline", () => {
    const tomorrow = makeTask({ deadline: "2026-11-05" });
    const overdue = makeTask({ deadline: "2026-11-03", status: "waiting" });
    const manual = makeTask({ deadline: "2026-11-20", urgentOverride: true });
    const notUrgent = makeTask({ deadline: "2026-11-04", urgentOverride: false });
    const done = makeTask({ deadline: "2026-11-01", status: "done", completedAt: "x" });
    const { urgent } = buildSections({
      tasks: [tomorrow, overdue, manual, notUrgent, done],
      todayTaskIds: [],
      today,
    });
    expect(ids(urgent.rows)).toEqual([overdue.id, tomorrow.id, manual.id]);
  });

  it("Upcoming covers today+1 … today+7 only", () => {
    expect(isUpcoming({ deadline: today }, today)).toBe(false);
    expect(isUpcoming({ deadline: "2026-11-05" }, today)).toBe(true);
    expect(isUpcoming({ deadline: "2026-11-11" }, today)).toBe(true);
    expect(isUpcoming({ deadline: "2026-11-12" }, today)).toBe(false);
  });

  it("dedups Today → Urgent → Important → Upcoming", () => {
    const inToday = makeTask({ deadline: "2026-11-05", isImportant: true });
    const urgentImportant = makeTask({ deadline: "2026-11-05", isImportant: true });
    const importantUpcoming = makeTask({ deadline: "2026-11-08", isImportant: true });
    const upcomingOnly = makeTask({ deadline: "2026-11-09" });
    const sections = buildSections({
      tasks: [inToday, urgentImportant, importantUpcoming, upcomingOnly],
      todayTaskIds: [inToday.id],
      today,
    });
    expect(ids(sections.urgent.rows)).toEqual([urgentImportant.id]);
    expect(ids(sections.important.rows)).toEqual([importantUpcoming.id]);
    expect(ids(sections.upcoming.rows)).toEqual([upcomingOnly.id]);
    // Totals ("הצגת הכול") are not deduplicated.
    expect(sections.urgent.total).toBe(2);
    expect(sections.important.total).toBe(3);
    expect(sections.upcoming.total).toBe(4);
  });

  it("shows at most 5 rows per section", () => {
    const tasks = Array.from({ length: 7 }, () => makeTask({ deadline: "2026-11-05" }));
    const { urgent } = buildSections({ tasks, todayTaskIds: [], today });
    expect(urgent.rows).toHaveLength(5);
    expect(urgent.total).toBe(7);
  });

  it("is deterministic for shuffled input", () => {
    const tasks = [
      makeTask({ deadline: "2026-11-02" }),
      makeTask({ deadline: "2026-11-05" }),
      makeTask({ deadline: "2026-11-05", isImportant: true }),
      makeTask({ deadline: "2026-11-07", isImportant: true }),
      makeTask({ deadline: "2026-11-08" }),
      makeTask({ deadline: "2026-11-08" }),
    ];
    const expected = buildSections({ tasks, todayTaskIds: [], today });
    for (const seed of [1, 7, 21]) {
      expect(buildSections({ tasks: shuffled(tasks, seed), todayTaskIds: [], today })).toEqual(
        expected,
      );
    }
  });
});

describe("KPIs", () => {
  it("counts open and overdue tasks without dedup, ignoring the override", () => {
    const tasks = [
      makeTask({ deadline: "2026-11-01", urgentOverride: false }),
      makeTask({ deadline: "2026-11-03", status: "waiting" }),
      makeTask({ deadline: "2026-11-10" }),
      makeTask({ deadline: "2026-11-01", status: "done", completedAt: "2026-11-02T10:00:00Z" }),
    ];
    expect(computeKpis(tasks, today)).toMatchObject({ open: 3, overdue: 2 });
  });

  it("counts Completed This Week at the Jerusalem week boundaries", () => {
    const done = (completedAt: string) => makeTask({ status: "done", completedAt });
    const tasks = [
      done("2026-10-31T21:59:59Z"), // Sat 31 Oct 23:59:59 Jerusalem: previous week
      done("2026-10-31T22:00:00Z"), // Sun 1 Nov 00:00 Jerusalem: this week
      done("2026-11-07T21:59:59Z"), // Sat 7 Nov 23:59:59 Jerusalem: this week
      done("2026-11-07T22:00:00Z"), // Sun 8 Nov 00:00 Jerusalem: next week
    ];
    expect(computeKpis(tasks, today).completedThisWeek).toBe(2);
  });
});

describe("project progress", () => {
  it("handles a project with no tasks", () => {
    expect(projectProgress([], today)).toEqual({
      total: 0,
      done: 0,
      open: 0,
      overdue: 0,
      ratio: null,
      text: "אין משימות עדיין",
    });
  });

  it("derives counts and text from tasks", () => {
    const progress = projectProgress(
      [
        makeTask({ status: "done", completedAt: "x" }),
        makeTask({ deadline: "2026-11-01" }),
        makeTask({ deadline: "2026-11-20" }),
        makeTask({ status: "done", completedAt: "x", deadline: "2026-10-01" }),
      ],
      today,
    );
    expect(progress).toMatchObject({ total: 4, done: 2, open: 2, overdue: 1, ratio: 0.5 });
    expect(progress.text).toBe("2 מתוך 4 הושלמו");
  });
});

describe("buildDashboard (Phase 7)", () => {
  const pickOf = (task: Task) => ({ taskId: task.id, createdAt: "2026-11-04T08:00:00.000Z" });

  it("is calm and empty with no tasks", () => {
    const dashboard = buildDashboard({ openTasks: [], completed: [], picks: [], dismissedTaskIds: [], today });
    expect(dashboard.today).toEqual([]);
    expect(dashboard.sections).toEqual({
      urgent: { rows: [], total: 0 },
      important: { rows: [], total: 0 },
      upcoming: { rows: [], total: 0 },
    });
    expect(dashboard.kpis).toEqual({ open: 0, overdue: 0, completedThisWeek: 0 });
    expect(dashboard.openPickCount).toBe(0);
    expect(dashboard.pickCandidates).toEqual([]);
  });

  it("dedups the sections against Today, while KPIs and totals count every task", () => {
    const overdueImportant = makeTask({ deadline: "2026-11-02", isImportant: true });
    const urgentImportant = makeTask({ deadline: "2026-11-05", isImportant: true, status: "waiting" });
    const important = makeTask({ deadline: "2026-11-30", isImportant: true });
    const upcoming = makeTask({ deadline: "2026-11-09", status: "waiting" });
    const doneThisWeek = makeTask({ status: "done", completedAt: "2026-11-02T10:00:00Z" });
    const dashboard = buildDashboard({
      openTasks: [overdueImportant, urgentImportant, important, upcoming],
      completed: [doneThisWeek],
      picks: [],
      dismissedTaskIds: [],
      today,
    });
    // Waiting tasks aren't recommended; the overdue one and the important one are.
    expect(dashboard.today.map((item) => item.task.id)).toEqual([overdueImportant.id, important.id]);
    expect(ids(dashboard.sections.urgent.rows)).toEqual([urgentImportant.id]);
    expect(ids(dashboard.sections.important.rows)).toEqual([]);
    expect(ids(dashboard.sections.upcoming.rows)).toEqual([upcoming.id]);
    expect(dashboard.sections.important.total).toBe(3);
    expect(dashboard.kpis).toEqual({ open: 4, overdue: 1, completedThisWeek: 1 });
  });

  it("never lists an overdue task as Upcoming", () => {
    const overdue = makeTask({ deadline: "2026-11-03", status: "waiting" });
    const dashboard = buildDashboard({ openTasks: [overdue], completed: [], picks: [], dismissedTaskIds: [], today });
    expect(dashboard.sections.upcoming.total).toBe(0);
    expect(ids(dashboard.sections.urgent.rows)).toEqual([overdue.id]);
  });

  it("offers every open, unpicked task in the picker, dismissed ones included, by deadline", () => {
    const later = makeTask({ deadline: "2026-12-01" });
    const dismissed = makeTask({ deadline: "2026-11-05" });
    const picked = makeTask({ deadline: "2026-11-04" });
    const dashboard = buildDashboard({
      openTasks: [later, dismissed, picked],
      completed: [],
      picks: [pickOf(picked)],
      dismissedTaskIds: [dismissed.id],
      today,
    });
    expect(ids(dashboard.pickCandidates)).toEqual([dismissed.id, later.id]);
    expect(dashboard.openPickCount).toBe(1);
  });

  it("counts only open picks toward the limit", () => {
    const tasks = Array.from({ length: 5 }, () => makeTask({ deadline: "2026-11-20" }));
    const [first, ...rest] = tasks;
    const dashboard = buildDashboard({
      openTasks: rest, // the first pick's task was completed
      completed: [{ ...first!, status: "done", completedAt: "2026-11-04T09:00:00Z" }],
      picks: tasks.map(pickOf),
      dismissedTaskIds: [],
      today,
    });
    expect(dashboard.openPickCount).toBe(4);
    expect(dashboard.kpis.completedThisWeek).toBe(1);
  });

  it("keys Today to the Jerusalem calendar day, not UTC, across both DST regimes", () => {
    // Winter (UTC+2) and summer (UTC+3): the day flips at Jerusalem midnight.
    expect(todayInAppZone(new Date("2026-11-04T21:59:59Z"))).toBe("2026-11-04");
    expect(todayInAppZone(new Date("2026-11-04T22:00:00Z"))).toBe("2026-11-05");
    expect(todayInAppZone(new Date("2026-07-14T20:59:59Z"))).toBe("2026-07-14");
    expect(todayInAppZone(new Date("2026-07-14T21:00:00Z"))).toBe("2026-07-15");
    // The night DST ends (25 Oct 2026, 02:00 → 01:00) is still one calendar day.
    expect(todayInAppZone(new Date("2026-10-24T21:00:00Z"))).toBe("2026-10-25");
    expect(todayInAppZone(new Date("2026-10-25T21:59:59Z"))).toBe("2026-10-25");
  });
});
