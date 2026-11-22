import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/layout/page-header";
import { buildCalendarDays, monthGrid, parseDayParam, parseMonthParam } from "@/domain/calendar";
import { todayInAppZone, WEEKDAY_NAMES } from "@/domain/dates";
import { isAssignableProject } from "@/domain/project";
import { defaultDeadline } from "@/domain/task";
import { requireAuth } from "@/server/auth";
import { listCalendarTasks, listEventsInRange } from "@/server/data/calendar";
import { listCategories } from "@/server/data/categories";
import { listPlanningItemsInRange } from "@/server/data/planning";
import { getHolidays } from "@/server/data/holidays";
import { listProjects } from "@/server/data/projects";
import { getSettings } from "@/server/data/settings";

export const metadata: Metadata = { title: "לוח שנה · לוח בקרה" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="לוח שנה" />
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CalendarContent({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) {
  const auth = await requireAuth();
  const params = await searchParams;
  const today = todayInAppZone();
  const grid = monthGrid(parseMonthParam(first(params.month), today));
  const selected = parseDayParam(first(params.day), grid, today);
  const showDone = first(params.done) === "1";

  // Holidays are optional external enrichment: their (server-side, cached) fetch starts now but
  // is not awaited. The promise streams to the client, where each holiday label resolves in its
  // own Suspense boundary, so a slow or failing source never delays the local calendar.
  const holidays = getHolidays(grid.from, grid.to);
  // One parallel round of local queries for the visible range: tasks by deadline or scheduled
  // slot, events overlapping the range or yearly, planning items dated in it, and what the
  // creation forms need. Nothing is fetched per day, task or project.
  const [tasks, events, planningItems, categories, projects, settings] = await Promise.all([
    listCalendarTasks(auth, grid.from, grid.to, showDone),
    listEventsInRange(auth, grid.from, grid.to),
    listPlanningItemsInRange(auth, grid.from, grid.to),
    listCategories(auth),
    listProjects(auth),
    getSettings(auth),
  ]);
  const days = buildCalendarDays({ from: grid.from, to: grid.to, today, tasks, events, planningItems });

  return (
    <CalendarView
      grid={grid}
      days={Object.fromEntries(days)}
      today={today}
      initialDay={selected}
      showDone={showDone}
      holidays={holidays}
      quickCreate={{
        today,
        defaultDeadline: defaultDeadline(today, settings.defaultDeadlineDays),
        categories,
        projects: projects.filter(isAssignableProject).map(({ id, name }) => ({ id, name })),
      }}
    />
  );
}

/** The grid's frame without numbers or items: never a false "nothing here". */
function CalendarSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="טוען את לוח השנה" className="flex flex-col gap-4">
      <div className="h-9 w-64 rounded-lg bg-surface-subtle" />
      <div className="grid grid-cols-7 gap-px rounded-lg border bg-border">
        {WEEKDAY_NAMES.map((name) => (
          <div key={name} className="bg-background pb-2 text-center text-sm text-text-secondary">
            <span className="hidden md:inline">{name}</span>
          </div>
        ))}
        {Array.from({ length: 35 }, (_, index) => (
          <div key={index} className="min-h-12 bg-surface md:min-h-28" />
        ))}
      </div>
    </div>
  );
}
