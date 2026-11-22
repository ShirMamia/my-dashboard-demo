import { Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectStatus } from "@/components/projects/project-status";
import { DeadlineText, signalsOf, StatusPill } from "@/components/tasks/task-signals";
import { Input } from "@/components/ui/input";
import { calendarHref, monthOf } from "@/domain/calendar";
import { appDateOf, formatDateOnly, todayInAppZone, type DateOnly } from "@/domain/dates";
import { yearlyDateIn } from "@/domain/events";
import { requireAuth } from "@/server/auth";
import { SEARCH_QUERY_MAX_LENGTH, searchAll, type SearchResults } from "@/server/data/search";

export const metadata: Metadata = { title: "חיפוש · לוח בקרה" };

// Global search (MASTER_SPEC §13): server-side, grouped by type, Done tasks included and marked.
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="חיפוש" />
      <Suspense fallback={<p aria-busy="true" className="text-text-muted">מחפש…</p>}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchContent({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim().slice(0, SEARCH_QUERY_MAX_LENGTH);

  const form = (
    <form action="/search" role="search" className="flex flex-col gap-1">
      <label htmlFor="search-page-q" className="text-sm font-medium">
        חיפוש משימות, פרויקטים, תבניות, פריטי תכנון ואירועים
      </label>
      <Input id="search-page-q" name="q" type="search" dir="auto" defaultValue={query} key={query} />
    </form>
  );

  if (!query) {
    return (
      <>
        {form}
        <EmptyState icon={Search} title="מה לחפש?" description="אפשר לחפש לפי כותרת, תיאור או שם." />
      </>
    );
  }

  const auth = await requireAuth();
  const results = await searchAll(auth, query);
  const total =
    results.tasks.length +
    results.projects.length +
    results.templates.length +
    results.planningItems.length +
    results.events.length;

  return (
    <>
      {form}
      <p role="status" className="text-sm text-text-secondary">
        {total === 0 ? "לא נמצאו תוצאות" : total === 1 ? "תוצאה אחת" : `${total} תוצאות`} עבור{" "}
        <bdi className="font-semibold wrap-anywhere">{query}</bdi>
      </p>
      {total === 0 ? (
        <EmptyState icon={SearchX} title="לא נמצאו תוצאות." description="אפשר לנסות מילה אחרת או חלק ממילה." />
      ) : (
        <Results results={results} />
      )}
    </>
  );
}

function Group({ id, title, count, children }: { id: string; title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-md font-semibold">
        {title} <span className="text-sm font-normal text-text-secondary">({count})</span>
      </h2>
      <ul className="flex flex-col rounded-xl border bg-surface">{children}</ul>
    </section>
  );
}

/** The event's day in the Calendar: a yearly event opens this year's occurrence. */
function eventDay(event: SearchResults["events"][number], today: DateOnly): DateOnly | null {
  if (event.startDate) {
    if (!event.yearly) return event.startDate;
    return yearlyDateIn(event.startDate, Number(today.slice(0, 4))) ?? event.startDate;
  }
  return event.startsAt ? appDateOf(event.startsAt) : null;
}

function eventHref(event: SearchResults["events"][number], today: DateOnly): string {
  const day = eventDay(event, today);
  return day ? calendarHref(monthOf(day), day) : "/calendar";
}

const rowClass = "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0";

function Results({ results }: { results: SearchResults }) {
  const today = todayInAppZone();
  return (
    <div className="flex flex-col gap-6">
      <Group id="results-tasks" title="משימות" count={results.tasks.length}>
        {results.tasks.map((task) => (
          <li key={task.id} className={rowClass}>
            <Link href={`/tasks/${task.id}`} className="font-medium hover:underline wrap-anywhere">
              <bdi>{task.title}</bdi>
            </Link>
            <span className="text-sm">
              <DeadlineText task={task} signals={signalsOf(task, today)} />
            </span>
            {task.status === "done" ? <StatusPill status="done" /> : null}
          </li>
        ))}
      </Group>
      <Group id="results-projects" title="פרויקטים" count={results.projects.length}>
        {results.projects.map((project) => (
          <li key={project.id} className={rowClass}>
            <Link href={`/projects/${project.id}`} className="font-medium hover:underline wrap-anywhere">
              <bdi>{project.name}</bdi>
            </Link>
            <ProjectStatus project={project} />
          </li>
        ))}
      </Group>
      <Group id="results-templates" title="תבניות" count={results.templates.length}>
        {results.templates.map((template) => (
          <li key={template.id} className={rowClass}>
            <Link href={`/templates#template-${template.id}`} className="font-medium hover:underline wrap-anywhere">
              <bdi>{template.name}</bdi>
            </Link>
            <span className="text-sm text-text-secondary">
              <bdi>{template.title}</bdi>
            </span>
          </li>
        ))}
      </Group>
      <Group id="results-planning" title="תכנון שנתי" count={results.planningItems.length}>
        {results.planningItems.map((item) => (
          <li key={item.id} className={rowClass}>
            <Link href={`/planning#planning-${item.id}`} className="font-medium hover:underline wrap-anywhere">
              <bdi>{item.title}</bdi>
            </Link>
            <span className="text-sm tabular-nums text-text-secondary">{formatDateOnly(item.date)}</span>
          </li>
        ))}
      </Group>
      <Group id="results-events" title="אירועים" count={results.events.length}>
        {results.events.map((event) => (
          <li key={event.id} className={rowClass}>
            <Link href={eventHref(event, todayInAppZone())} className="font-medium hover:underline wrap-anywhere">
              <bdi>{event.title}</bdi>
            </Link>
            <span className="text-sm tabular-nums text-text-secondary">
              {event.startDate
                ? formatDateOnly(event.startDate)
                : event.startsAt
                  ? formatDateOnly(appDateOf(event.startsAt))
                  : null}
            </span>
          </li>
        ))}
      </Group>
    </div>
  );
}
