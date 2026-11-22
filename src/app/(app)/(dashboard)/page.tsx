import { Suspense } from "react";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { KpiBar, KpiBarSkeleton } from "@/components/dashboard/kpi-bar";
import { TodaySection } from "@/components/dashboard/today-section";
import { PageHeader } from "@/components/layout/page-header";
import { QuickCreate } from "@/components/tasks/quick-create";
import { buildDashboard } from "@/domain/dashboard";
import { addDays, formatDateLong, formatDateOnly, relativeDaysText, todayInAppZone, weekOf } from "@/domain/dates";
import { isAssignableProject } from "@/domain/project";
import { daysRemaining, defaultDeadline, isOverdue } from "@/domain/task";
import { tasksHref } from "@/domain/task-filters";
import { TODAY_LIMIT, UPCOMING_WINDOW_DAYS } from "@/domain/today";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/data/categories";
import { listProjects } from "@/server/data/projects";
import { getSettings } from "@/server/data/settings";
import { listCompletedSummariesSince, listOpenTaskSummaries } from "@/server/data/tasks";
import { getTodayEntries } from "@/server/data/today";

// Dashboard (MASTER_SPEC §6–§7): Today first, then Urgent / Important / Upcoming, with KPIs.
export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const auth = await requireAuth();
  const today = todayInAppZone();
  // One parallel round of queries for the whole page; every section and KPI is derived from it
  // in the domain (no per-section, per-task or per-project queries).
  const [openTasks, completed, entries, projects, categories, settings] = await Promise.all([
    listOpenTaskSummaries(auth),
    listCompletedSummariesSince(auth, weekOf(today).start),
    getTodayEntries(auth, today),
    listProjects(auth, { includeArchived: true }),
    listCategories(auth),
    getSettings(auth),
  ]);
  const dashboard = buildDashboard({
    openTasks,
    completed,
    picks: entries.picks,
    dismissedTaskIds: entries.dismissedTaskIds,
    today,
  });
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const { urgent, important, upcoming } = dashboard.sections;

  return (
    <>
      <PageHeader title="לוח בקרה">
        <p className="text-text-secondary">{formatDateLong(today)}</p>
        <QuickCreate
          today={today}
          defaultDeadline={defaultDeadline(today, settings.defaultDeadlineDays)}
          categories={categories}
          projects={projects.filter(isAssignableProject).map(({ id, name }) => ({ id, name }))}
        />
      </PageHeader>
      <KpiBar kpis={dashboard.kpis} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <TodaySection
          items={dashboard.today}
          today={today}
          candidates={dashboard.pickCandidates.map((task) => ({
            id: task.id,
            title: task.title,
            deadlineText: `${relativeDaysText(daysRemaining(task, today))} · ${formatDateOnly(task.deadline)}`,
            overdue: isOverdue(task, today),
          }))}
          pickLimitReached={dashboard.openPickCount >= TODAY_LIMIT}
          projectNames={projectNames}
          categoryNames={categoryNames}
        />
        <div className="flex flex-col gap-8">
          <DashboardSection
            id="urgent"
            title="דחופות"
            allLabel="המשימות הדחופות"
            allHref={tasksHref({ urgent: true })}
            emptyText="אין משימות דחופות."
            section={urgent}
            today={today}
          />
          <DashboardSection
            id="important"
            title="חשובות"
            allLabel="המשימות החשובות"
            allHref={tasksHref({ important: true })}
            emptyText="אין משימות חשובות."
            section={important}
            today={today}
          />
          <DashboardSection
            id="upcoming"
            title="מועדים קרובים"
            allLabel="המשימות עם מועד ב-7 הימים הקרובים"
            allHref={tasksHref({ due: "custom", from: addDays(today, 1), to: addDays(today, UPCOMING_WINDOW_DAYS) })}
            emptyText="אין מועדים ב-7 הימים הקרובים."
            section={upcoming}
            today={today}
          />
        </div>
      </div>
    </>
  );
}

/** Today's 3 static rows and the section outlines; KPI numbers stay blank, never a false 0. */
function DashboardSkeleton() {
  return (
    <>
      <PageHeader title="לוח בקרה" />
      <KpiBarSkeleton />
      <div role="status" aria-busy="true" aria-label="טוען את לוח הבקרה" className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <div className="flex flex-col rounded-xl border bg-surface">
          <div className="px-4 pt-4 pb-2 text-lg font-semibold">המשימות למיקוד היום</div>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex min-h-14 items-start gap-3 border-t px-4 py-3">
              <div className="size-5 rounded bg-surface-subtle" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-5 w-1/2 rounded bg-surface-subtle" />
                <div className="h-4 w-1/3 rounded bg-surface-subtle" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-8">
          {["דחופות", "חשובות", "מועדים קרובים"].map((title) => (
            <div key={title} className="flex flex-col gap-2">
              <div className="text-md font-semibold">{title}</div>
              <div className="h-11 rounded bg-surface-subtle" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
