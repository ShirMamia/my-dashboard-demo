"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/server/auth";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  type Category,
} from "@/server/data/categories";
import { DataError } from "@/server/data/errors";
import { UNEXPECTED_ERROR, type ActionResult } from "./task-form";

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: "יש להזין שם לקטגוריה." })
  .max(50, { error: "שם הקטגוריה יכול להכיל עד 50 תווים." });

function categoryError(error: unknown): ActionResult<never> {
  if (error instanceof DataError && error.code === "conflict") {
    return { ok: false, error: "כבר קיימת קטגוריה בשם הזה." };
  }
  if (error instanceof DataError && error.code === "not_found") {
    return { ok: false, error: "הקטגוריה לא נמצאה." };
  }
  return { ok: false, error: UNEXPECTED_ERROR };
}

export async function createCategoryAction(name: string): Promise<ActionResult<Category>> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? UNEXPECTED_ERROR };
  const auth = await requireAuth();
  try {
    const category = await createCategory(auth, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: category };
  } catch (error) {
    return categoryError(error);
  }
}

export async function renameCategoryAction(id: string, name: string): Promise<ActionResult<Category>> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? UNEXPECTED_ERROR };
  const auth = await requireAuth();
  try {
    const category = await renameCategory(auth, id, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: category };
  } catch (error) {
    return categoryError(error);
  }
}

/** Tasks keep existing; the FK clears their category (MASTER_SPEC §8). */
export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const auth = await requireAuth();
  try {
    await deleteCategory(auth, id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return categoryError(error);
  }
}
