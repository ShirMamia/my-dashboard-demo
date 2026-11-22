"use server";

import { revalidatePath } from "next/cache";
import { isTaskStatus, type Task, type TaskStatus } from "@/domain/task";
import { editedTask, newTask } from "@/domain/task-edit";
import { isUuid } from "@/lib/uuid";
import { requireAuth } from "@/server/auth";
import { createTask, deleteTask, getTask, updateTask } from "@/server/data/tasks";
import {
  FORM_ERROR_SUMMARY,
  parseTaskForm,
  taskDataErrorToResult,
  type ActionResult,
} from "./task-form";

function revalidateTaskViews() {
  revalidatePath("/", "layout");
}

const NOT_FOUND = "המשימה לא נמצאה. ייתכן שנמחקה.";

export async function createTaskAction(
  _previous: ActionResult<{ id: string; title: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; title: string }>> {
  const auth = await requireAuth();
  const parsed = parseTaskForm(formData);
  if (!parsed.ok) return { ok: false, error: FORM_ERROR_SUMMARY, fieldErrors: parsed.fieldErrors };

  try {
    // Quick Create has no urgency field: new tasks always start automatic.
    const task = await createTask(auth, newTask(parsed.value.input, new Date()));
    revalidateTaskViews();
    return { ok: true, data: { id: task.id, title: task.title } };
  } catch (error) {
    return taskDataErrorToResult(error);
  }
}

export async function updateTaskAction(
  taskId: string,
  _previous: ActionResult<Task> | null,
  formData: FormData,
): Promise<ActionResult<Task>> {
  const auth = await requireAuth();
  const parsed = parseTaskForm(formData);
  if (!parsed.ok) return { ok: false, error: FORM_ERROR_SUMMARY, fieldErrors: parsed.fieldErrors };

  try {
    const previous = await getTask(auth, taskId);
    if (!previous) return { ok: false, error: NOT_FOUND };
    const next = editedTask(
      previous,
      { ...parsed.value.input, urgentOverride: parsed.value.urgentOverride },
      new Date(),
    );
    const saved = await updateTask(auth, taskId, next);
    revalidateTaskViews();
    return { ok: true, data: saved };
  } catch (error) {
    return taskDataErrorToResult(error);
  }
}

/**
 * Status change from a list (complete, reopen, undo). Returns the previous status so the
 * completion toast can undo it. Keeps the urgency override (MASTER_SPEC §5.2).
 */
export async function setTaskStatusAction(
  taskId: string,
  status: TaskStatus,
): Promise<ActionResult<{ previousStatus: TaskStatus }>> {
  if (!isTaskStatus(status)) return { ok: false, error: "סטטוס לא תקין." };
  const auth = await requireAuth();
  try {
    const previous = await getTask(auth, taskId);
    if (!previous) return { ok: false, error: NOT_FOUND };
    const next = editedTask(previous, { ...previous, status, urgentOverride: previous.urgentOverride }, new Date());
    await updateTask(auth, taskId, { status: next.status, completedAt: next.completedAt });
    revalidateTaskViews();
    return { ok: true, data: { previousStatus: previous.status } };
  } catch (error) {
    return taskDataErrorToResult(error);
  }
}

/**
 * Called from the task's own page. No revalidation: it would re-render that page as not-found
 * while the client navigates away (React #419); the caller navigates, then refreshes the router.
 */
export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  try {
    await deleteTask(auth, taskId);
    return { ok: true, data: undefined };
  } catch (error) {
    return taskDataErrorToResult(error);
  }
}

/** The quick "חשובה" action in a task row (UAT-05): sets is_important only. */
export async function setTaskImportantAction(taskId: string, important: boolean): Promise<ActionResult> {
  if (!isUuid(taskId)) return { ok: false, error: NOT_FOUND };
  if (typeof important !== "boolean") return { ok: false, error: "ערך לא תקין." };
  const auth = await requireAuth();
  try {
    // No match (missing, or another user's under RLS) is DataError("not_found").
    await updateTask(auth, taskId, { isImportant: important });
    revalidateTaskViews();
    return { ok: true, data: undefined };
  } catch (error) {
    return taskDataErrorToResult(error);
  }
}

/**
 * The quick "דחופה" action (UAT-05, domain/urgency.ts#quickUrgency): manually urgent (true) or
 * back to automatic (null). Never false: "manual not urgent" is set only in the edit form.
 */
export async function setTaskUrgentAction(taskId: string, urgentOverride: true | null): Promise<ActionResult> {
  if (!isUuid(taskId)) return { ok: false, error: NOT_FOUND };
  if (urgentOverride !== true && urgentOverride !== null) return { ok: false, error: "ערך לא תקין." };
  const auth = await requireAuth();
  try {
    await updateTask(auth, taskId, { urgentOverride });
    revalidateTaskViews();
    return { ok: true, data: undefined };
  } catch (error) {
    return taskDataErrorToResult(error);
  }
}
