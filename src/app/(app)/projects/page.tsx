import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressSummary } from "@/components/projects/progress-summary";
import { ProjectNameDialog } from "@/components/projects/project-name-dialog";
import { ProjectStatus } from "@/components/projects/project-status";
import { appDateOf, formatDateOnly, todayInAppZone } from "@/domain/dates";
import {
  EMPTY_PROGRESS,
  LIFECYCLE_LABELS,
  parseLifecycleParam,
  progressByProject,
  projectLifecycle,
  type Project,
  type ProjectLifecycle,
} from "@/domain/project";
import type { ProjectProgress } from "@/domain/project-progress";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/server/auth";
import { listProjectTaskStats, listProjects } from "@/server/data/projects";

export const metadata: Metadata = { title: "פרויקטים · לוח בקרה" };

export default function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <PageHeader title="פרויקטים">
        <ProjectNameDialog mode="create" />
      </PageHeader>
      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const LIFECYCLES: readonly ProjectLifecycle[] = ["active", "completed", "archived"];

const EMPTY_TEXT: Record<ProjectLifecycle, string> = {
  active: "אין פרויקטים פעילים.",
  completed: "אין פרויקטים שהושלמו.",
  archived: "אין פרויקטים בארכיון.",
};

const HEADINGS: Record<ProjectLifecycle, string> = {
  active: "פרויקטים פעילים",
  completed: "פרויקטים שהושלמו",
  archived: "פרויקטים בארכיון",
};

const lifecycleHref = (lifecycle: ProjectLifecycle) => (lifecycle === "active" ? "/projects" : `/projects?view=${lifecycle}`);

async function ProjectsContent({ searchParams }: Pick<PageProps<"/projects">, "searchParams">) {
  const auth = await requireAuth();
  const params = await searchParams;
  const shown = parseLifecycleParam(typeof params.view === "string" ? params.view : undefined);
  // Two queries for the whole page: projects, and the minimal task fields for progress.
  const [projects, taskStats] = await Promise.all([
    listProjects(auth, { includeArchived: true }),
    listProjectTaskStats(auth),
  ]);
  const progress = progressByProject(
    projects.map((project) => project.id),
    taskStats,
    todayInAppZone(),
  );
  // Each project is listed once (UAT-03): archived, else completed, else active.
  const byLifecycle = new Map<ProjectLifecycle, Project[]>(LIFECYCLES.map((lifecycle) => [lifecycle, []]));
  for (const project of projects) byLifecycle.get(projectLifecycle(project))!.push(project);
  const listed = byLifecycle.get(shown)!;

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="עדיין אין פרויקטים."
        description="פרויקט מקבץ משימות ומציג את ההתקדמות שלהן. אפשר ליצור אחד מהכפתור פרויקט חדש."
      />
    );
  }

  return (
    <>
      {/* The same URL-driven segmented links as the Gantt zoom: Back/Forward and reload keep the tab. */}
      <nav aria-label="מצב הפרויקטים">
        <ul className="flex w-fit flex-wrap rounded-lg border border-border p-0.5">
          {LIFECYCLES.map((lifecycle) => {
            const current = lifecycle === shown;
            return (
              <li key={lifecycle}>
                <Link
                  href={lifecycleHref(lifecycle)}
                  scroll={false}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                    current ? "bg-primary text-on-primary" : "hover:bg-surface-subtle",
                  )}
                >
                  {LIFECYCLE_LABELS[lifecycle]}
                  <span className={cn("tabular-nums", !current && "text-text-muted")}>({byLifecycle.get(lifecycle)!.length})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="projects-list" className="flex flex-col gap-3">
        <h2 id="projects-list" className="text-md font-semibold">
          {HEADINGS[shown]}
        </h2>
        {shown === "completed" ? (
          <p className="text-sm text-text-muted">פרויקטים שהושלמו לא מוצעים בבחירת פרויקט. אפשר לפתוח אותם מחדש מעמוד הפרויקט.</p>
        ) : null}
        {shown === "archived" ? (
          <p className="text-sm text-text-muted">פרויקטים בארכיון לא מוצעים בבחירת פרויקט. המשימות שלהם נשארות זמינות.</p>
        ) : null}
        {listed.length > 0 ? (
          <ProjectList projects={listed} progress={progress} lifecycle={shown} />
        ) : (
          <p className="rounded-xl border bg-surface px-4 py-6 text-text-muted">{EMPTY_TEXT[shown]}</p>
        )}
      </section>
    </>
  );
}

function ProjectList({
  projects,
  progress,
  lifecycle,
}: {
  projects: Project[];
  progress: Map<string, ProjectProgress>;
  lifecycle: ProjectLifecycle;
}) {
  return (
    <ul aria-labelledby="projects-list" className="flex flex-col rounded-xl border bg-surface">
      {projects.map((project) => (
        <li
          key={project.id}
          className="grid gap-x-6 gap-y-2 border-b px-4 py-3 last:border-b-0 hover:bg-surface-subtle md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <Link href={`/projects/${project.id}`} className="font-medium wrap-anywhere hover:underline">
              <bdi>{project.name}</bdi>
            </Link>
            {/* In "הושלמו" the tab already says it: only the date. In the archive, a completion is shown. */}
            {lifecycle === "completed" && project.completedAt ? (
              <span className="text-sm text-text-muted tabular-nums">הושלם ב־{formatDateOnly(appDateOf(project.completedAt))}</span>
            ) : null}
            {lifecycle === "archived" && project.completedAt ? (
              <ProjectStatus project={{ completedAt: project.completedAt, archivedAt: null }} />
            ) : null}
          </div>
          <ProgressSummary progress={progress.get(project.id) ?? EMPTY_PROGRESS} />
        </li>
      ))}
    </ul>
  );
}

function ProjectsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="טוען פרויקטים" className="flex flex-col rounded-xl border bg-surface">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex min-h-12 items-center gap-6 border-b px-4 last:border-b-0">
          <div className="h-4 w-1/4 rounded bg-surface-subtle" />
          <div className="h-4 w-1/3 rounded bg-surface-subtle" />
        </div>
      ))}
    </div>
  );
}
