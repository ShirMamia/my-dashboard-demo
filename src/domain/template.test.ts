import { describe, expect, it } from "vitest";
import {
  normalizeTemplate,
  sortTemplates,
  templateTaskValues,
  validateTemplate,
  type TemplateInput,
} from "./template";

const input = (overrides: Partial<TemplateInput> = {}): TemplateInput => ({
  name: "דוח שבועי",
  title: "הכנת דוח שבועי",
  notes: null,
  isImportant: false,
  projectId: null,
  categoryId: null,
  ...overrides,
});

describe("validation", () => {
  it("requires a name and a title, trimmed, within the DB limits", () => {
    expect(validateTemplate(input())).toEqual({});
    expect(validateTemplate(input({ name: "  ", title: "" }))).toEqual({
      name: "יש להזין שם לתבנית.",
      title: "יש להזין כותרת למשימה.",
    });
    expect(validateTemplate(input({ name: "א".repeat(101) })).name).toBe("שם התבנית יכול להכיל עד 100 תווים.");
    expect(validateTemplate(input({ name: ` ${"א".repeat(100)} ` }))).toEqual({});
    expect(validateTemplate(input({ title: "x".repeat(201) })).title).toBe("הכותרת יכולה להכיל עד 200 תווים.");
  });

  it("normalizes text fields; blank notes become null", () => {
    expect(normalizeTemplate(input({ name: " Weekly report ", title: " דוח ", notes: "   " }))).toMatchObject({
      name: "Weekly report",
      title: "דוח",
      notes: null,
    });
    expect(normalizeTemplate(input({ notes: " שורה 1\nשורה 2 " })).notes).toBe("שורה 1\nשורה 2");
  });
});

describe("instantiation (MASTER_SPEC §9)", () => {
  const context = { today: "2026-11-02", horizonDays: 7, activeProjectIds: new Set(["p-active"]) };

  it("pre-fills the template's fields, today + horizon and To Do", () => {
    const result = templateTaskValues(
      input({ notes: "פרטים", isImportant: true, projectId: "p-active", categoryId: "c1" }),
      context,
    );
    expect(result).toEqual({
      values: {
        title: "הכנת דוח שבועי",
        notes: "פרטים",
        isImportant: true,
        projectId: "p-active",
        categoryId: "c1",
        deadline: "2026-11-09",
        status: "todo",
      },
      projectDropped: false,
    });
  });

  it("uses the user's horizon, including 0 (today)", () => {
    expect(templateTaskValues(input(), { ...context, horizonDays: 0 }).values.deadline).toBe("2026-11-02");
    expect(templateTaskValues(input(), { ...context, horizonDays: 30 }).values.deadline).toBe("2026-12-02");
  });

  it("leaves an archived project empty and reports it", () => {
    const result = templateTaskValues(input({ projectId: "p-archived" }), context);
    expect(result.values.projectId).toBeNull();
    expect(result.projectDropped).toBe(true);
  });

  it("returns fresh values: the task is independent of the template", () => {
    const template = input({ title: "A" });
    const { values } = templateTaskValues(template, context);
    values.title = "B";
    expect(template.title).toBe("A");
    expect(templateTaskValues(template, context).values.title).toBe("A");
  });
});

describe("sorting", () => {
  it("orders by name (Hebrew collation: Hebrew before Latin), then id", () => {
    const sorted = sortTemplates([
      { id: "3", name: "תכנון" },
      { id: "2", name: "Weekly" },
      { id: "1", name: "אישור" },
      { id: "0", name: "אישור" },
    ]);
    expect(sorted.map((template) => template.id)).toEqual(["0", "1", "3", "2"]);
  });
});
