import { formatDateOnly } from "@/domain/dates";
import type { TimelineEntry } from "@/domain/timeline";

// Text shared by the chart's label column and the list alternative, so both say the same thing.

export const KIND_LABELS: Record<TimelineEntry["kind"], string> = {
  span: "טווח משימה",
  deadline: "מועד משימה",
  milestone: "פריט תכנון",
};

export function entryHref(entry: TimelineEntry): string {
  return entry.kind === "milestone" ? `/planning#planning-${entry.itemId}` : `/tasks/${entry.taskId}`;
}

/** The dates as shown (the shape tells the kind), and as spoken with the kind. */
export function entryDates(entry: TimelineEntry): { shown: string; spoken: string } {
  switch (entry.kind) {
    case "span":
      return {
        shown: `${formatDateOnly(entry.startDate)} – ${formatDateOnly(entry.deadline)}`,
        spoken: `משימה מ־${formatDateOnly(entry.startDate)} עד ${formatDateOnly(entry.deadline)}`,
      };
    case "deadline":
      return {
        shown: formatDateOnly(entry.deadline),
        spoken: `משימה עם מועד בלבד, מועד ${formatDateOnly(entry.deadline)}`,
      };
    case "milestone":
      return { shown: formatDateOnly(entry.date), spoken: `פריט תכנון, ${formatDateOnly(entry.date)}` };
  }
}

/** "באיחור" or "הושלמה" (tasks only). */
export function entryState(entry: TimelineEntry): { text: string; tone: "danger" | "done" } | null {
  if (entry.kind === "milestone") return null;
  if (entry.status === "done") return { text: "הושלמה", tone: "done" };
  return entry.overdue ? { text: "באיחור", tone: "danger" } : null;
}

/** For spans cut at the edges of the visible range. */
export function entryClipping(entry: TimelineEntry): string | null {
  if (entry.kind !== "span") return null;
  const parts = [
    entry.clippedStart ? "מתחילה לפני הטווח המוצג" : null,
    entry.clippedEnd ? "נמשכת אחרי הטווח המוצג" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
