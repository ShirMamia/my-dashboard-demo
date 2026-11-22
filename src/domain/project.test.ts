import { describe, expect, it } from "vitest";
import {
  isAssignableProject,
  normalizeProjectName,
  openTasksWarning,
  parseLifecycleParam,
  projectLifecycle,
  progressByProject,
  progressPercent,
  sortProjects,
  validateProjectName,
} from "./project";
import { projectProgress } from "./project-progress";
import { makeTask } from "./testing";

const today = "2026-11-04";

describe("project progress (MASTER_SPEC §8)", () => {
  it("zero tasks: no ratio, no percent, never a misleading 100%", () => {
    const progress = projectProgress([], today);
    expect(progress).toMatchObject({ total: 0, done: 0, open: 0, overdue: 0, ratio: null, text: "אין משימות עדיין" });
    expect(progressPercent(progress)).toBeNull();
  });

  it("only completed tasks: 100%", () => {
    const tasks = [1, 2, 3].map(() => makeTask({ status: "done", completedAt: "x" }));
    const progress = projectProgress(tasks, today);
    expect(progress).toMatchObject({ total: 3, done: 3, open: 0, ratio: 1, text: "3 מתוך 3 הושלמו" });
    expect(progressPercent(progress)).toBe(100);
  });

  it("mixed: every status counts in the total; only Done counts as done", () => {
    const progress = projectProgress(
      [
        makeTask({ status: "done", completedAt: "x" }),
        makeTask({ status: "todo", deadline: "2026-11-01" }),
        makeTask({ status: "in_progress" }),
        makeTask({ status: "waiting", deadline: "2026-11-03" }),
      ],
      today,
    );
    expect(progress).toMatchObject({ total: 4, done: 1, open: 3, overdue: 2, text: "1 מתוך 4 הושלמו" });
    expect(progressPercent(progress)).toBe(25);
  });

  it("a Done task with a past deadline is not overdue", () => {
    expect(
      projectProgress([makeTask({ status: "done", completedAt: "x", deadline: "2026-10-01" })], today).overdue,
    ).toBe(0);
  });

  it("completing and reopening a task moves progress both ways", () => {
    const open = makeTask({ status: "todo" });
    const other = makeTask({ status: "todo" });
    expect(projectProgress([open, other], today).done).toBe(0);
    const completed = { ...open, status: "done" as const, completedAt: "x" };
    expect(projectProgress([completed, other], today)).toMatchObject({ done: 1, text: "1 מתוך 2 הושלמו" });
    expect(projectProgress([{ ...completed, status: "todo" as const, completedAt: null }, other], today).done).toBe(0);
  });

  it("rounds the percent", () => {
    expect(progressPercent({ ratio: 1 / 3 })).toBe(33);
    expect(progressPercent({ ratio: 2 / 3 })).toBe(67);
  });
});

describe("progressByProject", () => {
  it("groups the user's tasks by project in one pass; empty projects get empty progress", () => {
    const tasks = [
      makeTask({ projectId: "a", status: "done", completedAt: "x" }),
      makeTask({ projectId: "a" }),
      makeTask({ projectId: "b", deadline: "2026-11-01" }),
      makeTask({ projectId: null }),
      makeTask({ projectId: "unknown" }),
    ];
    const progress = progressByProject(["a", "b", "c"], tasks, today);
    expect(progress.get("a")).toMatchObject({ total: 2, done: 1, text: "1 מתוך 2 הושלמו" });
    expect(progress.get("b")).toMatchObject({ total: 1, overdue: 1 });
    expect(progress.get("c")).toMatchObject({ total: 0, ratio: null, text: "אין משימות עדיין" });
    expect(progress.has("unknown")).toBe(false);
  });
});

describe("project name", () => {
  it("is trimmed and required, at most 100 characters", () => {
    expect(normalizeProjectName("  פרויקט BI Dashboard  ")).toBe("פרויקט BI Dashboard");
    expect(validateProjectName("   ")).toBe("יש להזין שם לפרויקט.");
    expect(validateProjectName("א".repeat(100))).toBeNull();
    expect(validateProjectName("א".repeat(101))).toContain("100");
  });
});

describe("sortProjects", () => {
  it("active first, then by name (Hebrew-aware), deterministic", () => {
    const projects = [
      { id: "3", name: "מערכת ניהול Q4", archivedAt: "2026-10-01T00:00:00Z" },
      { id: "2", name: "בית", archivedAt: null },
      { id: "1", name: "אתר", archivedAt: null },
      { id: "4", name: "Review API integration", archivedAt: null },
    ];
    const sorted = sortProjects(projects).map((project) => project.id);
    expect(sorted.at(-1)).toBe("3");
    expect(sorted.indexOf("1")).toBeLessThan(sorted.indexOf("2"));
    expect(sortProjects([...projects].reverse()).map((project) => project.id)).toEqual(sorted);
  });
});

describe("project lifecycle (UAT-03): completed and archived are independent", () => {
  const at = "2026-11-01T10:00:00.000Z";
  const project = (completedAt: string | null, archivedAt: string | null) => ({ completedAt, archivedAt });

  it("classifies active, completed, archived, and completed + archived", () => {
    expect(projectLifecycle(project(null, null))).toBe("active");
    expect(projectLifecycle(project(at, null))).toBe("completed");
    expect(projectLifecycle(project(null, at))).toBe("archived");
    // Shown once, in the archive, with its completion kept.
    expect(projectLifecycle(project(at, at))).toBe("archived");
  });

  it("restoring a completed project from the archive keeps it completed; reopening makes it active", () => {
    const completedArchived = project(at, at);
    expect(projectLifecycle({ ...completedArchived, archivedAt: null })).toBe("completed");
    expect(projectLifecycle({ ...completedArchived, archivedAt: null, completedAt: null })).toBe("active");
  });

  it("only active projects are offered for new work", () => {
    expect(isAssignableProject(project(null, null))).toBe(true);
    expect(isAssignableProject(project(at, null))).toBe(false);
    expect(isAssignableProject(project(null, at))).toBe(false);
  });

  it("progress is derived from tasks only: 100% doesn't complete a project, open tasks don't block it", () => {
    const tasks = [makeTask({ status: "done" }), makeTask({ status: "done" })];
    expect(projectProgress(tasks, today).ratio).toBe(1);
    expect(projectLifecycle(project(null, null))).toBe("active");
    expect(projectProgress([makeTask({ status: "todo" })], today).open).toBe(1);
    expect(projectLifecycle(project(at, null))).toBe("completed");
  });

  it("warns about open tasks before completing (they stay unchanged), and only then", () => {
    expect(openTasksWarning(0)).toBeNull();
    expect(openTasksWarning(1)).toBe("לפרויקט נשארה משימה פתוחה אחת. לסמן את הפרויקט כהושלם בכל זאת?");
    expect(openTasksWarning(3)).toBe("לפרויקט נשארו 3 משימות פתוחות. לסמן את הפרויקט כהושלם בכל זאת?");
  });

  it("the list tab comes from the URL, defaulting to active", () => {
    expect(parseLifecycleParam("completed")).toBe("completed");
    expect(parseLifecycleParam("archived")).toBe("archived");
    expect(parseLifecycleParam(undefined)).toBe("active");
    expect(parseLifecycleParam("bogus")).toBe("active");
  });
});
