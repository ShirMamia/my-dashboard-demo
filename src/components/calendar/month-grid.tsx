"use client";

import { useEffect, useMemo, useRef } from "react";
import { layoutWeek, monthOf, shiftMonthKeepingDay, type CalendarItem, type MonthGrid as Grid, type WeekSpan } from "@/domain/calendar";
import { addDays, formatDateLong, isWithin, weekOf, WEEKDAY_NAMES, WEEKDAY_SHORT_NAMES, type DateOnly } from "@/domain/dates";
import { cn } from "@/lib/utils";
import { CellChip } from "./calendar-item";
import { HolidayDot, HolidayLabel, HolidayNames } from "./holidays";

// The month grid: an ARIA table of week rows, each a 7-column CSS grid (columns follow the
// page direction, so Sunday is at inline-start/right without any positioning). Day buttons
// span the whole row height; multi-day all-day events are grid items spanning their columns
// (one segment per week) in fixed-height lanes. Spans are decorative: each covered day's
// button name counts the event, and the day panel lists it.
// Keys (MASTER.md §5): ← next day, → previous day, ↑/↓ a week, Home/End the start/end of the
// week (Sunday is rightmost), PageUp/PageDown the previous/next month. One tab stop.

const KEYS_HELP_ID = "calendar-grid-keys";

function countText(count: number): string {
  return count === 0 ? "אין פריטים" : count === 1 ? "פריט אחד" : `${count} פריטים`;
}

function move(from: DateOnly, key: string): DateOnly | null {
  switch (key) {
    case "ArrowLeft":
      return addDays(from, 1);
    case "ArrowRight":
      return addDays(from, -1);
    case "ArrowUp":
      return addDays(from, -7);
    case "ArrowDown":
      return addDays(from, 7);
    case "Home":
      return weekOf(from).start;
    case "End":
      return weekOf(from).end;
    case "PageUp":
      return shiftMonthKeepingDay(from, -1);
    case "PageDown":
      return shiftMonthKeepingDay(from, 1);
    default:
      return null;
  }
}

// Wide screens: a fixed header row (day number + holiday label), one row per span lane, then
// the single-day chips. Literal class strings, so Tailwind generates them.
const ROWS_BY_LANES = [
  "md:grid-rows-[3.5rem_minmax(3.5rem,auto)]",
  "md:grid-rows-[3.5rem_1.5rem_minmax(3rem,auto)]",
  "md:grid-rows-[3.5rem_1.5rem_1.5rem_minmax(2rem,auto)]",
];
const SPACER_BY_LANES = ["", "md:h-6", "md:h-12"];

export function MonthGrid({
  grid,
  days,
  today,
  selected,
  onSelect,
  onNavigate,
}: {
  grid: Grid;
  days: Record<DateOnly, CalendarItem[]>;
  today: DateOnly;
  selected: DateOnly;
  /** Select a visible day; `focus` moves keyboard focus to it. */
  onSelect: (date: DateOnly, focus: boolean) => void;
  /** Keyboard moved past the visible weeks: show the month of `date`, with it selected and focused. */
  onNavigate: (date: DateOnly) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef<DateOnly | null>(null);
  const layouts = useMemo(() => grid.weeks.map((week) => layoutWeek(week, days)), [grid.weeks, days]);

  // After a keyboard move, focus the new day once it's rendered (also after a month change).
  useEffect(() => {
    const date = focusPending.current;
    if (!date) return;
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`);
    if (button) {
      button.focus();
      focusPending.current = null;
    }
  });

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, date: DateOnly) {
    const target = move(date, event.key);
    if (!target) return;
    event.preventDefault();
    focusPending.current = target;
    const changesMonth = event.key === "PageUp" || event.key === "PageDown" || !isWithin(target, grid.from, grid.to);
    if (changesMonth) onNavigate(target);
    else onSelect(target, true);
  }

  return (
    <div ref={gridRef} role="table" aria-label="ימי החודש" aria-describedby={KEYS_HELP_ID} className="flex flex-col">
      <p id={KEYS_HELP_ID} className="sr-only">
        החצים עוברים בין הימים, PageUp ו־PageDown בין החודשים.
      </p>
      <div role="row" className="grid grid-cols-7 pb-2">
        {WEEKDAY_NAMES.map((name, index) => (
          <div key={name} role="columnheader" className="text-center text-sm font-medium text-text-secondary">
            {/* The full name is always the header's name; narrow screens show the short form. */}
            <span className="sr-only md:not-sr-only">{name}</span>
            <span className="md:hidden" aria-hidden>
              {WEEKDAY_SHORT_NAMES[index]}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-px border border-border bg-border">
        {grid.weeks.map((week, weekIndex) => {
          const layout = layouts[weekIndex]!;
          return (
            <div key={week[0]} role="row" className={cn("grid grid-cols-7 gap-px", ROWS_BY_LANES[layout.laneCount])}>
              {week.map((date, column) => {
                const items = days[date] ?? [];
                const cell = layout.cells[date]!;
                const inMonth = monthOf(date) === grid.month;
                const isToday = date === today;
                const isSelected = date === selected;
                return (
                  <div key={date} role="cell" className="row-span-full bg-surface" style={{ gridColumn: column + 1 }}>
                    <button
                      type="button"
                      data-date={date}
                      tabIndex={isSelected ? 0 : -1}
                      aria-pressed={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onSelect(date, false)}
                      onKeyDown={(event) => onKeyDown(event, date)}
                      className={cn(
                        "flex h-full min-h-12 w-full flex-col items-stretch p-1 text-start outline-none",
                        "hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        !inMonth && "bg-surface-subtle/60 text-text-muted",
                        isSelected && "bg-primary-subtle ring-2 ring-primary ring-inset",
                      )}
                    >
                      {/* The name comes from this text; everything visual below is aria-hidden. */}
                      <span className="sr-only">
                        {formatDateLong(date)}
                        {isToday ? ", היום" : ""}
                        <HolidayNames date={date} />, {countText(items.length)}
                      </span>
                      <span aria-hidden className="flex flex-col md:h-[3.25rem]">
                        <span
                          className={cn(
                            "flex size-7 items-center justify-center self-start rounded-full text-sm tabular-nums",
                            isToday && "bg-primary font-semibold text-on-primary",
                          )}
                        >
                          {Number(date.slice(8))}
                        </span>
                        <span className="hidden md:block">
                          <HolidayLabel date={date} />
                        </span>
                      </span>
                      {/* Wide screens: room for the span lanes, then single-day chips and "+N נוספים". */}
                      <span aria-hidden className="hidden min-w-0 flex-col gap-1 md:flex">
                        <span className={cn("shrink-0", SPACER_BY_LANES[layout.laneCount])} />
                        {cell.chips.map((item) => (
                          <CellChip key={item.key} item={item} />
                        ))}
                        {cell.hidden > 0 ? <span className="text-xs font-medium text-text-secondary">+{cell.hidden} נוספים</span> : null}
                      </span>
                      {/* Narrow screens: a quiet count and a holiday dot; the day panel shows the items. */}
                      <span aria-hidden className="flex items-center gap-0.5 md:hidden">
                        <HolidayDot date={date} />
                        {items.length > 0 ? <span className="text-xs tabular-nums text-text-secondary">{items.length}</span> : null}
                      </span>
                    </button>
                  </div>
                );
              })}
              {layout.spans.map((span) => (
                <SpanBar key={span.key} span={span} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One week's segment of a multi-day all-day event. A grid item over its columns (gaps
 * included), so it reads as one continuous bar. Square ends mark a continuation into the
 * previous/next week; the title repeats on each segment. Clicks pass through to the days.
 */
function SpanBar({ span }: { span: WeekSpan }) {
  return (
    <div
      aria-hidden
      data-span={span.eventId}
      data-continues-before={span.continuesBefore || undefined}
      data-continues-after={span.continuesAfter || undefined}
      style={{ gridColumn: `${span.startColumn + 1} / ${span.endColumn + 2}`, gridRow: span.lane + 2 }}
      className={cn(
        "pointer-events-none z-10 hidden h-5 min-w-0 items-center self-start bg-surface-subtle px-1.5 text-xs md:flex",
        "border-y border-border-strong",
        span.continuesBefore ? "" : "ms-1 rounded-s-sm border-s-2 border-s-text-secondary",
        span.continuesAfter ? "" : "me-1 rounded-e-sm border-e",
      )}
    >
      {span.continuesBefore ? <span className="me-1 text-text-secondary">…</span> : null}
      <bdi className="truncate">{span.title}</bdi>
    </div>
  );
}
