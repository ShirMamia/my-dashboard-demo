import { describe, expect, it } from "vitest";
import {
  defaultPreparationTitle,
  groupPlanningItems,
  parsePlanningForm,
  preparationDeadline,
  preparationTaskInput,
  validatePreparationTitle,
  type PlanningFormValues,
  type PlanningItem,
} from "./planning";

const today = "2026-11-03";

const form = (overrides: Partial<PlanningFormValues> = {}): PlanningFormValues => ({
  title: "השקת Q4 Roadmap",
  date: "2026-12-01",
  notes: "",
  prepLeadDays: "7",
  projectId: null,
  categoryId: null,
  ...overrides,
});

const item = (overrides: Partial<PlanningItem> = {}): PlanningItem => ({
  id: "p1",
  title: "אבן דרך",
  date: "2026-12-01",
  notes: null,
  prepLeadDays: 7,
  projectId: null,
  categoryId: null,
  preparationTask: null,
  ...overrides,
});

describe("preparation deadline (MASTER_SPEC §11)", () => {
  it("is the item date minus the lead time, date-only", () => {
    expect(preparationDeadline("2026-12-01", 7, today)).toEqual({ deadline: "2026-11-24", clamped: false });
    expect(preparationDeadline("2026-12-01", 0, today)).toEqual({ deadline: "2026-12-01", clamped: false });
    // Across a month, a year and the DST change: calendar-day arithmetic only.
    expect(preparationDeadline("2027-01-03", 7, today)).toEqual({ deadline: "2026-12-27", clamped: false });
    expect(preparationDeadline("2027-03-30", 5, today)).toEqual({ deadline: "2027-03-25", clamped: false });
  });

  it("sets a past deadline to today and reports it", () => {
    expect(preparationDeadline("2026-11-06", 7, today)).toEqual({ deadline: today, clamped: true });
    expect(preparationDeadline("2026-10-01", 0, today)).toEqual({ deadline: today, clamped: true });
    // Exactly today is not clamped.
    expect(preparationDeadline("2026-11-10", 7, today)).toEqual({ deadline: today, clamped: false });
  });
});

describe("preparation task", () => {
  it("defaults its title to \"הכנה: <title>\", within 200 characters", () => {
    expect(defaultPreparationTitle(" השקת Q4 Roadmap ")).toBe("הכנה: השקת Q4 Roadmap");
    expect(defaultPreparationTitle("א".repeat(200))).toHaveLength(200);
    expect(validatePreparationTitle("  ")).toBe("יש להזין כותרת למשימת ההכנה.");
    expect(validatePreparationTitle("x".repeat(201))).toBe("הכותרת יכולה להכיל עד 200 תווים.");
    expect(validatePreparationTitle("הכנה: x")).toBeNull();
  });

  it("copies project and category; not important, To Do, no start date, automatic urgency", () => {
    expect(preparationTaskInput(item({ projectId: "proj-1", categoryId: "cat-1" }), " הכנה: אבן דרך ", "2026-11-24")).toEqual({
      title: "הכנה: אבן דרך",
      notes: null,
      status: "todo",
      isImportant: false,
      urgentOverride: null,
      deadline: "2026-11-24",
      startDate: null,
      scheduledAt: null,
      projectId: "proj-1",
      categoryId: "cat-1",
      completedAt: null,
    });
  });
});

describe("form validation", () => {
  it("accepts and normalizes valid values", () => {
    expect(parsePlanningForm(form({ title: "  כנס  ", notes: "  ", prepLeadDays: " 30 " }))).toEqual({
      ok: true,
      input: { title: "כנס", date: "2026-12-01", notes: null, prepLeadDays: 30, projectId: null, categoryId: null },
    });
  });

  it("rejects a missing title, an invalid date and a lead time outside 0–365", () => {
    expect(parsePlanningForm(form({ title: " ", date: "2026-02-30", prepLeadDays: "366" }))).toEqual({
      ok: false,
      errors: { title: "יש להזין כותרת.", date: "יש לבחור תאריך.", prepLeadDays: "יש להזין מספר ימים בין 0 ל־365." },
    });
    for (const bad of ["", "-1", "7.5", "abc", "1000"]) {
      expect(parsePlanningForm(form({ prepLeadDays: bad })).ok, bad).toBe(false);
    }
    expect(parsePlanningForm(form({ prepLeadDays: "0" })).ok).toBe(true);
    expect(parsePlanningForm(form({ prepLeadDays: "365" })).ok).toBe(true);
  });
});

describe("list grouping", () => {
  it("orders by date and groups by year, then month", () => {
    const groups = groupPlanningItems([
      item({ id: "c", date: "2027-01-15", title: "ינואר" }),
      item({ id: "a", date: "2026-11-20", title: "ב" }),
      item({ id: "b", date: "2026-11-20", title: "א" }),
      item({ id: "d", date: "2026-12-01", title: "דצמבר" }),
    ]);
    expect(groups.map((year) => [year.year, year.months.map((month) => [month.month, month.items.map((i) => i.id)])])).toEqual([
      ["2026", [["2026-11", ["b", "a"]], ["2026-12", ["d"]]]],
      ["2027", [["2027-01", ["c"]]]],
    ]);
    expect(groupPlanningItems([])).toEqual([]);
  });
});
