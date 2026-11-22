"use server";

import { revalidatePath } from "next/cache";
import { parseEventForm, type CalendarEvent, type EventFieldErrors, type EventFormValues } from "@/domain/events";
import { isUuid } from "@/lib/uuid";
import { requireAuth } from "@/server/auth";
import { createEvent, deleteEvent, updateEvent } from "@/server/data/calendar";
import { DataError } from "@/server/data/errors";
import { UNEXPECTED_ERROR } from "./task-form";

// User calendar events (MASTER_SPEC §10.2). Validation runs here, on untrusted input.

export type EventActionResult =
  | { ok: true; data: CalendarEvent }
  | { ok: false; error: string; fieldErrors?: EventFieldErrors };

const NOT_FOUND = "האירוע לא נמצא. ייתכן שנמחק.";
const FIELDS_SUMMARY = "לא ניתן לשמור. יש לתקן את השדות המסומנים.";

function shape(raw: EventFormValues): EventFormValues {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    title: text(raw?.title),
    notes: text(raw?.notes),
    allDay: raw?.allDay === true,
    startDate: text(raw?.startDate),
    endDate: text(raw?.endDate),
    startTime: text(raw?.startTime),
    endTime: text(raw?.endTime),
    yearly: raw?.yearly === true,
  };
}

function eventError(error: unknown): { ok: false; error: string } {
  if (error instanceof DataError && error.code === "not_found") return { ok: false, error: NOT_FOUND };
  if (error instanceof DataError && error.code === "invalid") return { ok: false, error: "פרטי האירוע אינם תקינים." };
  console.error("Event action failed", error instanceof DataError ? error.code : error);
  return { ok: false, error: UNEXPECTED_ERROR };
}

function revalidateCalendarViews() {
  revalidatePath("/calendar");
  revalidatePath("/search");
}

export async function saveEventAction(id: string | null, raw: EventFormValues): Promise<EventActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: NOT_FOUND };
  const parsed = parseEventForm(shape(raw));
  if (!parsed.ok) return { ok: false, error: FIELDS_SUMMARY, fieldErrors: parsed.errors };
  const auth = await requireAuth();
  try {
    const event = id === null ? await createEvent(auth, parsed.input) : await updateEvent(auth, id, parsed.input);
    revalidateCalendarViews();
    return { ok: true, data: event };
  } catch (error) {
    return eventError(error);
  }
}

export async function deleteEventAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const auth = await requireAuth();
  try {
    await deleteEvent(auth, id);
    revalidateCalendarViews();
    return { ok: true };
  } catch (error) {
    return eventError(error);
  }
}
