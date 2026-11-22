import "server-only";
import { sortTemplates, type Template, type TemplateInput } from "@/domain/template";
import type { Tables } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/server/auth";
import { DataError, toDataError, unwrap } from "./errors";

const TEMPLATE_COLUMNS = "id, name, title, notes, is_important, project_id, category_id";

function templateFromRow(
  row: Pick<Tables<"task_templates">, "id" | "name" | "title" | "notes" | "is_important" | "project_id" | "category_id">,
): Template {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    notes: row.notes,
    isImportant: row.is_important,
    projectId: row.project_id,
    categoryId: row.category_id,
  };
}

function toRow(input: TemplateInput) {
  return {
    name: input.name,
    title: input.title,
    notes: input.notes,
    is_important: input.isImportant,
    project_id: input.projectId,
    category_id: input.categoryId,
  };
}

export async function listTemplates({ db, userId }: AuthContext): Promise<Template[]> {
  const rows = unwrap(await db.from("task_templates").select(TEMPLATE_COLUMNS).eq("user_id", userId));
  return sortTemplates(rows.map(templateFromRow));
}

/** The composite FKs reject another user's project or category ("invalid"). */
export async function createTemplate({ db, userId }: AuthContext, input: TemplateInput): Promise<Template> {
  return templateFromRow(
    unwrap(
      await db
        .from("task_templates")
        .insert({ ...toRow(input), user_id: userId })
        .select(TEMPLATE_COLUMNS)
        .single(),
    ),
  );
}

/** Changes only the template: tasks keep no reference to it (MASTER_SPEC §9). */
export async function updateTemplate(
  { db, userId }: AuthContext,
  id: string,
  input: TemplateInput,
): Promise<Template> {
  return templateFromRow(
    unwrap(
      await db
        .from("task_templates")
        .update(toRow(input))
        .eq("user_id", userId)
        .eq("id", id)
        .select(TEMPLATE_COLUMNS)
        .single(),
    ),
  );
}

export async function deleteTemplate({ db, userId }: AuthContext, id: string): Promise<void> {
  const { count, error } = await db
    .from("task_templates")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw toDataError(error);
  if (count === 0) throw new DataError("not_found", "Template not found");
}
