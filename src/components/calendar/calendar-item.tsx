import { CircleAlert, Clock, Diamond, Repeat, Square, SquareCheck } from "lucide-react";
import type { CalendarItem } from "@/domain/calendar";
import { cn } from "@/lib/utils";

// Each Calendar item type has its own shape/icon and a spoken type label; color is never the
// only signal (MASTER.md §2 "Calendar and Gantt item colors"). Holidays render separately
// (holidays.tsx), since they arrive independently of local items.

export function itemTypeLabel(item: CalendarItem): string {
  switch (item.kind) {
    case "event":
      return "אירוע";
    case "planning":
      return "פריט תכנון";
    case "deadline":
      return item.status === "done" ? "מועד משימה שהושלמה" : item.overdue ? "מועד משימה, באיחור" : "מועד משימה";
    case "scheduled":
      return "עבודה מתוכננת";
  }
}

export function ItemIcon({ item, className }: { item: CalendarItem; className?: string }) {
  const icon = cn("size-3.5 shrink-0", className);
  switch (item.kind) {
    case "deadline":
      if (item.status === "done") return <SquareCheck aria-hidden className={cn(icon, "text-text-muted")} />;
      return item.overdue ? <CircleAlert aria-hidden className={cn(icon, "text-danger")} /> : <Square aria-hidden className={icon} />;
    case "scheduled":
      return <Clock aria-hidden className={cn(icon, "text-info")} />;
    case "event":
      return item.yearly ? <Repeat aria-hidden className={icon} /> : null;
    case "planning":
      return <Diamond aria-hidden className={cn(icon, "fill-primary text-primary")} />;
  }
}

/**
 * The compact form used inside a month cell (decorative: the cell's name says it all). Titles
 * wrap to at most two lines before an ellipsis, so a mixed Hebrew/English title keeps its
 * beginning whichever direction `<bdi>` resolves; the day panel always shows the full title.
 */
export function CellChip({ item }: { item: CalendarItem }) {
  const time = item.kind === "scheduled" ? item.time : item.kind === "event" && item.dayIndex === 1 ? item.startTime : null;
  return (
    <span
      className={cn(
        "flex min-h-5 min-w-0 items-start gap-1 rounded-sm px-1 py-px text-xs leading-[1.125rem]",
        item.kind === "event" && "border-s-2 border-text-secondary bg-surface-subtle",
        item.kind === "scheduled" && "border border-info",
        item.kind === "deadline" && item.overdue && "font-semibold text-danger",
        item.kind === "deadline" && item.status === "done" && "text-text-muted line-through",
      )}
    >
      <ItemIcon item={item} className="mt-0.5" />
      {time ? <span className="shrink-0 tabular-nums">{time}</span> : null}
      <bdi className="line-clamp-2 min-w-0 wrap-anywhere">{item.title}</bdi>
    </span>
  );
}
