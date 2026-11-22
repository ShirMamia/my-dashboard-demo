"use client";

import Link from "next/link";
import { StatusPill } from "@/components/tasks/task-signals";
import { QuickCreate, type QuickCreateProps } from "@/components/tasks/quick-create";
import type { CalendarItem } from "@/domain/calendar";
import { formatDateLong, formatDateOnly, type DateOnly } from "@/domain/dates";
import { cn } from "@/lib/utils";
import { ItemIcon, itemTypeLabel } from "./calendar-item";
import { DeleteEventButton } from "./delete-event-button";
import { EventFormDialog } from "./event-form-dialog";
import { EmptyDayNote, PanelHolidays } from "./holidays";

export const DAY_PANEL_HEADING_ID = "calendar-day-heading";

type EventItem = Extract<CalendarItem, { kind: "event" }>;

function eventWhen(item: EventItem): string {
  if (item.yearly) return "יום שלם · חוזר מדי שנה";
  if (item.allDay) {
    return item.dayCount === 1
      ? "יום שלם"
      : `${formatDateOnly(item.startDate)}–${formatDateOnly(item.endDate)} · יום ${item.dayIndex} מתוך ${item.dayCount}`;
  }
  const sameDay = item.startDate === item.endDate;
  return sameDay
    ? `${item.startTime}–${item.endTime}`
    : `${formatDateOnly(item.startDate)} ${item.startTime} – ${formatDateOnly(item.endDate)} ${item.endTime}`;
}

/** Everything on the selected day (the full list behind a cell's "+N נוספים"), plus creation from the day. */
export function DayPanel({
  date,
  items,
  today,
  quickCreate,
}: {
  date: DateOnly;
  items: CalendarItem[];
  today: DateOnly;
  quickCreate: Omit<QuickCreateProps, "forDay" | "fromTemplate" | "defaultProject">;
}) {
  return (
    <section aria-labelledby={DAY_PANEL_HEADING_ID} className="flex flex-col gap-3 rounded-xl border bg-surface p-4">
      <h2 id={DAY_PANEL_HEADING_ID} tabIndex={-1} className="text-md font-semibold outline-none">
        {formatDateLong(date)}
        {date === today ? <span className="text-text-secondary"> · היום</span> : null}
      </h2>

      {/* Holidays fill in when their source answers; local items never wait for them. */}
      <ul aria-label="הפריטים ביום הנבחר" className="flex flex-col">
        <PanelHolidays date={date} />
        {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-1 border-b py-2 last:border-b-0">
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <ItemIcon item={item} className="size-4" />
                {itemTypeLabel(item)}
                {item.kind === "scheduled" ? <span className="tabular-nums"> · {item.time}</span> : null}
              </span>
              <PanelItem item={item} today={today} />
            </li>
          ))}
      </ul>
      {items.length === 0 ? <EmptyDayNote date={date} /> : null}

      {/* Keyed by day: the forms start from the selected date each time. */}
      <div key={date} className="flex flex-wrap gap-2 border-t pt-3">
        <QuickCreate {...quickCreate} forDay={date} />
        <EventFormDialog
          today={today}
          initial={{ title: "", notes: "", allDay: true, startDate: date, endDate: date, startTime: "09:00", endTime: "10:00", yearly: false }}
        />
      </div>
    </section>
  );
}

function PanelItem({ item, today }: { item: CalendarItem; today: DateOnly }) {
  switch (item.kind) {
    case "planning":
      return (
        <Link href={`/planning#planning-${item.itemId}`} className="font-medium wrap-anywhere hover:underline">
          <bdi>{item.title}</bdi>
        </Link>
      );
    case "deadline":
    case "scheduled":
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/tasks/${item.taskId}`}
            className={cn(
              "font-medium wrap-anywhere hover:underline",
              item.kind === "deadline" && item.overdue && "text-danger",
              item.status === "done" && "text-text-secondary line-through",
            )}
          >
            <bdi>{item.title}</bdi>
          </Link>
          <StatusPill status={item.status} />
          {item.kind === "deadline" && item.overdue ? <span className="text-sm font-semibold text-danger">באיחור</span> : null}
        </div>
      );
    case "event":
      return (
        <div className="flex flex-col gap-1 border-s-2 border-text-secondary ps-2">
          <p className="font-medium wrap-anywhere">
            <bdi>{item.title}</bdi>
          </p>
          <p className="text-sm text-text-secondary tabular-nums">{eventWhen(item)}</p>
          {item.notes ? <p className="text-sm text-text-secondary whitespace-pre-line wrap-anywhere">{item.notes}</p> : null}
          <div className="flex flex-wrap gap-1">
            <EventFormDialog
              today={today}
              eventId={item.eventId}
              title={item.title}
              initial={{
                title: item.title,
                notes: item.notes ?? "",
                allDay: item.allDay,
                startDate: item.startDate,
                endDate: item.endDate,
                startTime: item.startTime ?? "09:00",
                endTime: item.endTime ?? "10:00",
                yearly: item.yearly,
              }}
            />
            <DeleteEventButton eventId={item.eventId} title={item.title} yearly={item.yearly} focusAfterId={DAY_PANEL_HEADING_ID} />
          </div>
        </div>
      );
  }
}
