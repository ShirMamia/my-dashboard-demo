import "server-only";
import { DEFAULT_DEADLINE_HORIZON_DAYS } from "@/domain/task";
import type { AuthContext } from "@/server/auth";
import { unwrap, unwrapMaybe } from "./errors";

export interface UserSettings {
  defaultDeadlineDays: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultDeadlineDays: DEFAULT_DEADLINE_HORIZON_DAYS,
};

/** The row is created on first save; until then the defaults apply. */
export async function getSettings({ db, userId }: AuthContext): Promise<UserSettings> {
  const row = unwrapMaybe(
    await db
      .from("user_settings")
      .select("default_deadline_days")
      .eq("user_id", userId)
      .maybeSingle(),
  );
  return row ? { defaultDeadlineDays: row.default_deadline_days } : DEFAULT_SETTINGS;
}

export async function saveSettings(
  { db, userId }: AuthContext,
  settings: UserSettings,
): Promise<UserSettings> {
  const row = unwrap(
    await db
      .from("user_settings")
      .upsert({ user_id: userId, default_deadline_days: settings.defaultDeadlineDays })
      .select("default_deadline_days")
      .single(),
  );
  return { defaultDeadlineDays: row.default_deadline_days };
}
