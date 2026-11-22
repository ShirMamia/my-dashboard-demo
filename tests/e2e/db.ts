import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { e2eCredentials } from "./helpers";

// Test data access for the dedicated E2E user: publishable key + the user's own session,
// so RLS limits every query to that user's rows. No service/secret key.

interface E2ESession {
  db: SupabaseClient<Database>;
  userId: string;
}

let session: Promise<E2ESession> | undefined;

// Signs in once, then queries with that fixed access token (`accessToken` option): no session
// storage, refresh or auth lock in the long-lived test process. Tokens outlive a test run.
function e2eSession(): Promise<E2ESession> {
  session ??= (async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase URL/publishable key missing from .env.local.");
    const auth = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signInWithPassword(e2eCredentials());
    if (error || !data.session) throw error ?? new Error("E2E sign-in returned no session");
    const token = data.session.access_token;
    const db = createClient<Database>(url, key, { accessToken: async () => token });
    return { db, userId: data.user.id };
  })();
  return session;
}

export async function e2eDb(): Promise<SupabaseClient<Database>> {
  return (await e2eSession()).db;
}

async function userId(): Promise<string> {
  return (await e2eSession()).userId;
}

/** Deletes all of the E2E user's data (only that user's rows are visible under RLS). */
export async function resetE2EData() {
  const db = await e2eDb();
  const id = await userId();
  for (const table of [
    "today_entries",
    "planning_items",
    "task_templates",
    "calendar_events",
    "tasks",
    "categories",
    "projects",
    "user_settings",
  ] as const) {
    const { error } = await db.from(table).delete().eq("user_id", id);
    if (error) throw new Error(`reset ${table}: ${error.message}`);
  }
}

/** Today in Asia/Jerusalem, "YYYY-MM-DD". */
export function jerusalemToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function plusDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "DD.MM.YYYY" */
export function ddmmyyyy(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

export interface SeedTask {
  title: string;
  deadline: string;
  status?: Database["public"]["Enums"]["task_status"];
  is_important?: boolean;
  urgent_override?: boolean | null;
  notes?: string | null;
  project_id?: string | null;
  category_id?: string | null;
  start_date?: string | null;
}

export async function seedTasks(tasks: SeedTask[]) {
  const db = await e2eDb();
  const id = await userId();
  // Batch inserts send null for keys missing from some rows (not the column default): fill them.
  const rows = tasks.map((task) => ({
    status: "todo" as const,
    is_important: false,
    urgent_override: null,
    notes: null,
    project_id: null,
    category_id: null,
    start_date: null,
    ...task,
    user_id: id,
    completed_at: task.status === "done" ? new Date().toISOString() : null,
  }));
  const { data, error } = await db.from("tasks").insert(rows).select("id, title");
  if (error) throw new Error(`seed tasks: ${error.message}`);
  return data;
}

export async function seedCategory(name: string) {
  const db = await e2eDb();
  const { data, error } = await db
    .from("categories")
    .insert({ user_id: await userId(), name })
    .select("id, name")
    .single();
  if (error) throw new Error(`seed category: ${error.message}`);
  return data;
}

export async function seedProject(name: string) {
  const db = await e2eDb();
  const { data, error } = await db
    .from("projects")
    .insert({ user_id: await userId(), name })
    .select("id, name")
    .single();
  if (error) throw new Error(`seed project: ${error.message}`);
  return data;
}

export async function getTaskByTitle(title: string) {
  const db = await e2eDb();
  const { data, error } = await db.from("tasks").select("*").eq("title", title).single();
  if (error) throw new Error(`get task ${title}: ${error.message}`);
  return data;
}

/** Like getTaskByTitle, but null when missing (for expect.poll). */
export async function findTaskByTitle(title: string) {
  const db = await e2eDb();
  const { data, error } = await db.from("tasks").select("*").eq("title", title).maybeSingle();
  if (error) throw new Error(`find task ${title}: ${error.message}`);
  return data;
}

export interface SeedTodayEntry {
  taskId: string;
  forDate: string;
  kind: "pick" | "dismiss";
  /** 1–5 for picks. */
  slot?: number;
}

/** Today picks/dismissals; picks get increasing created_at in array order. */
export async function seedTodayEntries(entries: SeedTodayEntry[]) {
  const db = await e2eDb();
  const id = await userId();
  // In the past, so picks made during the test (server time) always come after the seeded ones.
  const start = Date.now() - 60_000 - entries.length * 1000;
  const rows = entries.map((entry, index) => ({
    user_id: id,
    task_id: entry.taskId,
    for_date: entry.forDate,
    kind: entry.kind,
    pick_slot: entry.kind === "pick" ? (entry.slot ?? index + 1) : null,
    created_at: new Date(start + index * 1000).toISOString(),
  }));
  const { error } = await db.from("today_entries").insert(rows);
  if (error) throw new Error(`seed today entries: ${error.message}`);
}

/** The E2E user's Today entries for one date. */
export async function todayEntries(forDate: string) {
  const db = await e2eDb();
  const { data, error } = await db
    .from("today_entries")
    .select("task_id, kind, pick_slot")
    .eq("for_date", forDate)
    .order("created_at");
  if (error) throw new Error(`today entries: ${error.message}`);
  return data;
}

export interface SeedTemplate {
  name: string;
  title: string;
  notes?: string | null;
  is_important?: boolean;
  project_id?: string | null;
  category_id?: string | null;
}

export async function seedTemplate(template: SeedTemplate) {
  const db = await e2eDb();
  const { data, error } = await db
    .from("task_templates")
    .insert({ user_id: await userId(), ...template })
    .select("id, name")
    .single();
  if (error) throw new Error(`seed template: ${error.message}`);
  return data;
}

export async function findTemplateByName(name: string) {
  const db = await e2eDb();
  const { data, error } = await db.from("task_templates").select("*").eq("name", name).maybeSingle();
  if (error) throw new Error(`find template ${name}: ${error.message}`);
  return data;
}

/** All of the E2E user's tasks with this title (templates may create several). */
export async function tasksByTitle(title: string) {
  const db = await e2eDb();
  const { data, error } = await db.from("tasks").select("*").eq("title", title).order("created_at");
  if (error) throw new Error(`tasks ${title}: ${error.message}`);
  return data;
}

export async function setDefaultHorizon(days: number) {
  const db = await e2eDb();
  const { error } = await db.from("user_settings").upsert({ user_id: await userId(), default_deadline_days: days });
  if (error) throw new Error(`set horizon: ${error.message}`);
}

export async function archiveProject(id: string) {
  const db = await e2eDb();
  const { error } = await db.from("projects").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`archive project: ${error.message}`);
}

export type SeedEvent = { title: string } & (
  | { is_all_day: true; start_date: string; end_date: string; recurrence?: "none" | "yearly" }
  | { is_all_day: false; starts_at: string; ends_at: string }
);

export async function seedEvents(events: SeedEvent[]) {
  const db = await e2eDb();
  const id = await userId();
  // Batch inserts send null for keys missing from some rows: fill every column.
  const rows = events.map((event) => ({
    notes: null,
    start_date: null,
    end_date: null,
    starts_at: null,
    ends_at: null,
    recurrence: "none" as const,
    ...event,
    user_id: id,
  }));
  const { error } = await db.from("calendar_events").insert(rows);
  if (error) throw new Error(`seed events: ${error.message}`);
}

export interface SeedPlanningItem {
  title: string;
  date: string;
  prep_lead_days?: number;
  project_id?: string | null;
  category_id?: string | null;
  preparation_task_id?: string | null;
}

export async function seedPlanningItem(item: SeedPlanningItem) {
  const db = await e2eDb();
  const { data, error } = await db
    .from("planning_items")
    .insert({ user_id: await userId(), ...item })
    .select("id, title")
    .single();
  if (error) throw new Error(`seed planning item: ${error.message}`);
  return data;
}

export async function findPlanningItem(title: string) {
  const db = await e2eDb();
  const { data, error } = await db.from("planning_items").select("*").eq("title", title).maybeSingle();
  if (error) throw new Error(`find planning item ${title}: ${error.message}`);
  return data;
}
