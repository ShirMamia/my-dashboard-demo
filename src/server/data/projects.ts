import "server-only";
import { sortProjects, type Project } from "@/domain/project";
import type { Task } from "@/domain/task";
import type { Tables } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/server/auth";
import { DataError, toDataError, unwrap, unwrapMaybe } from "./errors";

export type { Project };

const PROJECT_COLUMNS = "id, name, archived_at, completed_at, created_at";

function projectFromRow(row: Pick<Tables<"projects">, "id" | "name" | "archived_at" | "completed_at" | "created_at">): Project {
  return { id: row.id, name: row.name, archivedAt: row.archived_at, completedAt: row.completed_at, createdAt: row.created_at };
}

export async function listProjects(
  { db, userId }: AuthContext,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<Project[]> {
  let query = db.from("projects").select(PROJECT_COLUMNS).eq("user_id", userId);
  if (!includeArchived) query = query.is("archived_at", null);
  return sortProjects(unwrap(await query).map(projectFromRow));
}

export async function getProject({ db, userId }: AuthContext, id: string): Promise<Project | null> {
  const row = unwrapMaybe(
    await db.from("projects").select(PROJECT_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle(),
  );
  return row ? projectFromRow(row) : null;
}

/**
 * The fields project progress needs, for every task that belongs to a project: one query for
 * the whole Projects list (no per-project N+1). Grouped and counted in the domain.
 */
export async function listProjectTaskStats(
  { db, userId }: AuthContext,
): Promise<Pick<Task, "projectId" | "status" | "deadline">[]> {
  const rows = unwrap(
    await db
      .from("tasks")
      .select("project_id, status, deadline")
      .eq("user_id", userId)
      .not("project_id", "is", null),
  );
  return rows.map((row) => ({ projectId: row.project_id, status: row.status, deadline: row.deadline }));
}

export async function listProjectPlanningItems(
  { db, userId }: AuthContext,
  projectId: string,
): Promise<{ id: string; title: string; date: string }[]> {
  return unwrap(
    await db
      .from("planning_items")
      .select("id, title, date")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("date")
      .order("id"),
  );
}

export async function createProject({ db, userId }: AuthContext, name: string): Promise<Project> {
  return projectFromRow(
    unwrap(await db.from("projects").insert({ user_id: userId, name }).select(PROJECT_COLUMNS).single()),
  );
}

/** Only the project's own fields; its tasks are never touched. */
export async function updateProject(
  { db, userId }: AuthContext,
  id: string,
  changes: { name?: string; archivedAt?: string | null; completedAt?: string | null },
): Promise<Project> {
  return projectFromRow(
    unwrap(
      await db
        .from("projects")
        .update({ name: changes.name, archived_at: changes.archivedAt, completed_at: changes.completedAt })
        .eq("user_id", userId)
        .eq("id", id)
        .select(PROJECT_COLUMNS)
        .single(),
    ),
  );
}

/**
 * Hard delete (MASTER_SPEC §8 proposed default). The composite FKs `ON DELETE SET NULL (project_id)`
 * clear the project from its tasks, templates and planning items; nothing else is deleted.
 */
export async function deleteProject({ db, userId }: AuthContext, id: string): Promise<void> {
  const { count, error } = await db
    .from("projects")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw toDataError(error);
  if (count === 0) throw new DataError("not_found", "Project not found");
}
