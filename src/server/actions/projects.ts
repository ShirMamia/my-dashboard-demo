"use server";

import { revalidatePath } from "next/cache";
import { normalizeProjectName, validateProjectName, type Project } from "@/domain/project";
import { requireAuth } from "@/server/auth";
import { DataError } from "@/server/data/errors";
import { createProject, deleteProject, updateProject } from "@/server/data/projects";
import { isUuid } from "@/lib/uuid";
import { UNEXPECTED_ERROR, type ActionResult } from "./task-form";

const NOT_FOUND = "הפרויקט לא נמצא. ייתכן שנמחק.";

function projectError(error: unknown): ActionResult<never> {
  if (error instanceof DataError && error.code === "conflict") {
    return { ok: false, error: "כבר קיים פרויקט בשם הזה." };
  }
  if (error instanceof DataError && error.code === "not_found") return { ok: false, error: NOT_FOUND };
  if (error instanceof DataError && error.code === "invalid") return { ok: false, error: "שם הפרויקט אינו תקין." };
  console.error("Project action failed", error instanceof DataError ? error.code : error);
  return { ok: false, error: UNEXPECTED_ERROR };
}

function parseName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw : "";
  const error = validateProjectName(name);
  return error ? { ok: false, error } : { ok: true, name: normalizeProjectName(name) };
}

/** Projects feed pickers, the Tasks list, search and (later) Dashboard, Calendar and Gantt. */
function revalidateProjectViews() {
  revalidatePath("/", "layout");
}

export async function createProjectAction(name: string): Promise<ActionResult<Project>> {
  const parsed = parseName(name);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const auth = await requireAuth();
  try {
    const project = await createProject(auth, parsed.name);
    revalidateProjectViews();
    return { ok: true, data: project };
  } catch (error) {
    return projectError(error);
  }
}

export async function renameProjectAction(id: string, name: string): Promise<ActionResult<Project>> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const parsed = parseName(name);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const auth = await requireAuth();
  try {
    const project = await updateProject(auth, id, { name: parsed.name });
    revalidateProjectViews();
    return { ok: true, data: project };
  } catch (error) {
    return projectError(error);
  }
}

/** Archive or restore. Tasks keep every field, including their project. */
export async function setProjectArchivedAction(id: string, archived: boolean): Promise<ActionResult<Project>> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const auth = await requireAuth();
  try {
    const project = await updateProject(auth, id, { archivedAt: archived ? new Date().toISOString() : null });
    revalidateProjectViews();
    return { ok: true, data: project };
  } catch (error) {
    return projectError(error);
  }
}

/** Hard delete after confirmation; tasks, templates and planning items stay, without the project. */
/**
 * No revalidation here: it would re-render the current page, which is the deleted project's,
 * and that page's not-found could race the client's navigation (React #419). The caller
 * navigates to the list and then refreshes the router instead.
 */
export async function deleteProjectAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const auth = await requireAuth();
  try {
    await deleteProject(auth, id);
    return { ok: true, data: undefined };
  } catch (error) {
    return projectError(error);
  }
}

/**
 * Complete or reopen (UAT-03). Only the project changes: its tasks keep every field, and its
 * archive state is untouched (a completed project can be archived, and restoring keeps it
 * completed). Reopening clears the completion.
 */
export async function setProjectCompletedAction(id: string, completed: boolean): Promise<ActionResult<Project>> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  if (typeof completed !== "boolean") return { ok: false, error: UNEXPECTED_ERROR };
  const auth = await requireAuth();
  try {
    const project = await updateProject(auth, id, { completedAt: completed ? new Date().toISOString() : null });
    revalidateProjectViews();
    return { ok: true, data: project };
  } catch (error) {
    return projectError(error);
  }
}
