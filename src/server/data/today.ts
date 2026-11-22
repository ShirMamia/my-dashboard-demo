import "server-only";
import type { DateOnly } from "@/domain/dates";
import { nextPickSlot, type TodayPick } from "@/domain/today";
import type { AuthContext } from "@/server/auth";
import { DataError, toDataError, unwrap } from "./errors";

export interface TodayEntries {
  /** In the order they were added. */
  picks: TodayPick[];
  dismissedTaskIds: string[];
  usedSlots: number[];
}

export async function getTodayEntries(
  { db, userId }: AuthContext,
  forDate: DateOnly,
): Promise<TodayEntries> {
  const rows = unwrap(
    await db
      .from("today_entries")
      .select("task_id, kind, pick_slot, created_at")
      .eq("user_id", userId)
      .eq("for_date", forDate)
      .order("created_at")
      .order("task_id"),
  );
  const entries: TodayEntries = { picks: [], dismissedTaskIds: [], usedSlots: [] };
  for (const row of rows) {
    if (row.kind === "pick") {
      entries.picks.push({ taskId: row.task_id, createdAt: row.created_at });
      if (row.pick_slot !== null) entries.usedSlots.push(row.pick_slot);
    } else {
      entries.dismissedTaskIds.push(row.task_id);
    }
  }
  return entries;
}

/**
 * Picks of tasks completed since they were picked: they no longer show in Today, so their
 * slots are released for new picks (the DB still holds at most 5 picks per day).
 */
async function releaseDonePicks(
  { db, userId }: AuthContext,
  pickedTaskIds: readonly string[],
  forDate: DateOnly,
): Promise<void> {
  if (pickedTaskIds.length === 0) return;
  const done = unwrap(
    await db.from("tasks").select("id").eq("user_id", userId).eq("status", "done").in("id", [...pickedTaskIds]),
  );
  if (done.length === 0) return;
  const { error } = await db
    .from("today_entries")
    .delete()
    .eq("user_id", userId)
    .eq("for_date", forDate)
    .eq("kind", "pick")
    .in(
      "task_id",
      done.map((row) => row.id),
    );
  if (error) throw toDataError(error);
}

/**
 * Adds a manual pick in the lowest free slot. Throws DataError("conflict") when all 5 slots
 * are taken by open tasks, including when a concurrent insert wins the race on the unique
 * slot index. Replaces a same-day dismissal of the task: manual intent wins.
 */
export async function addPick(auth: AuthContext, taskId: string, forDate: DateOnly): Promise<void> {
  let entries = await getTodayEntries(auth, forDate);
  if (entries.picks.some((pick) => pick.taskId === taskId)) return; // already picked: keep slot and order
  if (nextPickSlot(entries.usedSlots) === null) {
    await releaseDonePicks(
      auth,
      entries.picks.map((pick) => pick.taskId),
      forDate,
    );
    entries = await getTodayEntries(auth, forDate);
  }
  const slot = nextPickSlot(entries.usedSlots);
  if (slot === null) throw new DataError("conflict", "All pick slots are taken");
  const { error } = await auth.db.from("today_entries").upsert(
    {
      user_id: auth.userId,
      task_id: taskId,
      for_date: forDate,
      kind: "pick",
      pick_slot: slot,
      created_at: new Date().toISOString(),
    },
    { onConflict: "task_id,for_date" },
  );
  if (error) throw toDataError(error);
}

/** "לא היום": hides a recommendation for the day. Replaces a same-day pick of the task. */
export async function dismissForToday(
  { db, userId }: AuthContext,
  taskId: string,
  forDate: DateOnly,
): Promise<void> {
  const { error } = await db.from("today_entries").upsert(
    { user_id: userId, task_id: taskId, for_date: forDate, kind: "dismiss", pick_slot: null },
    { onConflict: "task_id,for_date" },
  );
  if (error) throw toDataError(error);
}

/**
 * Removes the task's entry of `kind` for the day: "הסר מהיום" (pick) or the undo of "לא היום"
 * (dismiss). Scoped to the kind, so a late undo never removes a pick made in the meantime.
 */
export async function clearTodayEntry(
  { db, userId }: AuthContext,
  taskId: string,
  forDate: DateOnly,
  kind: "pick" | "dismiss",
): Promise<void> {
  const { error } = await db
    .from("today_entries")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("for_date", forDate)
    .eq("kind", kind);
  if (error) throw toDataError(error);
}
