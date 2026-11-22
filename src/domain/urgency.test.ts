import { describe, expect, it } from "vitest";
import { makeTask } from "./testing";
import {
  deadlineChangeClearsOverride,
  isAutoUrgent,
  isEffectiveUrgent,
  quickUrgency,
  taskSignals,
  urgentOverrideAfterEdit,
} from "./urgency";

const today = "2026-11-04";

describe("isAutoUrgent", () => {
  it.each([
    ["2026-11-01", true],
    ["2026-11-04", true],
    ["2026-11-05", true],
    ["2026-11-06", false],
  ])("deadline %s → %s", (deadline, expected) => {
    expect(isAutoUrgent({ deadline }, today)).toBe(expected);
  });
});

describe("isEffectiveUrgent", () => {
  it("follows the automatic value when the override is null", () => {
    expect(isEffectiveUrgent(makeTask({ deadline: "2026-11-05" }), today)).toBe(true);
    expect(isEffectiveUrgent(makeTask({ deadline: "2026-11-20" }), today)).toBe(false);
  });

  it("override true makes a distant task urgent", () => {
    expect(
      isEffectiveUrgent(makeTask({ deadline: "2026-12-20", urgentOverride: true }), today),
    ).toBe(true);
  });

  it("override false makes a near task not urgent", () => {
    expect(
      isEffectiveUrgent(makeTask({ deadline: "2026-11-04", urgentOverride: false }), today),
    ).toBe(false);
  });

  it("override false on an overdue task removes only the Urgent signal", () => {
    const task = makeTask({ deadline: "2026-11-01", urgentOverride: false });
    expect(isEffectiveUrgent(task, today)).toBe(false);
    expect(taskSignals(task, today).overdue).toBe(true);
  });

  it("Done tasks are never urgent", () => {
    expect(
      isEffectiveUrgent(makeTask({ status: "done", urgentOverride: true }), today),
    ).toBe(false);
  });
});

describe("override clearing on deadline change", () => {
  it("clears the override when the deadline changes", () => {
    expect(
      urgentOverrideAfterEdit(
        { deadline: "2026-11-10" },
        { deadline: "2026-11-12", urgentOverride: true },
      ),
    ).toBeNull();
  });

  it("keeps the override when the deadline is unchanged", () => {
    expect(
      urgentOverrideAfterEdit(
        { deadline: "2026-11-10" },
        { deadline: "2026-11-10", urgentOverride: false },
      ),
    ).toBe(false);
  });

  it("warns only when an override exists and the deadline changes", () => {
    expect(
      deadlineChangeClearsOverride({ deadline: "2026-11-10", urgentOverride: true }, "2026-11-12"),
    ).toBe(true);
    expect(
      deadlineChangeClearsOverride({ deadline: "2026-11-10", urgentOverride: null }, "2026-11-12"),
    ).toBe(false);
    expect(
      deadlineChangeClearsOverride({ deadline: "2026-11-10", urgentOverride: true }, "2026-11-10"),
    ).toBe(false);
  });
});

describe("taskSignals (MASTER_SPEC §5.4)", () => {
  it.each([null, true, false])(
    "an overdue task never shows the Urgent badge (override %s)",
    (urgentOverride) => {
      const signals = taskSignals(makeTask({ deadline: "2026-11-02", urgentOverride }), today);
      expect(signals.overdue).toBe(true);
      expect(signals.urgentBadge).toBe(false);
      expect(signals.urgentBadgeManual).toBe(false);
    },
  );

  it("keeps a manual override on an overdue task as subtle metadata", () => {
    expect(
      taskSignals(makeTask({ deadline: "2026-11-02", urgentOverride: true }), today)
        .overrideMetadata,
    ).toBe("urgent");
    expect(
      taskSignals(makeTask({ deadline: "2026-11-02", urgentOverride: false }), today)
        .overrideMetadata,
    ).toBe("not_urgent");
    expect(
      taskSignals(makeTask({ deadline: "2026-11-02", urgentOverride: null }), today)
        .overrideMetadata,
    ).toBeNull();
  });

  it("shows the badge for an automatically urgent task that isn't overdue", () => {
    expect(taskSignals(makeTask({ deadline: "2026-11-05" }), today)).toMatchObject({
      overdue: false,
      urgentBadge: true,
      urgentBadgeManual: false,
      overrideMetadata: null,
      daysRemaining: 1,
    });
  });

  it("marks a manually urgent badge with ידני instead of metadata", () => {
    expect(
      taskSignals(makeTask({ deadline: "2026-12-01", urgentOverride: true }), today),
    ).toMatchObject({ urgentBadge: true, urgentBadgeManual: true, overrideMetadata: null });
  });

  it("exposes a not-urgent override on a non-overdue task as metadata", () => {
    expect(
      taskSignals(makeTask({ deadline: "2026-11-05", urgentOverride: false }), today),
    ).toMatchObject({ urgentBadge: false, overrideMetadata: "not_urgent" });
  });

  it("reports Important independently", () => {
    expect(taskSignals(makeTask({ isImportant: true }), today).important).toBe(true);
  });
});

describe("quick urgency action (UAT-05): never creates a manual 'not urgent'", () => {
  const next = (overrides: Parameters<typeof makeTask>[0]) => quickUrgency(makeTask(overrides), today);

  it("automatic, not urgent → manually urgent", () => {
    expect(next({ deadline: "2026-11-20", urgentOverride: null })).toEqual({ kind: "mark", next: true });
  });

  it("manually urgent → back to automatic (null, not false)", () => {
    expect(next({ deadline: "2026-11-20", urgentOverride: true })).toEqual({ kind: "manual", next: null });
    expect(next({ deadline: "2026-11-01", urgentOverride: true })).toEqual({ kind: "manual", next: null });
  });

  it("manual 'not urgent' → manually urgent", () => {
    expect(next({ deadline: "2026-11-05", urgentOverride: false })).toEqual({ kind: "mark", next: true });
  });

  it("urgent by its deadline (today, tomorrow, overdue) has no quick action", () => {
    for (const deadline of ["2026-11-04", "2026-11-05", "2026-11-01"]) {
      expect(next({ deadline, urgentOverride: null })).toEqual({ kind: "auto" });
    }
  });

  it("a Done task has none, and no result ever sets false", () => {
    expect(next({ status: "done", urgentOverride: true })).toEqual({ kind: "none" });
    for (const urgentOverride of [null, true, false]) {
      for (const deadline of ["2026-11-01", "2026-11-04", "2026-11-30"]) {
        const result = next({ deadline, urgentOverride });
        expect("next" in result ? result.next : "none").not.toBe(false);
      }
    }
  });
});
