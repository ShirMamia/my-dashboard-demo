import { describe, expect, it } from "vitest";
import {
  applyStatusChange,
  daysRemaining,
  defaultDeadline,
  isOverdue,
  isValidHorizon,
  validateTaskFields,
} from "./task";
import { makeTask } from "./testing";

const today = "2026-11-04";

describe("isOverdue", () => {
  it.each([
    ["2026-11-03", true],
    ["2026-11-04", false],
    ["2026-11-05", false],
  ])("deadline %s → %s", (deadline, expected) => {
    expect(isOverdue(makeTask({ deadline }), today)).toBe(expected);
  });

  it("is never true for Done tasks", () => {
    expect(isOverdue(makeTask({ deadline: "2026-11-01", status: "done" }), today)).toBe(false);
  });

  it("applies to Waiting tasks", () => {
    expect(isOverdue(makeTask({ deadline: "2026-11-01", status: "waiting" }), today)).toBe(true);
  });
});

describe("daysRemaining", () => {
  it("is the calendar-day difference", () => {
    expect(daysRemaining(makeTask({ deadline: "2026-11-11" }), today)).toBe(7);
    expect(daysRemaining(makeTask({ deadline: "2026-11-02" }), today)).toBe(-2);
  });
});

describe("applyStatusChange", () => {
  const now = new Date("2026-11-04T10:00:00Z");

  it("sets completedAt when entering Done", () => {
    expect(applyStatusChange({ status: "in_progress", completedAt: null }, "done", now)).toEqual({
      status: "done",
      completedAt: "2026-11-04T10:00:00.000Z",
    });
  });

  it("clears completedAt when leaving Done", () => {
    expect(
      applyStatusChange({ status: "done", completedAt: "2026-11-01T10:00:00Z" }, "todo", now),
    ).toEqual({ status: "todo", completedAt: null });
  });

  it("keeps completedAt when the status doesn't change", () => {
    const task = { status: "done" as const, completedAt: "2026-11-01T10:00:00Z" };
    expect(applyStatusChange(task, "done", now)).toEqual(task);
  });

  it("allows any → any", () => {
    expect(applyStatusChange({ status: "waiting", completedAt: null }, "todo", now)).toEqual({
      status: "todo",
      completedAt: null,
    });
  });
});

describe("default deadline horizon", () => {
  it("adds the horizon to today", () => {
    expect(defaultDeadline(today, 7)).toBe("2026-11-11");
    expect(defaultDeadline(today, 0)).toBe(today);
  });

  it.each([
    [0, true],
    [365, true],
    [-1, false],
    [366, false],
    [1.5, false],
  ])("horizon %d valid → %s", (days, valid) => {
    expect(isValidHorizon(days)).toBe(valid);
  });
});

describe("validateTaskFields", () => {
  it("accepts a valid task", () => {
    expect(
      validateTaskFields({ title: "Review PR", deadline: today, startDate: "2026-11-01" }),
    ).toEqual({});
  });

  it("requires a non-blank title of at most 200 characters", () => {
    expect(validateTaskFields({ title: "  ", deadline: today, startDate: null }).title).toBeDefined();
    expect(
      validateTaskFields({ title: "א".repeat(201), deadline: today, startDate: null }).title,
    ).toBeDefined();
    expect(
      validateTaskFields({ title: "א".repeat(200), deadline: today, startDate: null }).title,
    ).toBeUndefined();
  });

  it("enforces start_date ≤ deadline", () => {
    expect(
      validateTaskFields({ title: "x", deadline: today, startDate: "2026-11-05" }).startDate,
    ).toBeDefined();
    expect(
      validateTaskFields({ title: "x", deadline: today, startDate: today }).startDate,
    ).toBeUndefined();
  });
});
