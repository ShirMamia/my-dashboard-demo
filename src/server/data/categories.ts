import "server-only";
import type { AuthContext } from "@/server/auth";
import { DataError, toDataError, unwrap } from "./errors";

export interface Category {
  id: string;
  name: string;
}

export async function listCategories({ db, userId }: AuthContext): Promise<Category[]> {
  return unwrap(
    await db.from("categories").select("id, name").eq("user_id", userId).order("name").order("id"),
  );
}

export async function createCategory({ db, userId }: AuthContext, name: string): Promise<Category> {
  return unwrap(
    await db.from("categories").insert({ user_id: userId, name }).select("id, name").single(),
  );
}

export async function renameCategory(
  { db, userId }: AuthContext,
  id: string,
  name: string,
): Promise<Category> {
  return unwrap(
    await db
      .from("categories")
      .update({ name })
      .eq("user_id", userId)
      .eq("id", id)
      .select("id, name")
      .single(),
  );
}

/** Tasks keep existing; their category_id is set to null by the FK. */
export async function deleteCategory({ db, userId }: AuthContext, id: string): Promise<void> {
  const { count, error } = await db
    .from("categories")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw toDataError(error);
  if (count === 0) throw new DataError("not_found", "Category not found");
}
