"use server";

import { revalidatePath } from "next/cache";
import { todayInAppZone } from "@/domain/dates";
import { isOpen } from "@/domain/task";
import { PICK_LIMIT_MESSAGE } from "@/domain/today";
import { isUuid } from "@/lib/uuid";
import { requireAuth, type AuthContext } from "@/server/auth";
import { DataError } from "@/server/data/errors";
import { getTask } from "@/server/data/tasks";
import { addPick, clearTodayEntry, dismissForToday } from "@/server/data/today";
import { UNEXPECTED_ERROR, type ActionResult } from "./task-form";

// Today picks and dismissals (MASTER_SPEC §6.5). Each applies to the current calendar day in
// the app timezone, computed here on the server, so it resets with the date (§6.6).

const NOT_FOUND = "המשימה לא נמצאה. ייתכן שנמחקה.";

function todayError(error: unknown): ActionResult<never> {
  if (error instanceof DataError && error.code === "conflict") return { ok: false, error: PICK_LIMIT_MESSAGE };
  // A foreign-key failure: the task is gone or isn't the user's.
  if (error instanceof DataError && error.code === "invalid") return { ok: false, error: NOT_FOUND };
  console.error("Today action failed", error instanceof DataError ? error.code : error);
  return { ok: false, error: UNEXPECTED_ERROR };
}

async function run(
  taskId: string,
  change: (auth: AuthContext, taskId: string, today: string) => Promise<ActionResult<never> | void>,
): Promise<ActionResult> {
  if (!isUuid(taskId)) return { ok: false, error: NOT_FOUND };
  const auth = await requireAuth();
  try {
    const failure = await change(auth, taskId, todayInAppZone());
    if (failure) return failure;
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (error) {
    return todayError(error);
  }
}

/** "הוספת משימה להיום": any open task, including Waiting, future-start and dismissed ones. */
export async function addTodayPickAction(taskId: string): Promise<ActionResult> {
  return run(taskId, async (auth, id, today) => {
    const task = await getTask(auth, id);
    if (!task) return { ok: false, error: NOT_FOUND };
    if (!isOpen(task)) return { ok: false, error: "המשימה כבר הושלמה." };
    await addPick(auth, id, today);
  });
}

/** "הסר מהיום": the task stays as it is; a recommendation may take the slot. */
export async function removeTodayPickAction(taskId: string): Promise<ActionResult> {
  return run(taskId, (auth, id, today) => clearTodayEntry(auth, id, today, "pick"));
}

/** "לא היום": hides a recommendation until the next calendar day. */
export async function dismissForTodayAction(taskId: string): Promise<ActionResult> {
  return run(taskId, (auth, id, today) => dismissForToday(auth, id, today));
}

/** Undo of "לא היום". */
export async function undoDismissAction(taskId: string): Promise<ActionResult> {
  return run(taskId, (auth, id, today) => clearTodayEntry(auth, id, today, "dismiss"));
}
