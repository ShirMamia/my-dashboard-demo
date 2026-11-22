"use client";

import { createContext, Suspense, use, useContext } from "react";
import type { DateOnly } from "@/domain/dates";
import { groupHolidaysByDate, holidayKindLabel, type Holiday, type HolidayResult } from "@/domain/holidays";

// Holidays reach the Calendar as a promise from the server (fetched and cached there, never in
// the browser). Each consumer reads it inside its own Suspense boundary, so local items render
// immediately and holiday labels fill in when the source answers (or the quiet notice shows).

const HolidaysContext = createContext<Promise<HolidayResult> | null>(null);

export function HolidaysProvider({ holidays, children }: { holidays: Promise<HolidayResult>; children: React.ReactNode }) {
  return <HolidaysContext value={holidays}>{children}</HolidaysContext>;
}

const groupedCache = new WeakMap<HolidayResult, Map<DateOnly, Holiday[]>>();

function useHolidayResult(): HolidayResult {
  const promise = useContext(HolidaysContext);
  if (!promise) throw new Error("HolidaysProvider is missing");
  return use(promise);
}

function useHolidaysOn(date: DateOnly): Holiday[] {
  const result = useHolidayResult();
  let byDate = groupedCache.get(result);
  if (!byDate) {
    byDate = groupHolidaysByDate(result.holidays);
    groupedCache.set(result, byDate);
  }
  return byDate.get(date) ?? [];
}

/** Renders nothing until holidays are known; never delays its surroundings. */
function Deferred({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function LabelInner({ date }: { date: DateOnly }) {
  const holidays = useHolidaysOn(date);
  if (holidays.length === 0) return null;
  return <span className="block truncate text-xs text-text-secondary">{holidays.map((holiday) => holiday.name).join(" · ")}</span>;
}

/** The small holiday label at the top of a day cell (visual; the day's name carries it too). */
export function HolidayLabel({ date }: { date: DateOnly }) {
  return (
    <Deferred>
      <LabelInner date={date} />
    </Deferred>
  );
}

function DotInner({ date }: { date: DateOnly }) {
  return useHolidaysOn(date).length === 0 ? null : <span className="size-1.5 rounded-full bg-text-secondary" />;
}

/** Narrow screens: a dot for a holiday (decorative; the day's name carries the holiday). */
export function HolidayDot({ date }: { date: DateOnly }) {
  return (
    <Deferred>
      <DotInner date={date} />
    </Deferred>
  );
}

function NamesInner({ date }: { date: DateOnly }) {
  const holidays = useHolidaysOn(date);
  return holidays.length === 0 ? null : <>{holidays.map((holiday) => `, ${holiday.name}`).join("")}</>;
}

/** ", <name>, <name>" for a day button's accessible name. */
export function HolidayNames({ date }: { date: DateOnly }) {
  return (
    <Deferred>
      <NamesInner date={date} />
    </Deferred>
  );
}

function PanelInner({ date }: { date: DateOnly }) {
  const holidays = useHolidaysOn(date);
  return holidays.map((holiday) => (
    <li key={`${holiday.date}:${holiday.name}`} className="flex flex-col gap-1 border-b py-2 last:border-b-0">
      <span className="text-xs text-text-secondary">{holidayKindLabel(holiday.kind)}</span>
      <p className="font-medium">{holiday.name}</p>
    </li>
  ));
}

/** The selected day's holidays as list items (they come first in the day panel). */
export function PanelHolidays({ date }: { date: DateOnly }) {
  return (
    <Deferred>
      <PanelInner date={date} />
    </Deferred>
  );
}

function EmptyInner({ date }: { date: DateOnly }) {
  return useHolidaysOn(date).length === 0 ? <p className="text-text-muted">אין פריטים ביום זה.</p> : null;
}

/** "אין פריטים ביום זה." once it's known the day has no holiday either (never a false empty). */
export function EmptyDayNote({ date }: { date: DateOnly }) {
  return (
    <Deferred>
      <EmptyInner date={date} />
    </Deferred>
  );
}

function NoticeInner() {
  return useHolidayResult().unavailable ? (
    <p role="status" className="text-text-secondary">
      לא ניתן לטעון כרגע את נתוני החגים. שאר הפריטים בלוח מוצגים כרגיל.
    </p>
  ) : null;
}

export function HolidaysNotice() {
  return (
    <Deferred>
      <NoticeInner />
    </Deferred>
  );
}
