"use client";

import { ChevronLeft, ChevronRight, Clock, Diamond, Repeat, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuickCreateProps } from "@/components/tasks/quick-create";
import { addMonths, calendarHref, monthOf, type CalendarItem, type MonthGrid as Grid } from "@/domain/calendar";
import { formatMonthYear, type DateOnly } from "@/domain/dates";
import { HOLIDAY_ATTRIBUTION, type HolidayResult } from "@/domain/holidays";
import { DayPanel } from "./day-panel";
import { HolidaysNotice, HolidaysProvider } from "./holidays";
import { MonthGrid } from "./month-grid";

/**
 * The Calendar month (MASTER.md §6 Calendar): month navigation, the grid, the selected day's
 * panel, a legend and the holiday attribution. Months are server-rendered per URL; selecting a
 * day only updates the URL (no refetch), so the day panel follows instantly.
 */
export function CalendarView({
  grid,
  days,
  today,
  initialDay,
  showDone,
  holidays,
  quickCreate,
}: {
  grid: Grid;
  days: Record<DateOnly, CalendarItem[]>;
  today: DateOnly;
  initialDay: DateOnly;
  showDone: boolean;
  /** Resolved on the server, independently of the local items (never awaited before rendering). */
  holidays: Promise<HolidayResult>;
  quickCreate: Omit<QuickCreateProps, "forDay" | "fromTemplate" | "defaultProject">;
}) {
  const router = useRouter();
  // The selection belongs to the month shown; a new month starts from its own URL day.
  const [selection, setSelection] = useState({ month: grid.month, day: initialDay });
  const selected = selection.month === grid.month ? selection.day : initialDay;
  if (selection.month !== grid.month) setSelection({ month: grid.month, day: initialDay });

  function select(day: DateOnly) {
    setSelection({ month: grid.month, day });
    // Shareable URL without a new history entry or a refetch.
    window.history.replaceState(null, "", calendarHref(grid.month, day, showDone));
  }

  const previous = addMonths(grid.month, -1);
  const next = addMonths(grid.month, 1);
  const currentMonth = monthOf(today);

  return (
    <HolidaysProvider holidays={holidays}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link
              href={calendarHref(previous, undefined, showDone)}
              scroll={false}
              aria-label={`החודש הקודם: ${formatMonthYear(previous)}`}
              className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-subtle"
            >
              {/* "Previous" points right in RTL (MASTER.md §5). */}
              <ChevronLeft aria-hidden className="size-5 rtl:-scale-x-100" />
            </Link>
            <h2 aria-live="polite" className="min-w-36 text-center text-lg font-semibold">
              {formatMonthYear(grid.month)}
            </h2>
            <Link
              href={calendarHref(next, undefined, showDone)}
              scroll={false}
              aria-label={`החודש הבא: ${formatMonthYear(next)}`}
              className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-subtle"
            >
              <ChevronRight aria-hidden className="size-5 rtl:-scale-x-100" />
            </Link>
            <Link
              href={calendarHref(currentMonth, today, showDone)}
              scroll={false}
              className="ms-2 inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-subtle"
            >
              היום
            </Link>
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(event) => router.push(calendarHref(grid.month, selected, event.target.checked), { scroll: false })}
              className="size-4 accent-primary"
            />
            הצג משימות שהושלמו
          </label>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <MonthGrid
              grid={grid}
              days={days}
              today={today}
              selected={selected}
              onSelect={(day) => select(day)}
              onNavigate={(day) => router.push(calendarHref(monthOf(day), day, showDone), { scroll: false })}
            />
          </div>
          <div className="xl:w-80 xl:shrink-0">
            <DayPanel date={selected} items={days[selected] ?? []} today={today} quickCreate={quickCreate} />
          </div>
        </div>

        <Legend />
        <footer className="flex flex-col gap-1 text-sm text-text-secondary">
          <HolidaysNotice />
          <p>
            <a href={HOLIDAY_ATTRIBUTION.sourceUrl} className="underline underline-offset-2" target="_blank" rel="noreferrer">
              נתוני חגים: Hebcal.com
            </a>
            {" · "}
            <a href={HOLIDAY_ATTRIBUTION.licenseUrl} className="underline underline-offset-2" target="_blank" rel="noreferrer" lang="en" dir="ltr">
              CC BY 4.0
            </a>
          </p>
        </footer>
      </div>
    </HolidaysProvider>
  );
}

function Legend() {
  return (
    <ul aria-label="מקרא" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-secondary">
      <li className="flex items-center gap-1.5">
        <Square aria-hidden className="size-4" />
        מועד משימה
      </li>
      <li className="flex items-center gap-1.5">
        <Clock aria-hidden className="size-4 text-info" />
        עבודה מתוכננת
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-4 w-1 rounded-sm bg-text-secondary" />
        אירוע
      </li>
      <li className="flex items-center gap-1.5">
        <Diamond aria-hidden className="size-4 fill-primary text-primary" />
        פריט תכנון
      </li>
      <li className="flex items-center gap-1.5">
        <Repeat aria-hidden className="size-4" />
        חוזר מדי שנה
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="rounded-sm bg-surface-subtle px-1 text-xs">א</span>
        חגים ומועדים (טקסט קטן בראש היום)
      </li>
    </ul>
  );
}
