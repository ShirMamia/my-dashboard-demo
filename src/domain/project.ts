// Project rules (MASTER_SPEC §8). Progress is derived from tasks, never stored.

import type { DateOnly } from "./dates";
import { projectProgress, type ProjectProgress } from "./project-progress";
import type { Task } from "./task";

export const PROJECT_NAME_MAX_LENGTH = 100;

export interface Project {
  id: string;
  name: string;
  /** ISO instant; archived projects are hidden from pickers, their tasks remain. */
  archivedAt: string | null;
  /** ISO instant; the owner marked the project completed. Independent of archivedAt. */
  completedAt: string | null;
  createdAt: string;
}

// ── Lifecycle (MASTER_SPEC §8, UAT-03) ──────────────────────────────────────────────────────
// Completed (business: the project is finished) and archived (visibility) are independent
// fields. The list view shows each project once: archived wins, then completed, else active.
// Completing never changes tasks, and progress never completes a project by itself.

export type ProjectLifecycle = "active" | "completed" | "archived";

export const LIFECYCLE_LABELS: Record<ProjectLifecycle, string> = { active: "פעילים", completed: "הושלמו", archived: "ארכיון" };

export function projectLifecycle(project: Pick<Project, "archivedAt" | "completedAt">): ProjectLifecycle {
  if (project.archivedAt !== null) return "archived";
  return project.completedAt !== null ? "completed" : "active";
}

/** Only active projects are offered for new work (task, template, planning item pickers). */
export function isAssignableProject(project: Pick<Project, "archivedAt" | "completedAt">): boolean {
  return projectLifecycle(project) === "active";
}

/**
 * The mark after a project's name where a completed or archived project still appears (a
 * template's or planning item's project, kept selectable for that one record): "" when active.
 */
export function projectSuffix(project: Pick<Project, "archivedAt" | "completedAt">): string {
  const lifecycle = projectLifecycle(project);
  return lifecycle === "archived" ? " (בארכיון)" : lifecycle === "completed" ? " (הושלם)" : "";
}

/** The "פעילים / הושלמו / ארכיון" URL param: anything else is the active list. */
export function parseLifecycleParam(value: string | undefined): ProjectLifecycle {
  return value === "completed" || value === "archived" ? value : "active";
}

/**
 * The confirmation before completing a project that still has open tasks (they stay as they
 * are), or null when there are none and no warning is needed.
 */
export function openTasksWarning(openCount: number): string | null {
  if (openCount <= 0) return null;
  return openCount === 1
    ? "לפרויקט נשארה משימה פתוחה אחת. לסמן את הפרויקט כהושלם בכל זאת?"
    : `לפרויקט נשארו ${openCount} משימות פתוחות. לסמן את הפרויקט כהושלם בכל זאת?`;
}

/** Names are trimmed; 1–100 characters (DB check `char_length(name) between 1 and 100`). */
export function normalizeProjectName(name: string): string {
  return name.trim();
}

export function validateProjectName(name: string): string | null {
  const normalized = normalizeProjectName(name);
  if (normalized.length === 0) return "יש להזין שם לפרויקט.";
  if (normalized.length > PROJECT_NAME_MAX_LENGTH) {
    return `שם הפרויקט יכול להכיל עד ${PROJECT_NAME_MAX_LENGTH} תווים.`;
  }
  return null;
}

export const EMPTY_PROGRESS: ProjectProgress = projectProgress([], "1970-01-01");

/**
 * Progress for every project in one pass over the user's tasks (one query, no N+1).
 * Projects without tasks get the empty progress ("אין משימות עדיין").
 */
export function progressByProject(
  projectIds: readonly string[],
  tasks: readonly Pick<Task, "projectId" | "status" | "deadline">[],
  today: DateOnly,
): Map<string, ProjectProgress> {
  const grouped = new Map<string, Pick<Task, "status" | "deadline">[]>(projectIds.map((id) => [id, []]));
  for (const task of tasks) {
    if (task.projectId) grouped.get(task.projectId)?.push(task);
  }
  return new Map([...grouped].map(([id, projectTasks]) => [id, projectProgress(projectTasks, today)]));
}

/** Whole percent for the optional bar; null when there are no tasks (never a misleading 100%). */
export function progressPercent(progress: Pick<ProjectProgress, "ratio">): number | null {
  return progress.ratio === null ? null : Math.round(progress.ratio * 100);
}

const nameCollator = new Intl.Collator("he", { sensitivity: "base", numeric: true });

/** Active projects first, each group by name (Hebrew-aware), then id: deterministic. */
export function sortProjects<T extends Pick<Project, "id" | "name" | "archivedAt">>(projects: readonly T[]): T[] {
  return [...projects].sort(
    (a, b) =>
      Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
      nameCollator.compare(a.name, b.name) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
