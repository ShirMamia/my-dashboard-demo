// Task templates (MASTER_SPEC §9). A template creates exactly one independent task: the task
// keeps no link to it, so editing or deleting a template never changes earlier tasks.

import { addDays, type DateOnly } from "./dates";
import { TITLE_MAX_LENGTH, type TaskStatus } from "./task";

export const TEMPLATE_NAME_MAX_LENGTH = 100;

export interface Template {
  id: string;
  name: string;
  /** The created task's title. */
  title: string;
  notes: string | null;
  isImportant: boolean;
  projectId: string | null;
  categoryId: string | null;
}

export type TemplateInput = Omit<Template, "id">;

export interface TemplateFieldErrors {
  name?: string;
  title?: string;
}

/** Trims the text fields; empty notes become null (DB checks: name 1–100, title 1–200). */
export function normalizeTemplate(input: TemplateInput): TemplateInput {
  const notes = input.notes?.trim() ?? "";
  return { ...input, name: input.name.trim(), title: input.title.trim(), notes: notes === "" ? null : notes };
}

export function validateTemplate(input: Pick<TemplateInput, "name" | "title">): TemplateFieldErrors {
  const errors: TemplateFieldErrors = {};
  const name = input.name.trim();
  const title = input.title.trim();
  if (name.length === 0) errors.name = "יש להזין שם לתבנית.";
  else if (name.length > TEMPLATE_NAME_MAX_LENGTH)
    errors.name = `שם התבנית יכול להכיל עד ${TEMPLATE_NAME_MAX_LENGTH} תווים.`;
  if (title.length === 0) errors.title = "יש להזין כותרת למשימה.";
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `הכותרת יכולה להכיל עד ${TITLE_MAX_LENGTH} תווים.`;
  return errors;
}

const nameCollator = new Intl.Collator("he", { sensitivity: "base", numeric: true });

/** By name (Hebrew-aware), then id: a deterministic list order. */
export function sortTemplates<T extends Pick<Template, "id" | "name">>(templates: readonly T[]): T[] {
  return [...templates].sort(
    (a, b) => nameCollator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface TemplateTaskValues {
  title: string;
  notes: string;
  isImportant: boolean;
  projectId: string | null;
  categoryId: string | null;
  deadline: DateOnly;
  status: TaskStatus;
}

/**
 * "יצירת משימה מתבנית": the pre-filled, still editable task form (MASTER_SPEC §9).
 * Deadline = today + the default horizon; status = To Do. A project that is archived (or no
 * longer offered) is left empty, and `projectDropped` lets the form say so.
 */
export function templateTaskValues(
  template: Pick<Template, "title" | "notes" | "isImportant" | "projectId" | "categoryId">,
  context: { today: DateOnly; horizonDays: number; activeProjectIds: ReadonlySet<string> },
): { values: TemplateTaskValues; projectDropped: boolean } {
  const projectDropped = template.projectId !== null && !context.activeProjectIds.has(template.projectId);
  return {
    values: {
      title: template.title,
      notes: template.notes ?? "",
      isImportant: template.isImportant,
      projectId: projectDropped ? null : template.projectId,
      categoryId: template.categoryId,
      deadline: addDays(context.today, context.horizonDays),
      status: "todo",
    },
    projectDropped,
  };
}
