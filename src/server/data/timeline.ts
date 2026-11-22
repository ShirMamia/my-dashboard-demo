import "server-only";
import type { DateOnly } from "@/domain/dates";
import type { TimelinePlanningItem, TimelineTask } from "@/domain/timeline";
import type { AuthContext } from "@/server/auth";
import { unwrap } from "./errors";

// Timeline reads load only the visible range and only the fields the view draws: one query for
// tasks, one for planning items. Done tasks are included; the domain filter decides visibility.

/** PostgREST filter values are quoted so dates parse as single values. */
const q = (value: string) => `"${value}"`;

/**
 * Tasks whose start → deadline interval (or deadline alone) overlaps [from, to]: the deadline is
 * on or after `from`, and the start (the deadline when there is none) on or before `to`.
 */
export async function listTimelineTasks({ db, userId }: AuthContext, from: DateOnly, to: DateOnly): Promise<TimelineTask[]> {
  const rows = unwrap(
    await db
      .from("tasks")
      .select("id, title, status, start_date, deadline, project_id")
      .eq("user_id", userId)
      .gte("deadline", from)
      .or(`start_date.lte.${q(to)},and(start_date.is.null,deadline.lte.${q(to)})`)
      .order("deadline")
      .order("id"),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    startDate: row.start_date,
    deadline: row.deadline,
    projectId: row.project_id,
  }));
}

export async function listTimelinePlanningItems(
  { db, userId }: AuthContext,
  from: DateOnly,
  to: DateOnly,
): Promise<TimelinePlanningItem[]> {
  const rows = unwrap(
    await db
      .from("planning_items")
      .select("id, title, date, project_id")
      .eq("user_id", userId)
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("id"),
  );
  return rows.map((row) => ({ id: row.id, title: row.title, date: row.date, projectId: row.project_id }));
}
