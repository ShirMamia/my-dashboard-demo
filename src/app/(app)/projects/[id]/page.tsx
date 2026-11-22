import { Archive, CircleCheck, Diamond } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressSummary } from "@/components/projects/progress-summary";
import { ProjectActions } from "@/components/projects/project-actions";
import { ProjectStatus } from "@/components/projects/project-status";
import { QuickCreate } from "@/components/tasks/quick-create";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { formatDateOnly, todayInAppZone } from "@/domain/dates";
import { isAssignableProject } from "@/domain/project";
import { projectProgress } from "@/domain/project-progress";
import { defaultDeadline } from "@/domain/task";
import { parseTaskFilters } from "@/domain/task-filters";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/data/categories";
import { getProject, listProjectPlanningItems, listProjects } from "@/server/data/projects";
import { getSettings } from "@/server/data/settings";
import { listTasks } from "@/server/data/tasks";
import { isUuid } from "@/lib/uuid";
import ProjectNotFound from "./not-found";

export const metadata: Metadata = { title: "פרויקט · לוח בקרה" };


export default function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <nav aria-label="נתיב">
        <Link href="/projects" className="text-sm text-primary hover:underline">
          פרויקטים
        </Link>
      </nav>
      <Suspense fallback={<ProjectSkeleton />}>
        <ProjectContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProjectContent({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  // Rendered inline, not notFound(): this runs inside <Suspense>, after the shell has streamed, where
  // throwing makes React switch the boundary to client rendering and log #419. (The status is
  // 200 either way once streaming has started.)
  if (!isUuid(id)) return <ProjectNotFound />;
  const auth = await requireAuth();
  // RLS + the user_id filter: another user's project id is simply "not found".
  const [project, tasks, projects, categories, settings, planningItems] = await Promise.all([
    getProject(auth, id),
    listTasks(auth, { projectId: id }),
    listProjects(auth, { includeArchived: true }),
    listCategories(auth),
    getSettings(auth),
    listProjectPlanningItems(auth, id),
  ]);
  if (!project) return <ProjectNotFound />;

  // The project page owns the project scope; a `project` param in the URL is ignored.
  const filters = { ...parseTaskFilters(await searchParams), projectId: null };
  const today = todayInAppZone();
  const progress = projectProgress(tasks, today);
  const archived = project.archivedAt !== null;
  const completed = project.completedAt !== null;
  // New work goes only to active projects: completed and archived ones get no "משימה חדשה".
  const assignable = isAssignableProject(project);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <bdi className="wrap-anywhere">{project.name}</bdi>
            <ProjectStatus project={project} />
          </span>
        }
      >
        {assignable ? (
          <QuickCreate
            today={today}
            defaultDeadline={defaultDeadline(today, settings.defaultDeadlineDays)}
            categories={categories}
            projects={projects.filter(isAssignableProject)}
            defaultProject={{ id: project.id, name: project.name }}
          />
        ) : null}
      </PageHeader>

      {completed && !archived ? (
        <p className="flex items-start gap-2 rounded-lg border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          הפרויקט הושלם: הוא לא מוצע בבחירת פרויקט, והמשימות שלו נשארות כפי שהן. כדי להוסיף לו משימות יש לפתוח אותו מחדש.
        </p>
      ) : null}
      {archived ? (
        <p className="flex items-start gap-2 rounded-lg border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
          <Archive aria-hidden className="mt-0.5 size-4 shrink-0" />
          הפרויקט בארכיון: הוא לא מוצע בבחירת פרויקט, והמשימות שלו נשארות זמינות.
        </p>
      ) : null}

      <section aria-labelledby="project-progress" className="flex flex-col gap-4 rounded-xl border bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="project-progress" className="text-sm font-medium text-text-secondary">
            התקדמות
          </h2>
          <ProgressSummary progress={progress} size="large" />
        </div>
        <ProjectActions
          projectId={project.id}
          name={project.name}
          archived={archived}
          completed={completed}
          openCount={progress.open}
          taskCount={tasks.length}
        />
      </section>

      <section aria-labelledby="project-tasks" className="flex flex-col gap-4">
        <h2 id="project-tasks" className="text-md font-semibold">
          משימות
        </h2>
        <TaskListSection
          basePath={`/projects/${project.id}`}
          tasks={tasks}
          filters={filters}
          today={today}
          projects={projects.map(({ id: projectId, name }) => ({ id: projectId, name }))}
          categories={categories}
          scopedToProject
          emptyTitle="אין משימות עדיין."
          emptyDescription={
            archived
              ? "הפרויקט בארכיון. כדי להוסיף לו משימות צריך להחזיר אותו מהארכיון."
              : completed
                ? "הפרויקט הושלם. כדי להוסיף לו משימות צריך לפתוח אותו מחדש."
                : "משימה חדשה מהכפתור למעלה תשויך לפרויקט הזה."
          }
        />
      </section>

      <section aria-labelledby="project-planning" className="flex flex-col gap-3">
        <h2 id="project-planning" className="text-md font-semibold">
          פריטי תכנון
        </h2>
        {planningItems.length > 0 ? (
          <ul className="flex flex-col rounded-xl border bg-surface">
            {planningItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 border-b px-3 py-2 last:border-b-0">
                <Diamond aria-hidden className="size-4 shrink-0 fill-primary text-primary" />
                <Link href={`/planning#planning-${item.id}`} className="font-medium wrap-anywhere hover:underline">
                  <bdi>{item.title}</bdi>
                </Link>
                <span className="text-sm tabular-nums text-text-secondary">{formatDateOnly(item.date)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">אין פריטי תכנון לפרויקט הזה.</p>
        )}
      </section>
    </>
  );
}

function ProjectSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="טוען פרויקט" className="flex flex-col gap-4">
      <div className="h-7 w-64 max-w-full rounded bg-surface-subtle" />
      <div className="h-20 rounded-xl border bg-surface" />
      <div className="h-40 rounded-xl border bg-surface" />
    </div>
  );
}
