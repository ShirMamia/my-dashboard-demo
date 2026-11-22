import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EditTaskForm } from "@/components/tasks/edit-task-form";
import { todayInAppZone } from "@/domain/dates";
import { isAssignableProject } from "@/domain/project";
import { defaultDeadline } from "@/domain/task";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/data/categories";
import { listProjects } from "@/server/data/projects";
import { getSettings } from "@/server/data/settings";
import { getTask } from "@/server/data/tasks";
import { isUuid } from "@/lib/uuid";
import TaskNotFound from "./not-found";

export const metadata: Metadata = { title: "עריכת משימה · לוח בקרה" };


export default function EditTaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="נתיב">
        <Link href="/tasks" className="text-sm text-primary hover:underline">
          משימות
        </Link>
      </nav>
      <Suspense fallback={<PageHeader title="עריכת משימה" />}>
        <EditTaskContent params={params} />
      </Suspense>
    </div>
  );
}

async function EditTaskContent({ params }: Pick<PageProps<"/tasks/[id]">, "params">) {
  const { id } = await params;
  // Rendered inline, not notFound(): this runs inside <Suspense>, after the shell has streamed, where
  // throwing makes React switch the boundary to client rendering and log #419. (The status is
  // 200 either way once streaming has started.)
  if (!isUuid(id)) return <TaskNotFound />;
  const auth = await requireAuth();
  const [task, projects, categories, settings] = await Promise.all([
    getTask(auth, id),
    listProjects(auth, { includeArchived: true }),
    listCategories(auth),
    getSettings(auth),
  ]);
  if (!task) return <TaskNotFound />;
  const today = todayInAppZone();
  const currentProject = projects.find((project) => project.id === task.projectId);
  // Completed and archived projects stay selectable only for the task that already uses one.
  const pickerProjects = projects
    .filter((project) => isAssignableProject(project) || project.id === task.projectId)
    .map(({ id: projectId, name }) => ({ id: projectId, name }));

  return (
    <>
      <PageHeader title="עריכת משימה" />
      {currentProject ? (
        <p className="text-sm text-text-secondary">
          פרויקט:{" "}
          <Link href={`/projects/${currentProject.id}`} className="text-primary hover:underline">
            <bdi>{currentProject.name}</bdi>
          </Link>
        </p>
      ) : null}
      <EditTaskForm
        key={task.id}
        task={task}
        today={today}
        defaultDeadline={defaultDeadline(today, settings.defaultDeadlineDays)}
        categories={categories}
        projects={pickerProjects}
      />
    </>
  );
}
