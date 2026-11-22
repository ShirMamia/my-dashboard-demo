import { Diamond, Milestone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { DeletePlanningItemButton } from "@/components/planning/delete-planning-item-button";
import { PlanningItemDialog } from "@/components/planning/planning-item-dialog";
import { PreparationTaskDialog } from "@/components/planning/preparation-task-dialog";
import { StatusPill } from "@/components/tasks/task-signals";
import { formatDateLong, formatDateOnly, formatMonthName, todayInAppZone } from "@/domain/dates";
import { groupPlanningItems, type PlanningItem } from "@/domain/planning";
import { isAssignableProject, projectSuffix } from "@/domain/project";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/data/categories";
import { listPlanningItems } from "@/server/data/planning";
import { listProjects } from "@/server/data/projects";

export const metadata: Metadata = { title: "תכנון שנתי · לוח בקרה" };

const LIST_ID = "planning-list";

export default function PlanningPage() {
  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6">
      <Suspense fallback={<PlanningSkeleton />}>
        <PlanningContent />
      </Suspense>
    </div>
  );
}

async function PlanningContent() {
  const auth = await requireAuth();
  const today = todayInAppZone();
  // One parallel round: the items (each with its preparation task, embedded), projects, categories.
  const [items, projects, categories] = await Promise.all([
    listPlanningItems(auth),
    listProjects(auth, { includeArchived: true }),
    listCategories(auth),
  ]);
  const activeProjects = projects.filter(isAssignableProject).map(({ id, name }) => ({ id, name }));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const groups = groupPlanningItems(items);

  return (
    <>
      <PageHeader title="תכנון שנתי">
        <PlanningItemDialog today={today} projects={activeProjects} categories={categories} />
      </PageHeader>
      <p className="max-w-prose text-text-secondary">
        אבני דרך ותאריכים חשובים לאורך השנה, לפי תאריך. לכל פריט אפשר ליצור משימת הכנה עצמאית אחת.
      </p>

      {/* Focus lands here after a delete, whether or not items remain. */}
      <div id={LIST_ID} tabIndex={-1} className="flex flex-col gap-8 outline-none">
        {groups.length === 0 ? (
          <EmptyState
            icon={Milestone}
            title="עדיין אין פריטי תכנון."
            description="אבן דרך היא תאריך חשוב בשנה, כמו כנס, הגשה או חופשה. אפשר להוסיף אחת מהכפתור פריט תכנון חדש."
          />
        ) : (
          groups.map((year) => (
            <section key={year.year} aria-labelledby={`planning-year-${year.year}`} className="flex flex-col gap-4">
              <h2 id={`planning-year-${year.year}`} className="text-lg font-semibold tabular-nums">
                {year.year}
              </h2>
              {year.months.map((month) => (
                <section key={month.month} aria-labelledby={`planning-month-${month.month}`} className="flex flex-col gap-2">
                  <h3 id={`planning-month-${month.month}`} className="text-md font-medium text-text-secondary">
                    {formatMonthName(month.month)}
                  </h3>
                  <ul aria-labelledby={`planning-month-${month.month}`} className="flex flex-col rounded-xl border bg-surface">
                    {month.items.map((item) => (
                      <PlanningRow
                        key={item.id}
                        item={item}
                        today={today}
                        project={item.projectId ? projectById.get(item.projectId) : undefined}
                        categoryName={item.categoryId ? categoryNames.get(item.categoryId) : undefined}
                        activeProjects={activeProjects}
                        categories={categories}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ))
        )}
      </div>
    </>
  );
}

function PlanningRow({
  item,
  today,
  project,
  categoryName,
  activeProjects,
  categories,
}: {
  item: PlanningItem;
  today: string;
  project?: { id: string; name: string; archivedAt: string | null; completedAt: string | null };
  categoryName?: string;
  activeProjects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const suffix = project ? projectSuffix(project) : "";
  return (
    <li
      id={`planning-${item.id}`}
      className="flex scroll-mt-6 flex-col gap-3 border-b px-4 py-3 last:border-b-0 md:flex-row md:items-start md:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex items-start gap-2 font-semibold wrap-anywhere">
          <Diamond aria-hidden className="mt-1 size-4 shrink-0 fill-primary text-primary" />
          <bdi>{item.title}</bdi>
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-secondary">
          <span>
            {formatDateLong(item.date)}
            {item.date < today ? " · עבר" : ""}
          </span>
          {project ? (
            <Link href={`/projects/${project.id}`} className="hover:underline">
              <span className="sr-only">פרויקט: </span>
              <bdi>{project.name}</bdi>
              {suffix}
            </Link>
          ) : null}
          {categoryName ? (
            <span>
              <span className="sr-only">קטגוריה: </span>
              <bdi>{categoryName}</bdi>
            </span>
          ) : null}
        </p>
        {item.notes ? <p className="text-sm whitespace-pre-line text-text-secondary wrap-anywhere">{item.notes}</p> : null}
        {item.preparationTask ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/tasks/${item.preparationTask.id}`} className="font-medium text-primary hover:underline">
              משימת הכנה: <span className="tabular-nums">{formatDateOnly(item.preparationTask.deadline)}</span>
              <span className="sr-only"> ({item.preparationTask.title})</span>
            </Link>
            {item.preparationTask.status === "done" ? <StatusPill status="done" /> : null}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {item.preparationTask ? null : <PreparationTaskDialog item={item} today={today} />}
        <PlanningItemDialog
          item={{ ...item, projectName: project?.name, projectSuffix: suffix }}
          today={today}
          projects={activeProjects}
          categories={categories}
        />
        <DeletePlanningItemButton itemId={item.id} title={item.title} hasPreparationTask={item.preparationTask !== null} focusAfterId={LIST_ID} />
      </div>
    </li>
  );
}

function PlanningSkeleton() {
  return (
    <>
      <PageHeader title="תכנון שנתי" />
      <div role="status" aria-busy="true" aria-label="טוען את התכנון השנתי" className="flex flex-col rounded-xl border bg-surface">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex min-h-16 flex-col justify-center gap-2 border-b px-4 last:border-b-0">
            <div className="h-4 w-1/4 rounded bg-surface-subtle" />
            <div className="h-4 w-1/3 rounded bg-surface-subtle" />
          </div>
        ))}
      </div>
    </>
  );
}
