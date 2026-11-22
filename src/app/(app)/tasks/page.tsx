import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { QuickCreate } from "@/components/tasks/quick-create";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { todayInAppZone } from "@/domain/dates";
import { isAssignableProject } from "@/domain/project";
import { defaultDeadline } from "@/domain/task";
import { parseTaskFilters } from "@/domain/task-filters";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/data/categories";
import { listProjects } from "@/server/data/projects";
import { getSettings } from "@/server/data/settings";
import { listTasks } from "@/server/data/tasks";

export const metadata: Metadata = { title: "משימות · לוח בקרה" };

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <Suspense fallback={<TasksSkeleton />}>
        <TasksContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TasksContent({ searchParams }: Pick<PageProps<"/tasks">, "searchParams">) {
  const auth = await requireAuth();
  const filters = parseTaskFilters(await searchParams);
  const today = todayInAppZone();

  const [tasks, projects, categories, settings] = await Promise.all([
    listTasks(auth),
    listProjects(auth, { includeArchived: true }),
    listCategories(auth),
    getSettings(auth),
  ]);

  return (
    <>
      <PageHeader title="משימות">
        <QuickCreate
          today={today}
          defaultDeadline={defaultDeadline(today, settings.defaultDeadlineDays)}
          categories={categories}
          projects={projects.filter(isAssignableProject)}
        />
      </PageHeader>
      <TaskListSection
        basePath="/tasks"
        tasks={tasks}
        filters={filters}
        today={today}
        projects={projects.map(({ id, name }) => ({ id, name }))}
        categories={categories}
        emptyTitle="עדיין אין משימות."
        emptyDescription="כדי להתחיל, לוחצים על משימה חדשה."
      />
    </>
  );
}

function TasksSkeleton() {
  return (
    <>
      <PageHeader title="משימות" />
      <div role="status" aria-busy="true" aria-label="טוען משימות" className="flex flex-col gap-3">
        <div className="h-9 w-full max-w-xl rounded-lg bg-surface-subtle" />
        <div className="flex flex-col rounded-xl border bg-surface">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex min-h-10 items-center gap-3 border-b px-3 last:border-b-0">
              <div className="size-5 rounded bg-surface-subtle" />
              <div className="h-4 w-1/3 rounded bg-surface-subtle" />
              <div className="h-4 w-20 rounded bg-surface-subtle" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
