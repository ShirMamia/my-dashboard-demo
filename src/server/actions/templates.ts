"use server";

import { revalidatePath } from "next/cache";
import {
  normalizeTemplate,
  validateTemplate,
  type Template,
  type TemplateFieldErrors,
  type TemplateInput,
} from "@/domain/template";
import { isUuid } from "@/lib/uuid";
import { requireAuth } from "@/server/auth";
import { DataError } from "@/server/data/errors";
import { createTemplate, deleteTemplate, updateTemplate } from "@/server/data/templates";
import { UNEXPECTED_ERROR } from "./task-form";

// Templates (MASTER_SPEC §9). Instantiation is not here: it uses the ordinary task creation
// action with the pre-filled form, so the new task is a normal, independent task.

export type TemplateActionResult =
  | { ok: true; data: Template }
  | { ok: false; error: string; fieldErrors?: TemplateFieldErrors };

const NOT_FOUND = "התבנית לא נמצאה. ייתכן שנמחקה.";
const FIELDS_SUMMARY = "לא ניתן לשמור. יש לתקן את השדות המסומנים.";

function templateError(error: unknown): { ok: false; error: string; fieldErrors?: TemplateFieldErrors } {
  if (error instanceof DataError && error.code === "conflict") {
    return { ok: false, error: FIELDS_SUMMARY, fieldErrors: { name: "כבר קיימת תבנית בשם הזה." } };
  }
  if (error instanceof DataError && error.code === "not_found") return { ok: false, error: NOT_FOUND };
  // A foreign-key or check failure: a project/category that is gone or isn't the user's.
  if (error instanceof DataError && error.code === "invalid") {
    return { ok: false, error: "הפרויקט או הקטגוריה שנבחרו לא נמצאו. יש לבחור שוב." };
  }
  console.error("Template action failed", error instanceof DataError ? error.code : error);
  return { ok: false, error: UNEXPECTED_ERROR };
}

/** Untrusted client input → a validated, normalized template, or field errors. */
function parseInput(raw: TemplateInput): { ok: true; input: TemplateInput } | { ok: false; result: TemplateActionResult } {
  const shaped: TemplateInput = {
    name: typeof raw?.name === "string" ? raw.name : "",
    title: typeof raw?.title === "string" ? raw.title : "",
    notes: typeof raw?.notes === "string" ? raw.notes : null,
    isImportant: raw?.isImportant === true,
    projectId: raw?.projectId ?? null,
    categoryId: raw?.categoryId ?? null,
  };
  if ((shaped.projectId !== null && !isUuid(shaped.projectId)) || (shaped.categoryId !== null && !isUuid(shaped.categoryId))) {
    return { ok: false, result: { ok: false, error: "הפרויקט או הקטגוריה שנבחרו לא נמצאו. יש לבחור שוב." } };
  }
  const fieldErrors = validateTemplate(shaped);
  if (fieldErrors.name || fieldErrors.title) {
    return { ok: false, result: { ok: false, error: FIELDS_SUMMARY, fieldErrors } };
  }
  return { ok: true, input: normalizeTemplate(shaped) };
}

function revalidateTemplateViews() {
  // The Templates view and search results.
  revalidatePath("/", "layout");
}

export async function createTemplateAction(raw: TemplateInput): Promise<TemplateActionResult> {
  const parsed = parseInput(raw);
  if (!parsed.ok) return parsed.result;
  const auth = await requireAuth();
  try {
    const template = await createTemplate(auth, parsed.input);
    revalidateTemplateViews();
    return { ok: true, data: template };
  } catch (error) {
    return templateError(error);
  }
}

export async function updateTemplateAction(id: string, raw: TemplateInput): Promise<TemplateActionResult> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const parsed = parseInput(raw);
  if (!parsed.ok) return parsed.result;
  const auth = await requireAuth();
  try {
    const template = await updateTemplate(auth, id, parsed.input);
    revalidateTemplateViews();
    return { ok: true, data: template };
  } catch (error) {
    return templateError(error);
  }
}

export async function deleteTemplateAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const auth = await requireAuth();
  try {
    await deleteTemplate(auth, id);
    revalidateTemplateViews();
    return { ok: true };
  } catch (error) {
    return templateError(error);
  }
}
