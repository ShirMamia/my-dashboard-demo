"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEADLINE_HORIZON_MAX_DAYS } from "@/domain/task";
import { requireAuth } from "@/server/auth";
import { saveSettings } from "@/server/data/settings";
import { UNEXPECTED_ERROR, type ActionResult } from "./task-form";

const horizonSchema = z.coerce
  .number({ error: "יש להזין מספר ימים." })
  .int({ error: "יש להזין מספר שלם של ימים." })
  .min(0, { error: `יש להזין מספר בין 0 ל־${DEADLINE_HORIZON_MAX_DAYS}.` })
  .max(DEADLINE_HORIZON_MAX_DAYS, { error: `יש להזין מספר בין 0 ל־${DEADLINE_HORIZON_MAX_DAYS}.` });

/** Affects only the pre-filled deadline of future tasks; existing tasks never change. */
export async function saveSettingsAction(
  _previous: ActionResult<{ defaultDeadlineDays: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ defaultDeadlineDays: number }>> {
  const raw = formData.get("defaultDeadlineDays");
  const parsed = horizonSchema.safeParse(typeof raw === "string" && raw.trim() !== "" ? raw : undefined);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? UNEXPECTED_ERROR };
  }
  const auth = await requireAuth();
  try {
    const settings = await saveSettings(auth, { defaultDeadlineDays: parsed.data });
    revalidatePath("/", "layout");
    return { ok: true, data: settings };
  } catch {
    return { ok: false, error: UNEXPECTED_ERROR };
  }
}
