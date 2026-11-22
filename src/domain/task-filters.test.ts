import { describe, expect, it } from "vitest";
import {
  applyTaskFilters,
  DEFAULT_FILTERS,
  dueBounds,
  activeFilterCount,
  hasActiveFilters,
  includesDone,
  tasksHref,
  parseTaskFilters,
  serializeTaskFilters,
  sortTasks,
  type TaskFilters,
} from "./task-filters";
import type { Task } from "./task";
import { makeTask, shuffled } from "./testing";

const today = "2026-11-04"; // Wednesday; week = 2026-11-01 … 2026-11-07
const ids = (tasks: Task[]) => tasks.map((task) => task.id);
const filters = (overrides: Partial<TaskFilters> = {}): TaskFilters => ({ ...DEFAULT_FILTERS, ...overrides });

describe("URL round-trip", () => {
  it("parses an empty query to the defaults and serializes defaults to an empty string", () => {
    expect(parseTaskFilters({})).toEqual(DEFAULT_FILTERS);
    expect(serializeTaskFilters(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips every field", () => {
    const all = filters({
      q: "Review PR",
      statuses: ["todo", "waiting"],
      projectId: "p1",
      categoryId: "none",
      important: true,
      urgent: true,
      overdue: true,
      due: "custom",
      from: "2026-11-01",
      to: "2026-11-30",
      showCompleted: true,
      completedThisWeek: true,
      sort: "title",
      dir: "desc",
    });
    const query = serializeTaskFilters(all);
    expect(parseTaskFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(all);
  });

  it("ignores malformed values", () => {
    expect(
      parseTaskFilters({
        status: "todo,bogus,todo",
        sort: "priority",
        dir: "sideways",
        due: "someday",
        important: "yes",
        from: "2026-02-30",
      }),
    ).toEqual(filters({ statuses: ["todo"] }));
  });

  it("drops from/to unless the range is custom", () => {
    expect(parseTaskFilters({ due: "week", from: "2026-11-01" })).toMatchObject({ due: "week", from: null });
    expect(serializeTaskFilters(filters({ due: "today", from: "2026-11-01" }))).toBe("due=today");
  });

  it("uses the first value of repeated params", () => {
    expect(parseTaskFilters({ sort: ["title", "created"] }).sort).toBe("title");
  });
});

describe("single filters", () => {
  const overdue = makeTask({ deadline: "2026-11-02" });
  const overdueNotUrgent = makeTask({ deadline: "2026-11-01", urgentOverride: false });
  const todayTask = makeTask({ deadline: today, isImportant: true });
  const manualUrgent = makeTask({ deadline: "2026-12-20", urgentOverride: true, status: "waiting" });
  const later = makeTask({ deadline: "2026-11-11", projectId: "p1", categoryId: "c1" });
  const done = makeTask({ deadline: "2026-11-03", status: "done", completedAt: "2026-11-03T10:00:00Z" });
  const all = [overdue, overdueNotUrgent, todayTask, manualUrgent, later, done];
  const run = (overrides: Partial<TaskFilters>) => ids(applyTaskFilters(all, filters(overrides), today));

  it("completed this week: only Done tasks completed in the Jerusalem week (the KPI's link)", () => {
    const lastWeek = makeTask({ status: "done", completedAt: "2026-10-31T21:59:59Z" }); // Sat 23:59 Jerusalem
    const sundayStart = makeTask({ status: "done", completedAt: "2026-10-31T22:00:00Z" }); // Sun 00:00 Jerusalem
    const tasks = [...all, lastWeek, sundayStart];
    expect(ids(applyTaskFilters(tasks, filters({ completedThisWeek: true }), today))).toEqual([done.id, sundayStart.id]);
    expect(parseTaskFilters({ completed: "week" })).toEqual(filters({ completedThisWeek: true }));
    expect(parseTaskFilters({ completed: "month" })).toEqual(DEFAULT_FILTERS);
    expect(hasActiveFilters(filters({ completedThisWeek: true }))).toBe(true);
    expect(includesDone(filters({ completedThisWeek: true }))).toBe(true);
  });

  it("hides Done by default and shows it with show-completed", () => {
    expect(run({})).not.toContain(done.id);
    expect(run({ showCompleted: true })).toContain(done.id);
  });

  it("status (multi, OR); selecting Done shows Done tasks", () => {
    expect(run({ statuses: ["waiting"] })).toEqual([manualUrgent.id]);
    expect(run({ statuses: ["waiting", "done"] }).sort()).toEqual([manualUrgent.id, done.id].sort());
  });

  it("project and category, including 'none'", () => {
    expect(run({ projectId: "p1" })).toEqual([later.id]);
    expect(run({ categoryId: "none" })).not.toContain(later.id);
  });

  it("Important", () => {
    expect(run({ important: true })).toEqual([todayTask.id]);
  });

  it("Urgent uses effective urgency; an overdue task with override false is not urgent", () => {
    expect(run({ urgent: true }).sort()).toEqual([overdue.id, todayTask.id, manualUrgent.id].sort());
  });

  it("Overdue ignores the override (MASTER_SPEC §5.3)", () => {
    expect(run({ overdue: true }).sort()).toEqual([overdue.id, overdueNotUrgent.id].sort());
  });

  it("deadline ranges", () => {
    expect(dueBounds({ due: "week", from: null, to: null }, today)).toEqual({
      from: "2026-11-01",
      to: "2026-11-07",
    });
    expect(run({ due: "today" })).toEqual([todayTask.id]);
    expect(run({ due: "week" }).sort()).toEqual([overdue.id, overdueNotUrgent.id, todayTask.id].sort());
    expect(run({ due: "next7" }).sort()).toEqual([todayTask.id, later.id].sort());
    expect(run({ due: "custom", from: "2026-11-02", to: "2026-11-04" }).sort()).toEqual(
      [overdue.id, todayTask.id].sort(),
    );
    expect(run({ due: "custom", from: "2026-11-05", to: null })).toEqual([later.id, manualUrgent.id]);
    expect(run({ due: "custom", from: null, to: "2026-11-01" })).toEqual([overdueNotUrgent.id]);
  });

  it("text search: case-insensitive over title and notes", () => {
    const english = makeTask({ title: "Review PR for API" });
    const inNotes = makeTask({ title: "פגישה", notes: "להביא את ה-review" });
    const tasks = [english, inNotes, makeTask({ title: "אחר" })];
    expect(ids(applyTaskFilters(tasks, filters({ q: "REVIEW" }), today)).sort()).toEqual(
      [english.id, inNotes.id].sort(),
    );
    expect(ids(applyTaskFilters(tasks, filters({ q: "פגיש" }), today))).toEqual([inNotes.id]);
  });
});

describe("combined filters (AND)", () => {
  const a = makeTask({ deadline: "2026-11-02", isImportant: true, categoryId: "c1" });
  const b = makeTask({ deadline: "2026-11-02", isImportant: false, categoryId: "c1" });
  const c = makeTask({ deadline: "2026-11-02", isImportant: true, categoryId: "c2" });
  const d = makeTask({ deadline: "2026-11-20", isImportant: true, categoryId: "c1" });
  const e = makeTask({ deadline: "2026-11-02", isImportant: true, categoryId: "c1", status: "waiting" });
  const all = [a, b, c, d, e];

  it("overdue + important + category + status", () => {
    expect(
      ids(
        applyTaskFilters(
          all,
          filters({ overdue: true, important: true, categoryId: "c1", statuses: ["todo"] }),
          today,
        ),
      ),
    ).toEqual([a.id]);
  });

  it("text + range + important", () => {
    const x = makeTask({ title: "דוח רבעוני Q4", deadline: "2026-11-05", isImportant: true });
    const y = makeTask({ title: "דוח שנתי", deadline: "2026-11-05" });
    const z = makeTask({ title: "דוח רבעוני Q3", deadline: "2026-12-05", isImportant: true });
    expect(
      ids(applyTaskFilters([x, y, z], filters({ q: "דוח", due: "next7", important: true }), today)),
    ).toEqual([x.id]);
  });

  it("an impossible combination yields nothing", () => {
    expect(applyTaskFilters(all, filters({ overdue: true, due: "custom", from: "2026-12-01" }), today)).toEqual(
      [],
    );
  });
});

describe("sorting", () => {
  const t1 = makeTask({ title: "בננה", deadline: "2026-11-10", createdAt: "2026-10-03T00:00:00Z" });
  const t2 = makeTask({ title: "Apple", deadline: "2026-11-05", createdAt: "2026-10-01T00:00:00Z" });
  const t3 = makeTask({ title: "אבטיח", deadline: "2026-11-05", createdAt: "2026-10-02T00:00:00Z" });

  it("by deadline (default), ties by created date", () => {
    expect(ids(sortTasks([t1, t3, t2], "deadline", "asc"))).toEqual([t2.id, t3.id, t1.id]);
    expect(ids(sortTasks([t1, t3, t2], "deadline", "desc"))).toEqual([t1.id, t2.id, t3.id]);
  });

  it("by created date", () => {
    expect(ids(sortTasks([t1, t3, t2], "created", "asc"))).toEqual([t2.id, t3.id, t1.id]);
  });

  it("by title, Hebrew-aware", () => {
    const sorted = ids(sortTasks([t1, t2, t3], "title", "asc"));
    expect(sorted.indexOf(t3.id)).toBeLessThan(sorted.indexOf(t1.id)); // אבטיח < בננה
  });

  it("is deterministic for shuffled input", () => {
    const tasks = [t1, t2, t3, makeTask({ deadline: "2026-11-05", createdAt: "2026-10-02T00:00:00Z" })];
    const expected = ids(sortTasks(tasks, "deadline", "asc"));
    for (const seed of [1, 5, 9]) expect(ids(sortTasks(shuffled(tasks, seed), "deadline", "asc"))).toEqual(expected);
  });
});

describe("helpers", () => {
  it("activeFilterCount counts each narrowing criterion once", () => {
    expect(activeFilterCount(filters())).toBe(0);
    expect(activeFilterCount(filters({ showCompleted: true, sort: "title", dir: "desc" }))).toBe(0);
    expect(activeFilterCount(filters({ important: true }))).toBe(1);
    expect(activeFilterCount(filters({ statuses: ["todo", "waiting", "done"] }))).toBe(1);
    expect(
      activeFilterCount(
        filters({ q: "x", statuses: ["todo"], projectId: "none", categoryId: "c1", important: true, urgent: true, overdue: true, due: "week", completedThisWeek: true }),
      ),
    ).toBe(9);
    expect(activeFilterCount(filters({ completedThisWeek: true }))).toBe(1);
  });

  it("tasksHref builds the Dashboard's filter links", () => {
    expect(tasksHref({})).toBe("/tasks");
    expect(tasksHref({ overdue: true })).toBe("/tasks?overdue=1");
    expect(tasksHref({ completedThisWeek: true })).toBe("/tasks?completed=week");
    expect(tasksHref({ due: "custom", from: "2026-11-05", to: "2026-11-11" })).toBe(
      "/tasks?due=custom&from=2026-11-05&to=2026-11-11",
    );
  });

  it("hasActiveFilters ignores sort and show-completed", () => {
    expect(hasActiveFilters(filters({ sort: "title", showCompleted: true }))).toBe(false);
    expect(hasActiveFilters(filters({ important: true }))).toBe(true);
  });

  it("includesDone", () => {
    expect(includesDone(filters())).toBe(false);
    expect(includesDone(filters({ statuses: ["done"] }))).toBe(true);
  });
});
