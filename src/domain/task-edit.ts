// Turning form input into task writes, applying the task rules (MASTER_SPEC §4, §5.2, §14).

import { applyStatusChange, type Task, type TaskStatus } from "./task";
import { urgentOverrideAfterEdit } from "./urgency";

/** Fields a user can set. `urgentOverride` exists only in the edit form (no urgency in Quick Create). */
export interface TaskFormInput {
  title: string;
  notes: string | null;
  status: TaskStatus;
  isImportant: boolean;
  deadline: string;
  startDate: string | null;
  scheduledAt: string | null;
  projectId: string | null;
  categoryId: string | null;
}

export type TaskWrite = Omit<Task, "id" | "createdAt">;

/** A new task: Done tasks get completedAt; urgency starts automatic. */
export function newTask(input: TaskFormInput, now: Date): TaskWrite {
  return {
    ...normalize(input),
    urgentOverride: null,
    completedAt: input.status === "done" ? now.toISOString() : null,
  };
}

/**
 * An edit of `previous`:
 * - a changed deadline clears the urgency override (§5.2), whatever the form sent;
 * - entering/leaving Done sets/clears completedAt; a status change alone keeps the override.
 */
export function editedTask(
  previous: Task,
  input: TaskFormInput & { urgentOverride: boolean | null },
  now: Date,
): TaskWrite {
  const { status, completedAt } = applyStatusChange(previous, input.status, now);
  return {
    ...normalize(input),
    status,
    completedAt,
    urgentOverride: urgentOverrideAfterEdit(previous, input),
  };
}

function normalize(input: TaskFormInput) {
  const notes = input.notes?.trim() ?? "";
  return {
    title: input.title.trim(),
    notes: notes === "" ? null : notes,
    status: input.status,
    isImportant: input.isImportant,
    deadline: input.deadline,
    startDate: input.startDate,
    scheduledAt: input.scheduledAt,
    projectId: input.projectId,
    categoryId: input.categoryId,
  };
}
