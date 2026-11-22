import "server-only";
import type { DateOnly } from "@/domain/dates";
import { preparationTaskInput, type PlanningItem, type PlanningItemInput } from "@/domain/planning";
import type { AuthContext } from "@/server/auth";
import { DataError, toDataError, unwrap, unwrapMaybe } from "./errors";
import { createTask, deleteTask } from "./tasks";

// Planning items with their preparation task (if it still exists) in one query: the composite
// FK (preparation_task_id, user_id) → tasks is embedded, so there is no per-item lookup.
const PLANNING_COLUMNS =
  "id, title, date, notes, prep_lead_days, project_id, category_id, preparation_task:tasks!planning_items_preparation_task_id_user_id_fkey(id, title, deadline, status)";

interface PlanningRow {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  prep_lead_days: number;
  project_id: string | null;
  category_id: string | null;
  preparation_task: { id: string; title: string; deadline: string; status: "todo" | "in_progress" | "waiting" | "done" } | null;
}

function itemFromRow(row: PlanningRow): PlanningItem {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    notes: row.notes,
    prepLeadDays: row.prep_lead_days,
    projectId: row.project_id,
    categoryId: row.category_id,
    preparationTask: row.preparation_task,
  };
}

function toRow(input: PlanningItemInput) {
  return {
    title: input.title,
    date: input.date,
    notes: input.notes,
    prep_lead_days: input.prepLeadDays,
    project_id: input.projectId,
    category_id: input.categoryId,
  };
}

export async function listPlanningItems({ db, userId }: AuthContext): Promise<PlanningItem[]> {
  const rows = unwrap(await db.from("planning_items").select(PLANNING_COLUMNS).eq("user_id", userId).order("date").order("id"));
  return (rows as PlanningRow[]).map(itemFromRow);
}

/** Items dated within [from, to] (date-only): the Calendar's visible range. */
export async function listPlanningItemsInRange({ db, userId }: AuthContext, from: DateOnly, to: DateOnly): Promise<PlanningItem[]> {
  const rows = unwrap(
    await db.from("planning_items").select(PLANNING_COLUMNS).eq("user_id", userId).gte("date", from).lte("date", to).order("date").order("id"),
  );
  return (rows as PlanningRow[]).map(itemFromRow);
}

export async function getPlanningItem({ db, userId }: AuthContext, id: string): Promise<PlanningItem | null> {
  const row = unwrapMaybe(await db.from("planning_items").select(PLANNING_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle());
  return row ? itemFromRow(row as PlanningRow) : null;
}

/** The composite FKs reject another user's project or category ("invalid"). */
export async function createPlanningItem({ db, userId }: AuthContext, input: PlanningItemInput): Promise<PlanningItem> {
  const row = unwrap(await db.from("planning_items").insert({ ...toRow(input), user_id: userId }).select(PLANNING_COLUMNS).single());
  return itemFromRow(row as PlanningRow);
}

/** Changes only the item: its preparation task keeps its own fields (MASTER_SPEC §11). */
export async function updatePlanningItem({ db, userId }: AuthContext, id: string, input: PlanningItemInput): Promise<PlanningItem> {
  const row = unwrap(await db.from("planning_items").update(toRow(input)).eq("user_id", userId).eq("id", id).select(PLANNING_COLUMNS).single());
  return itemFromRow(row as PlanningRow);
}

/** Deletes only the item: its preparation task stays (no FK points from tasks to items). */
export async function deletePlanningItem({ db, userId }: AuthContext, id: string): Promise<void> {
  const { count, error } = await db.from("planning_items").delete({ count: "exact" }).eq("user_id", userId).eq("id", id);
  if (error) throw toDataError(error);
  if (count === 0) throw new DataError("not_found", "Planning item not found");
}

/**
 * Creates the item's single preparation task and links it. The link is written only while the
 * item has none, so a concurrent second request can't attach a second task: the loser deletes
 * the task it just created and gets DataError("conflict").
 */
export async function createPreparationTask(
  auth: AuthContext,
  item: Pick<PlanningItem, "id" | "projectId" | "categoryId">,
  title: string,
  deadline: DateOnly,
): Promise<{ id: string; deadline: DateOnly }> {
  const task = await createTask(auth, preparationTaskInput(item, title, deadline));
  const { data, error } = await auth.db
    .from("planning_items")
    .update({ preparation_task_id: task.id })
    .eq("user_id", auth.userId)
    .eq("id", item.id)
    .is("preparation_task_id", null)
    .select("id");
  if (error || !data || data.length === 0) {
    await deleteTask(auth, task.id).catch(() => undefined);
    if (error) throw toDataError(error);
    throw new DataError("conflict", "The item already has a preparation task");
  }
  return { id: task.id, deadline: task.deadline };
}
