import "server-only";
import { addDays, type DateOnly } from "@/domain/dates";
import type { Task, TaskStatus, TaskSummary } from "@/domain/task";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/server/auth";
import { DataError, toDataError, unwrap, unwrapMaybe } from "./errors";

type TaskRow = Tables<"tasks">;

const TASK_COLUMNS =
  "id, title, notes, status, is_important, urgent_override, deadline, start_date, scheduled_at, project_id, category_id, completed_at, created_at";

/** PostgREST returns `date` columns as YYYY-MM-DD strings, so date-only values pass through untouched. */
function summaryFromRow(row: Omit<TaskRow, "user_id" | "updated_at" | "notes">): TaskSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    isImportant: row.is_important,
    urgentOverride: row.urgent_override,
    deadline: row.deadline,
    startDate: row.start_date,
    scheduledAt: row.scheduled_at,
    projectId: row.project_id,
    categoryId: row.category_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function taskFromRow(row: Omit<TaskRow, "user_id" | "updated_at">): Task {
  return { ...summaryFromRow(row), notes: row.notes };
}

/** Writable task fields. The caller applies domain rules (status ↔ completedAt, override clearing). */
export type TaskInput = Omit<Task, "id" | "createdAt">;

function toRow(input: Partial<TaskInput>): TablesUpdate<"tasks"> {
  const row: TablesUpdate<"tasks"> = {};
  if (input.title !== undefined) row.title = input.title;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.status !== undefined) row.status = input.status;
  if (input.isImportant !== undefined) row.is_important = input.isImportant;
  if (input.urgentOverride !== undefined) row.urgent_override = input.urgentOverride;
  if (input.deadline !== undefined) row.deadline = input.deadline;
  if (input.startDate !== undefined) row.start_date = input.startDate;
  if (input.scheduledAt !== undefined) row.scheduled_at = input.scheduledAt;
  if (input.projectId !== undefined) row.project_id = input.projectId;
  if (input.categoryId !== undefined) row.category_id = input.categoryId;
  if (input.completedAt !== undefined) row.completed_at = input.completedAt;
  return row;
}

export interface TaskFilter {
  statuses?: readonly TaskStatus[];
  projectId?: string;
  categoryId?: string;
}

export async function listTasks({ db, userId }: AuthContext, filter: TaskFilter = {}): Promise<Task[]> {
  let query = db.from("tasks").select(TASK_COLUMNS).eq("user_id", userId);
  if (filter.statuses) query = query.in("status", [...filter.statuses]);
  if (filter.projectId) query = query.eq("project_id", filter.projectId);
  if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
  const rows = unwrap(await query.order("deadline").order("created_at").order("id"));
  return rows.map(taskFromRow);
}

// The Dashboard never shows notes, so its loads skip that column.
const SUMMARY_COLUMNS =
  "id, title, status, is_important, urgent_override, deadline, start_date, scheduled_at, project_id, category_id, completed_at, created_at";

/** Non-Done tasks: the Dashboard's main load (Today, sections, Open/Overdue KPIs, the pick picker). */
export async function listOpenTaskSummaries({ db, userId }: AuthContext): Promise<TaskSummary[]> {
  const rows = unwrap(
    await db
      .from("tasks")
      .select(SUMMARY_COLUMNS)
      .eq("user_id", userId)
      .neq("status", "done")
      .order("deadline")
      .order("created_at")
      .order("id"),
  );
  return rows.map(summaryFromRow);
}

/**
 * Done tasks completed in the app-zone week starting `weekStart` (Sunday). The lower bound is
 * widened by a day so no Jerusalem-local completion is missed; the domain applies the exact week.
 */
export async function listCompletedSummariesSince(
  { db, userId }: AuthContext,
  weekStart: DateOnly,
): Promise<TaskSummary[]> {
  const rows = unwrap(
    await db
      .from("tasks")
      .select(SUMMARY_COLUMNS)
      .eq("user_id", userId)
      .eq("status", "done")
      .gte("completed_at", `${addDays(weekStart, -1)}T00:00:00Z`),
  );
  return rows.map(summaryFromRow);
}

export async function getTask({ db, userId }: AuthContext, id: string): Promise<Task | null> {
  const row = unwrapMaybe(
    await db.from("tasks").select(TASK_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle(),
  );
  return row ? taskFromRow(row) : null;
}

export async function createTask({ db, userId }: AuthContext, input: TaskInput): Promise<Task> {
  const row: TablesInsert<"tasks"> = {
    ...toRow(input),
    user_id: userId,
    title: input.title,
    deadline: input.deadline,
  };
  return taskFromRow(unwrap(await db.from("tasks").insert(row).select(TASK_COLUMNS).single()));
}

export async function updateTask(
  { db, userId }: AuthContext,
  id: string,
  changes: Partial<TaskInput>,
): Promise<Task> {
  return taskFromRow(
    unwrap(
      await db
        .from("tasks")
        .update(toRow(changes))
        .eq("user_id", userId)
        .eq("id", id)
        .select(TASK_COLUMNS)
        .single(),
    ),
  );
}

export async function deleteTask({ db, userId }: AuthContext, id: string): Promise<void> {
  const { count, error } = await db
    .from("tasks")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw toDataError(error);
  if (count === 0) throw new DataError("not_found", "Task not found");
}
