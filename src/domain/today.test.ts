import { describe, expect, it } from "vitest";
import type { Task, TaskSummary } from "./task";
import { makeTask, shuffled } from "./testing";
import {
  buildToday,
  compareForToday,
  nextPickSlot,
  pickCandidates,
  reasonText,
  type TodayPick,
} from "./today";

const today = "2026-11-04";

function run(tasks: Task[], picks: TodayPick[] = [], dismissedTaskIds: string[] = []) {
  return buildToday({ tasks, picks, dismissedTaskIds, today });
}
const ids = (items: { task: TaskSummary }[]) => items.map((item) => item.task.id);

describe("composition", () => {
  it("is empty with 0 candidates", () => {
    expect(run([makeTask({ deadline: "2026-12-31" })])).toEqual([]);
  });

  it.each([1, 2])("shows %i candidates without padding", (count) => {
    const tasks = Array.from({ length: count }, () => makeTask({ deadline: "2026-11-05" }));
    expect(run(tasks)).toHaveLength(count);
  });

  it("caps at 5 when more tasks qualify", () => {
    const tasks = Array.from({ length: 8 }, () => makeTask({ deadline: "2026-11-01" }));
    expect(run(tasks)).toHaveLength(5);
  });

  it("puts manual picks first, in the order added, and fills the rest", () => {
    const a = makeTask({ deadline: "2026-12-31" });
    const b = makeTask({ deadline: "2026-12-30" });
    const urgent = Array.from({ length: 6 }, () => makeTask({ deadline: "2026-11-02" }));
    const items = run(
      [a, b, ...urgent],
      [
        { taskId: b.id, createdAt: "2026-11-04T07:00:00Z" },
        { taskId: a.id, createdAt: "2026-11-04T09:00:00Z" },
      ],
    );
    expect(ids(items).slice(0, 2)).toEqual([b.id, a.id]);
    expect(items.map((item) => item.source)).toEqual([
      "pick",
      "pick",
      "recommended",
      "recommended",
      "recommended",
    ]);
  });

  it("drops picks of Done or missing tasks", () => {
    const done = makeTask({ status: "done", completedAt: "2026-11-04T08:00:00Z" });
    const items = run(
      [done],
      [
        { taskId: done.id, createdAt: "2026-11-04T07:00:00Z" },
        { taskId: "deleted", createdAt: "2026-11-04T07:00:00Z" },
      ],
    );
    expect(items).toEqual([]);
  });
});

describe("eligibility", () => {
  it("excludes Waiting and Done tasks", () => {
    const waiting = makeTask({ deadline: "2026-11-01", status: "waiting" });
    const done = makeTask({ deadline: "2026-11-01", status: "done", completedAt: "x" });
    expect(run([waiting, done])).toEqual([]);
  });

  it("excludes tasks whose start date is in the future", () => {
    expect(run([makeTask({ startDate: "2026-11-06", deadline: "2026-11-06" })])).toEqual([]);
    expect(run([makeTask({ startDate: today, deadline: "2026-11-06" })])).toHaveLength(1);
  });

  it("requires relevance: overdue, urgent, important or within 7 days", () => {
    expect(run([makeTask({ deadline: "2026-11-11" })])).toHaveLength(1);
    expect(run([makeTask({ deadline: "2026-11-12" })])).toHaveLength(0);
    expect(run([makeTask({ deadline: "2027-06-01", isImportant: true })])).toHaveLength(1);
    expect(run([makeTask({ deadline: "2027-06-01", urgentOverride: true })])).toHaveLength(1);
  });

  it("keeps an overdue task with urgent_override = false", () => {
    const items = run([makeTask({ deadline: "2026-11-02", urgentOverride: false })]);
    expect(items).toHaveLength(1);
    expect(items[0]!.reasonText).toBe("באיחור של יומיים");
  });

  it("skips dismissed tasks and refills the slot", () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({ deadline: `2026-11-0${i + 1}` }),
    );
    const first = run(tasks);
    const dismissedId = first[0]!.task.id;
    const after = run(tasks, [], [dismissedId]);
    expect(ids(after)).not.toContain(dismissedId);
    expect(after).toHaveLength(5);
  });
});

describe("ordering (MASTER_SPEC §6.3)", () => {
  const order = (...tasks: Task[]) => ids(run(tasks));

  it("1: overdue first", () => {
    const urgent = makeTask({ deadline: "2026-11-05", urgentOverride: true, isImportant: true });
    const overdue = makeTask({ deadline: "2026-11-03" });
    expect(order(urgent, overdue)).toEqual([overdue.id, urgent.id]);
  });

  it("2: effective urgent before non-urgent", () => {
    const important = makeTask({ deadline: "2026-11-07", isImportant: true });
    const urgent = makeTask({ deadline: "2026-11-05" });
    expect(order(important, urgent)).toEqual([urgent.id, important.id]);
  });

  it("2: urgent_override = false never lowers an overdue task", () => {
    const moreOverdueNotUrgent = makeTask({ deadline: "2026-11-01", urgentOverride: false });
    const lessOverdue = makeTask({ deadline: "2026-11-03" });
    expect(order(lessOverdue, moreOverdueNotUrgent)).toEqual([
      moreOverdueNotUrgent.id,
      lessOverdue.id,
    ]);
  });

  it("3: important first", () => {
    const plain = makeTask({ deadline: "2026-11-07" });
    const important = makeTask({ deadline: "2026-11-09", isImportant: true });
    expect(order(plain, important)).toEqual([important.id, plain.id]);
  });

  it("4: deadline ascending (most overdue first)", () => {
    const later = makeTask({ deadline: "2026-11-03" });
    const earlier = makeTask({ deadline: "2026-10-30" });
    expect(order(later, earlier)).toEqual([earlier.id, later.id]);
  });

  it("5: in_progress before todo", () => {
    const todo = makeTask({ deadline: "2026-11-07" });
    const inProgress = makeTask({ deadline: "2026-11-07", status: "in_progress" });
    expect(order(todo, inProgress)).toEqual([inProgress.id, todo.id]);
  });

  it("6: created_at ascending", () => {
    const newer = makeTask({ deadline: "2026-11-07", createdAt: "2026-10-02T00:00:00Z" });
    const older = makeTask({ deadline: "2026-11-07", createdAt: "2026-10-01T00:00:00Z" });
    expect(order(newer, older)).toEqual([older.id, newer.id]);
  });

  it("7: id ascending", () => {
    const b = makeTask({ id: "b", deadline: "2026-11-07" });
    const a = makeTask({ id: "a", deadline: "2026-11-07" });
    expect(order(b, a)).toEqual(["a", "b"]);
    expect(compareForToday(a, a, today)).toBe(0);
  });

  it("is deterministic for shuffled input", () => {
    const tasks = [
      makeTask({ deadline: "2026-11-01", urgentOverride: false }),
      makeTask({ deadline: "2026-11-03", isImportant: true }),
      makeTask({ deadline: "2026-11-04" }),
      makeTask({ deadline: "2026-11-05", status: "in_progress" }),
      makeTask({ deadline: "2026-11-05" }),
      makeTask({ deadline: "2026-11-09", isImportant: true }),
      makeTask({ deadline: "2026-11-09", createdAt: "2026-09-01T00:00:00Z" }),
      makeTask({ deadline: "2027-01-01", urgentOverride: true }),
    ];
    const expected = ids(run(tasks));
    for (const seed of [1, 2, 3, 42, 99]) expect(ids(run(shuffled(tasks, seed)))).toEqual(expected);
  });
});

describe("reasons (MASTER_SPEC §6.4)", () => {
  const reasonOf = (task: Task) => run([task])[0]!;

  it.each<[Partial<Task>, string]>([
    [{ deadline: "2026-11-01" }, "באיחור של 3 ימים"],
    [{ deadline: today }, "המועד היום"],
    [{ deadline: "2026-12-01", urgentOverride: true }, "סומנה כדחופה"],
    [{ deadline: "2026-11-05" }, "המועד מחר"],
    [{ deadline: "2026-11-16", isImportant: true }, "חשובה · המועד בעוד 12 ימים"],
    [{ deadline: "2026-11-05", urgentOverride: false, isImportant: true }, "חשובה · המועד מחר"],
    [{ deadline: "2026-11-08" }, "המועד בעוד 4 ימים"],
    [{ deadline: "2026-11-06" }, "המועד בעוד יומיים"],
  ])("%o → %s", (fields, text) => {
    expect(reasonOf(makeTask(fields)).reasonText).toBe(text);
  });

  it("shows the overdue indicator only when the reason isn't the overdue reason", () => {
    const overdue = makeTask({ deadline: "2026-11-02" });
    expect(run([overdue])[0]!.showOverdueIndicator).toBe(false);
    const picked = run([overdue], [{ taskId: overdue.id, createdAt: "2026-11-04T06:00:00Z" }])[0]!;
    expect(picked.reasonText).toBe("נבחרה ידנית");
    expect(picked.showOverdueIndicator).toBe(true);
  });

  it("marks a picked future-start task with its start date", () => {
    const future = makeTask({ startDate: "2026-11-10", deadline: "2026-11-20" });
    const [item] = run([future], [{ taskId: future.id, createdAt: "2026-11-04T06:00:00Z" }]);
    expect(item!.startsOn).toBe("2026-11-10");
  });

  it("has text for every reason code", () => {
    expect(reasonText({ code: "manual" })).toBe("נבחרה ידנית");
  });
});

describe("picks", () => {
  it("assigns the lowest free slot", () => {
    expect(nextPickSlot([])).toBe(1);
    expect(nextPickSlot([1, 2, 4])).toBe(3);
  });

  it("rejects a 6th pick", () => {
    expect(nextPickSlot([1, 2, 3, 4, 5])).toBeNull();
  });

  it("offers every non-Done, unpicked task, including Waiting and future-start", () => {
    const waiting = makeTask({ status: "waiting" });
    const future = makeTask({ startDate: "2026-12-01", deadline: "2026-12-05" });
    const done = makeTask({ status: "done", completedAt: "x" });
    const picked = makeTask();
    expect(ids(pickCandidates([waiting, future, done, picked], [picked.id]).map((task) => ({ task })))).toEqual([
      waiting.id,
      future.id,
    ]);
  });
});

describe("hybrid fill (Phase 7)", () => {
  const relevant = () => Array.from({ length: 8 }, () => makeTask({ deadline: "2026-11-05" }));
  const pick = (task: Task, minute: number): TodayPick => ({
    taskId: task.id,
    createdAt: `2026-11-04T08:${String(minute).padStart(2, "0")}:00.000Z`,
  });

  it("0 picks: up to 5 recommendations", () => {
    const items = run(relevant());
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.source === "recommended")).toBe(true);
  });

  it("3 picks: at most 2 recommendations", () => {
    const tasks = relevant();
    const items = run(tasks, [pick(tasks[0]!, 1), pick(tasks[1]!, 2), pick(tasks[2]!, 3)]);
    expect(items.map((item) => item.source)).toEqual(["pick", "pick", "pick", "recommended", "recommended"]);
  });

  it("5 picks: no recommendations", () => {
    const tasks = relevant();
    const items = run(tasks, tasks.slice(0, 5).map((task, index) => pick(task, index)));
    expect(items.map((item) => item.source)).toEqual(Array(5).fill("pick"));
  });

  it("a picked task that is also eligible appears once, as the pick", () => {
    const tasks = relevant();
    const items = run(tasks, [pick(tasks[0]!, 1)]);
    expect(ids(items).filter((id) => id === tasks[0]!.id)).toHaveLength(1);
    expect(new Set(ids(items)).size).toBe(items.length);
  });

  it("a manual pick wins over a dismissal of the same task", () => {
    const task = makeTask({ deadline: "2026-11-03" });
    const items = run([task], [pick(task, 1)], [task.id]);
    expect(items).toMatchObject([{ source: "pick", reasonText: "נבחרה ידנית", showOverdueIndicator: true }]);
  });

  it("a dismissal only hides the task for the day it belongs to", () => {
    const task = makeTask({ deadline: "2026-11-05" });
    // The data layer loads entries for one date; another day starts with none.
    expect(run([task], [], [task.id])).toEqual([]);
    expect(buildToday({ tasks: [task], picks: [], dismissedTaskIds: [], today: "2026-11-05" })).toHaveLength(1);
  });

  it("picks a Waiting or future-start task only manually", () => {
    const waiting = makeTask({ deadline: "2026-11-03", status: "waiting" });
    const future = makeTask({ deadline: "2026-11-20", startDate: "2026-11-10", isImportant: true });
    expect(run([waiting, future])).toEqual([]);
    const items = run([waiting, future], [pick(waiting, 1), pick(future, 2)]);
    expect(ids(items)).toEqual([waiting.id, future.id]);
    expect(items[1]!.startsOn).toBe("2026-11-10");
  });
});
