import "server-only";
import type { CalendarTask } from "@/domain/calendar";
import { addDays, appInstantOf, type DateOnly } from "@/domain/dates";
import type { CalendarEvent, EventInput } from "@/domain/events";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/server/auth";
import { DataError, toDataError, unwrap } from "./errors";

// Calendar reads load only the visible range: one query for tasks, one for events.

/** The visible range as instants: [from 00:00, to + 1 day 00:00) in Asia/Jerusalem. */
function instantRange(from: DateOnly, to: DateOnly): { start: string; end: string } {
  return { start: appInstantOf(from, "00:00"), end: appInstantOf(addDays(to, 1), "00:00") };
}

/** PostgREST filter values are quoted so ISO instants and dates parse as single values. */
const q = (value: string) => `"${value}"`;

/**
 * Tasks whose deadline (date-only) or scheduled slot (instant) falls in the range. Done tasks
 * only when asked for (MASTER_SPEC §10.1: hidden by default).
 */
export async function listCalendarTasks(
  { db, userId }: AuthContext,
  from: DateOnly,
  to: DateOnly,
  includeDone: boolean,
): Promise<CalendarTask[]> {
  const { start, end } = instantRange(from, to);
  let query = db
    .from("tasks")
    .select("id, title, status, deadline, scheduled_at")
    .eq("user_id", userId)
    .or(`and(deadline.gte.${q(from)},deadline.lte.${q(to)}),and(scheduled_at.gte.${q(start)},scheduled_at.lt.${q(end)})`);
  if (!includeDone) query = query.neq("status", "done");
  const rows = unwrap(await query.order("deadline").order("id"));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    deadline: row.deadline,
    scheduledAt: row.scheduled_at,
  }));
}

const EVENT_COLUMNS = "id, title, notes, is_all_day, start_date, end_date, starts_at, ends_at, recurrence";
type EventRow = Pick<
  Tables<"calendar_events">,
  "id" | "title" | "notes" | "is_all_day" | "start_date" | "end_date" | "starts_at" | "ends_at" | "recurrence"
>;

function eventFromRow(row: EventRow): CalendarEvent {
  const base = { id: row.id, title: row.title, notes: row.notes, recurrence: row.recurrence };
  // The DB check guarantees the fields of each kind are present.
  if (row.is_all_day) return { ...base, allDay: true, startDate: row.start_date!, endDate: row.end_date! };
  return { ...base, allDay: false, startsAt: row.starts_at!, endsAt: row.ends_at! };
}

function toRow(input: EventInput): Omit<TablesInsert<"calendar_events">, "user_id"> {
  return input.allDay
    ? {
        title: input.title,
        notes: input.notes,
        is_all_day: true,
        start_date: input.startDate,
        end_date: input.endDate,
        starts_at: null,
        ends_at: null,
        recurrence: input.recurrence,
      }
    : {
        title: input.title,
        notes: input.notes,
        is_all_day: false,
        start_date: null,
        end_date: null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        recurrence: "none",
      };
}

/**
 * Events overlapping the range, plus every yearly event (expanded for the range in the domain).
 * All-day ranges compare dates; timed events compare instants.
 */
export async function listEventsInRange({ db, userId }: AuthContext, from: DateOnly, to: DateOnly): Promise<CalendarEvent[]> {
  const { start, end } = instantRange(from, to);
  const rows = unwrap(
    await db
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", userId)
      .or(
        [
          `and(is_all_day.eq.true,recurrence.eq.none,start_date.lte.${q(to)},end_date.gte.${q(from)})`,
          `and(is_all_day.eq.false,starts_at.lt.${q(end)},ends_at.gt.${q(start)})`,
          "recurrence.eq.yearly",
        ].join(","),
      )
      .order("id"),
  );
  return rows.map(eventFromRow);
}

export async function createEvent({ db, userId }: AuthContext, input: EventInput): Promise<CalendarEvent> {
  return eventFromRow(unwrap(await db.from("calendar_events").insert({ ...toRow(input), user_id: userId }).select(EVENT_COLUMNS).single()));
}

export async function updateEvent({ db, userId }: AuthContext, id: string, input: EventInput): Promise<CalendarEvent> {
  return eventFromRow(
    unwrap(await db.from("calendar_events").update(toRow(input)).eq("user_id", userId).eq("id", id).select(EVENT_COLUMNS).single()),
  );
}

/** Deletes only the event: tasks, projects, planning items and holidays are untouched. */
export async function deleteEvent({ db, userId }: AuthContext, id: string): Promise<void> {
  const { count, error } = await db.from("calendar_events").delete({ count: "exact" }).eq("user_id", userId).eq("id", id);
  if (error) throw toDataError(error);
  if (count === 0) throw new DataError("not_found", "Event not found");
}
