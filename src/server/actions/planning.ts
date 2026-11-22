"use server";

import { revalidatePath } from "next/cache";
import { todayInAppZone, type DateOnly } from "@/domain/dates";
import {
  parsePlanningForm,
  preparationDeadline,
  validatePreparationTitle,
  type PlanningFieldErrors,
  type PlanningFormValues,
  type PlanningItem,
} from "@/domain/planning";
import { isUuid } from "@/lib/uuid";
import { requireAuth, type AuthContext } from "@/server/auth";
import { DataError } from "@/server/data/errors";
import { createPlanningItem, createPreparationTask, deletePlanningItem, getPlanningItem, updatePlanningItem } from "@/server/data/planning";
import { UNEXPECTED_ERROR } from "./task-form";

// Planning items (MASTER_SPEC §11). Validation runs here, on untrusted input. The preparation
// task is created through the ordinary task data layer: afterwards it is an independent task.

export type PreparationResult = { deadline: DateOnly; clamped: boolean };

export type PlanningActionResult =
  | { ok: true; data: PlanningItem; preparation?: PreparationResult; preparationError?: string }
  | { ok: false; error: string; fieldErrors?: PlanningFieldErrors };

const NOT_FOUND = "פריט התכנון לא נמצא. ייתכן שנמחק.";
const FIELDS_SUMMARY = "לא ניתן לשמור. יש לתקן את השדות המסומנים.";
const BAD_REFERENCE = "הפרויקט או הקטגוריה שנבחרו לא נמצאו. יש לבחור שוב.";
const ALREADY_PREPARED = "לפריט הזה כבר יש משימת הכנה.";

function planningError(error: unknown): { ok: false; error: string } {
  if (error instanceof DataError && error.code === "not_found") return { ok: false, error: NOT_FOUND };
  if (error instanceof DataError && error.code === "conflict") return { ok: false, error: ALREADY_PREPARED };
  if (error instanceof DataError && error.code === "invalid") return { ok: false, error: BAD_REFERENCE };
  console.error("Planning action failed", error instanceof DataError ? error.code : error);
  return { ok: false, error: UNEXPECTED_ERROR };
}

function shape(raw: PlanningFormValues): PlanningFormValues | null {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const ref = (value: unknown) => (value === null || value === undefined || value === "" ? null : value);
  const projectId = ref(raw?.projectId);
  const categoryId = ref(raw?.categoryId);
  if ((projectId !== null && !isUuid(projectId)) || (categoryId !== null && !isUuid(categoryId))) return null;
  return {
    title: text(raw?.title),
    date: text(raw?.date),
    notes: text(raw?.notes),
    prepLeadDays: text(raw?.prepLeadDays),
    projectId: projectId as string | null,
    categoryId: categoryId as string | null,
  };
}

function revalidatePlanningViews() {
  // The list, the Calendar, project pages, search, and (with a preparation task) every task view.
  revalidatePath("/", "layout");
}

async function prepare(auth: AuthContext, item: PlanningItem, title: string): Promise<PreparationResult> {
  const { deadline, clamped } = preparationDeadline(item.date, item.prepLeadDays, todayInAppZone());
  await createPreparationTask(auth, item, title, deadline);
  return { deadline, clamped };
}

/**
 * Create or edit an item. On create, `preparation.create` also generates the preparation task
 * ("צור משימת הכנה", unchecked by default). Editing never touches an existing task.
 */
export async function savePlanningItemAction(
  id: string | null,
  raw: PlanningFormValues,
  preparation?: { create: boolean; title: string },
): Promise<PlanningActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: NOT_FOUND };
  const shaped = shape(raw);
  if (!shaped) return { ok: false, error: BAD_REFERENCE };
  const parsed = parsePlanningForm(shaped);
  const wantsTask = id === null && preparation?.create === true;
  const prepTitle = typeof preparation?.title === "string" ? preparation.title : "";
  const prepTitleError = wantsTask ? validatePreparationTitle(prepTitle) : null;
  if (!parsed.ok || prepTitleError) {
    return {
      ok: false,
      error: FIELDS_SUMMARY,
      fieldErrors: { ...(parsed.ok ? {} : parsed.errors), ...(prepTitleError ? { prepTitle: prepTitleError } : {}) },
    };
  }
  const auth = await requireAuth();
  let item: PlanningItem;
  try {
    item = id === null ? await createPlanningItem(auth, parsed.input) : await updatePlanningItem(auth, id, parsed.input);
  } catch (error) {
    return planningError(error);
  }
  let result: PlanningActionResult = { ok: true, data: item };
  if (wantsTask) {
    try {
      result = { ok: true, data: item, preparation: await prepare(auth, item, prepTitle) };
    } catch (error) {
      // The item exists; the task can still be generated from its row.
      result = { ok: true, data: item, preparationError: planningError(error).error };
    }
  }
  revalidatePlanningViews();
  return result;
}

/** "צור משימת הכנה" for an existing item without one (also after its task was deleted). */
export async function createPreparationTaskAction(
  itemId: string,
  title: string,
): Promise<{ ok: true; data: PreparationResult } | { ok: false; error: string; fieldError?: string }> {
  if (!isUuid(itemId)) return { ok: false, error: NOT_FOUND };
  const titleError = validatePreparationTitle(typeof title === "string" ? title : "");
  if (titleError) return { ok: false, error: FIELDS_SUMMARY, fieldError: titleError };
  const auth = await requireAuth();
  try {
    const item = await getPlanningItem(auth, itemId);
    if (!item) return { ok: false, error: NOT_FOUND };
    if (item.preparationTask) return { ok: false, error: ALREADY_PREPARED };
    const data = await prepare(auth, item, title);
    revalidatePlanningViews();
    return { ok: true, data };
  } catch (error) {
    return planningError(error);
  }
}

export async function deletePlanningItemAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const auth = await requireAuth();
  try {
    await deletePlanningItem(auth, id);
    revalidatePlanningViews();
    return { ok: true };
  } catch (error) {
    return planningError(error);
  }
}
