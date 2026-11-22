// Derived project progress; never stored (MASTER_SPEC §8).

import type { DateOnly } from "./dates";
import { isOverdue, type Task } from "./task";

export interface ProjectProgress {
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** done / total, or null for a project with no tasks. */
  ratio: number | null;
  text: string;
}

export function projectProgress(
  tasks: readonly Pick<Task, "status" | "deadline">[],
  today: DateOnly,
): ProjectProgress {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const overdue = tasks.filter((task) => isOverdue(task, today)).length;
  return {
    total,
    done,
    open: total - done,
    overdue,
    ratio: total === 0 ? null : done / total,
    text: total === 0 ? "אין משימות עדיין" : `${done} מתוך ${total} הושלמו`,
  };
}
