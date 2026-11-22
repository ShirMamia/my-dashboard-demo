import "server-only";
import type { Task } from "@/domain/task";
import type { AuthContext } from "@/server/auth";
import { unwrap } from "./errors";
import { taskFromRow } from "./tasks";

// Global search (MASTER_SPEC §13): case-insensitive substring match, server-side, RLS-scoped.
// No Hebrew normalization (niqqud, final letters) in the MVP.

export const SEARCH_RESULT_LIMIT = 50;
export const SEARCH_QUERY_MAX_LENGTH = 200;

export interface SearchResults {
  tasks: Task[];
  projects: { id: string; name: string; archivedAt: string | null; completedAt: string | null }[];
  templates: { id: string; name: string; title: string }[];
  planningItems: { id: string; title: string; date: string }[];
  events: { id: string; title: string; startDate: string | null; startsAt: string | null; yearly: boolean }[];
}

/** `%`, `_` and `\` are ilike wildcards/escape; match them literally. */
export function ilikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const TASK_COLUMNS =
  "id, title, notes, status, is_important, urgent_override, deadline, start_date, scheduled_at, project_id, category_id, completed_at, created_at";

export async function searchAll({ db, userId }: AuthContext, rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
  const empty: SearchResults = { tasks: [], projects: [], templates: [], planningItems: [], events: [] };
  if (!query) return empty;
  const pattern = ilikePattern(query);

  // Title and notes are separate queries (no string-built `or()` filter), merged by id.
  const [taskTitles, taskNotes, projects, templates, planningItems, events] = await Promise.all([
    db.from("tasks").select(TASK_COLUMNS).eq("user_id", userId).ilike("title", pattern).limit(SEARCH_RESULT_LIMIT),
    db.from("tasks").select(TASK_COLUMNS).eq("user_id", userId).ilike("notes", pattern).limit(SEARCH_RESULT_LIMIT),
    db
      .from("projects")
      .select("id, name, archived_at, completed_at")
      .eq("user_id", userId)
      .ilike("name", pattern)
      .order("name")
      .limit(SEARCH_RESULT_LIMIT),
    db
      .from("task_templates")
      .select("id, name, title")
      .eq("user_id", userId)
      .ilike("name", pattern)
      .order("name")
      .limit(SEARCH_RESULT_LIMIT),
    db
      .from("planning_items")
      .select("id, title, date")
      .eq("user_id", userId)
      .ilike("title", pattern)
      .order("date")
      .limit(SEARCH_RESULT_LIMIT),
    db
      .from("calendar_events")
      .select("id, title, start_date, starts_at, recurrence")
      .eq("user_id", userId)
      .ilike("title", pattern)
      .order("start_date")
      .limit(SEARCH_RESULT_LIMIT),
  ]);

  const byId = new Map<string, Task>();
  for (const row of [...unwrap(taskTitles), ...unwrap(taskNotes)]) byId.set(row.id, taskFromRow(row));
  // Open tasks first, then by deadline; Done tasks are included and marked in the UI.
  const tasks = [...byId.values()]
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        a.deadline.localeCompare(b.deadline) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, SEARCH_RESULT_LIMIT);

  return {
    tasks,
    projects: unwrap(projects).map((row) => ({ id: row.id, name: row.name, archivedAt: row.archived_at, completedAt: row.completed_at })),
    templates: unwrap(templates),
    planningItems: unwrap(planningItems),
    events: unwrap(events).map((row) => ({
      id: row.id,
      title: row.title,
      startDate: row.start_date,
      startsAt: row.starts_at,
      yearly: row.recurrence === "yearly",
    })),
  };
}
