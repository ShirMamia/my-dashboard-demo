import { describe, expect, it } from "vitest";
import { editedTask, newTask, type TaskFormInput } from "./task-edit";
import { makeTask } from "./testing";

const now = new Date("2026-11-04T10:00:00Z");

const input = (overrides: Partial<TaskFormInput> = {}): TaskFormInput => ({
  title: "  Review PR — סקירה  ",
  notes: "   ",
  status: "todo",
  isImportant: false,
  deadline: "2026-11-11",
  startDate: null,
  scheduledAt: null,
  projectId: null,
  categoryId: null,
  ...overrides,
});

describe("newTask", () => {
  it("trims the title, drops blank notes and starts with automatic urgency", () => {
    expect(newTask(input(), now)).toMatchObject({
      title: "Review PR — סקירה",
      notes: null,
      urgentOverride: null,
      completedAt: null,
      status: "todo",
    });
  });

  it("sets completedAt for a task created as Done", () => {
    expect(newTask(input({ status: "done" }), now).completedAt).toBe(now.toISOString());
  });
});

describe("editedTask", () => {
  const previous = makeTask({ deadline: "2026-11-10", urgentOverride: true });

  it("keeps the override when the deadline is unchanged", () => {
    const next = editedTask(previous, { ...input({ deadline: "2026-11-10" }), urgentOverride: true }, now);
    expect(next.urgentOverride).toBe(true);
  });

  it("clears the override when the deadline changes, whatever the form sent", () => {
    const next = editedTask(previous, { ...input({ deadline: "2026-11-12" }), urgentOverride: false }, now);
    expect(next.urgentOverride).toBeNull();
    expect(next.deadline).toBe("2026-11-12");
  });

  it("can set or clear the override explicitly", () => {
    const auto = makeTask({ deadline: "2026-11-10", urgentOverride: null });
    expect(
      editedTask(auto, { ...input({ deadline: "2026-11-10" }), urgentOverride: false }, now).urgentOverride,
    ).toBe(false);
    expect(
      editedTask(previous, { ...input({ deadline: "2026-11-10" }), urgentOverride: null }, now)
        .urgentOverride,
    ).toBeNull();
  });

  it("sets completedAt on completion and clears it on reopen; status keeps the override", () => {
    const done = editedTask(
      previous,
      { ...input({ deadline: "2026-11-10", status: "done" }), urgentOverride: true },
      now,
    );
    expect(done).toMatchObject({ status: "done", completedAt: now.toISOString(), urgentOverride: true });

    const completed = makeTask({ status: "done", completedAt: "2026-11-01T08:00:00Z", deadline: "2026-11-10" });
    const reopened = editedTask(
      completed,
      { ...input({ deadline: "2026-11-10", status: "in_progress" }), urgentOverride: null },
      now,
    );
    expect(reopened).toMatchObject({ status: "in_progress", completedAt: null });
  });

  it("keeps the original completedAt when a Done task is edited", () => {
    const completed = makeTask({ status: "done", completedAt: "2026-11-01T08:00:00Z", deadline: "2026-11-10" });
    const next = editedTask(
      completed,
      { ...input({ deadline: "2026-11-10", status: "done", title: "חדש" }), urgentOverride: null },
      now,
    );
    expect(next.completedAt).toBe("2026-11-01T08:00:00Z");
  });
});
