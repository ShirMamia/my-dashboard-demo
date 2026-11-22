import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import type { DateOnly } from "@/domain/dates";
import { isOpen, isOverdue, type Task } from "@/domain/task";
import { serializeTaskFilters, type SortKey, type TaskFilters } from "@/domain/task-filters";
import { isAutoUrgent } from "@/domain/urgency";
import { cn } from "@/lib/utils";
import { CompleteToggle } from "./complete-toggle";
import { DeadlineText, ImportantMark, StatusPill, UrgentMark, signalsOf } from "./task-signals";
import { ImportantToggle, UrgentToggle } from "./task-quick-flags";

/** What the quick urgency control needs; the rule itself is domain/urgency.ts#quickUrgency. */
function urgencyProps(task: Task, today: DateOnly) {
  return {
    taskId: task.id,
    title: task.title,
    urgentOverride: task.urgentOverride,
    open: isOpen(task),
    autoUrgent: isAutoUrgent(task, today),
    overdue: isOverdue(task, today),
  };
}

// Dense Tasks list (MASTER.md §6 "Tasks list"): a native <table> with sortable headers and
// aria-sort at ≥1024px; the same rows as a list below 1024px (8 columns don't fit beside the rail). No bulk actions.
// Completion follows the title: an action on the task. The row's leading edge stays free for a
// future row-selection mode (ROADMAP V1.1), so selection and completion never share a place or a look.

export const TASKS_LIST_ID = "tasks-list";

function sortHref(basePath: string, filters: TaskFilters, key: SortKey): string {
  const dir = filters.sort === key && filters.dir === "asc" ? "desc" : "asc";
  const query = serializeTaskFilters({ ...filters, sort: key, dir });
  return query ? `${basePath}?${query}` : basePath;
}

function SortHeader({
  basePath,
  filters,
  sortKey,
  children,
}: {
  basePath: string;
  filters: TaskFilters;
  sortKey: SortKey;
  children: string;
}) {
  const active = filters.sort === sortKey;
  const Arrow = filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      className="px-3 py-2 text-start font-medium"
    >
      <Link href={sortHref(basePath, filters, sortKey)} scroll={false} className="inline-flex min-h-6 items-center gap-1 hover:underline">
        {children}
        {active ? <Arrow aria-hidden className="size-3.5" /> : null}
        <span className="sr-only">
          {active
            ? filters.dir === "asc"
              ? " (ממוין בסדר עולה; לחיצה תמיין בסדר יורד)"
              : " (ממוין בסדר יורד; לחיצה תמיין בסדר עולה)"
            : " (לחיצה תמיין לפי עמודה זו)"}
        </span>
      </Link>
    </th>
  );
}

export function TasksTable({
  basePath = "/tasks",
  tasks,
  today,
  filters,
  projectNames,
  categoryNames,
  hideProject = false,
}: {
  /** The list page the sort links stay on (Tasks, or a project page). */
  basePath?: string;
  /** On a project page every row has that project: its column and line are left out. */
  hideProject?: boolean;
  tasks: Task[];
  today: DateOnly;
  filters: TaskFilters;
  projectNames: Map<string, string>;
  categoryNames: Map<string, string>;
}) {
  const nameOf = (names: Map<string, string>, id: string | null) =>
    id && names.has(id) ? <bdi>{names.get(id)}</bdi> : <span className="text-text-muted" aria-label="ללא">—</span>;

  return (
    <div id={TASKS_LIST_ID} tabIndex={-1} className="outline-none">
      <table className="hidden w-full border-collapse rounded-xl border bg-surface text-base lg:table">
        <caption className="sr-only">רשימת המשימות</caption>
        <thead className="bg-surface-subtle text-sm text-text-secondary">
          <tr className="border-b">
            <SortHeader basePath={basePath} filters={filters} sortKey="title">
              כותרת
            </SortHeader>
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">הושלמה</span>
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              סטטוס
            </th>
            {hideProject ? null : (
              <th scope="col" className="px-3 py-2 text-start font-medium">
                פרויקט
              </th>
            )}
            <th scope="col" className="px-3 py-2 text-start font-medium">
              קטגוריה
            </th>
            <SortHeader basePath={basePath} filters={filters} sortKey="deadline">
              מועד
            </SortHeader>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              דחופה
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              חשובה
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const signals = signalsOf(task, today);
            return (
              <tr key={task.id} className="border-b last:border-b-0 hover:bg-surface-subtle">
                <td className="min-w-48 px-3 py-2 align-top">
                  <Link
                    href={`/tasks/${task.id}`}
                    className={cn("font-medium hover:underline wrap-anywhere", task.status === "done" && "text-text-secondary line-through")}
                  >
                    <bdi>{task.title}</bdi>
                  </Link>
                </td>
                <td className="px-3 py-2 align-top">
                  <CompleteToggle taskId={task.id} title={task.title} status={task.status} focusAfterId={TASKS_LIST_ID} />
                </td>
                <td className="px-3 py-2 align-top">
                  <StatusPill status={task.status} />
                </td>
                {hideProject ? null : (
                  <td className="px-3 py-2 align-top">
                    {task.projectId && projectNames.has(task.projectId) ? (
                      <Link href={`/projects/${task.projectId}`} className="hover:underline">
                        <bdi>{projectNames.get(task.projectId)}</bdi>
                      </Link>
                    ) : (
                      nameOf(projectNames, task.projectId)
                    )}
                  </td>
                )}
                <td className="px-3 py-2 align-top">{nameOf(categoryNames, task.categoryId)}</td>
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  <DeadlineText task={task} signals={signals} />
                </td>
                <td className="px-2 py-1 align-top">
                  <UrgentToggle {...urgencyProps(task, today)} />
                </td>
                <td className="px-2 py-1 align-top">
                  <ImportantToggle taskId={task.id} title={task.title} important={task.isImportant} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul aria-label="רשימת המשימות" className="flex flex-col rounded-xl border bg-surface lg:hidden">
        {tasks.map((task) => {
          const signals = signalsOf(task, today);
          return (
            <li key={task.id} className="flex items-start gap-3 border-b p-3 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  href={`/tasks/${task.id}`}
                  className={cn("font-medium hover:underline wrap-anywhere", task.status === "done" && "text-text-secondary line-through")}
                >
                  <bdi>{task.title}</bdi>
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <DeadlineText task={task} signals={signals} />
                  <UrgentMark signals={signals} />
                  <ImportantMark important={signals.important} />
                  <StatusPill status={task.status} />
                </div>
                {(task.projectId && !hideProject) || task.categoryId ? (
                  <p className="text-sm text-text-secondary">
                    {task.projectId && !hideProject && projectNames.has(task.projectId) ? <bdi>{projectNames.get(task.projectId)}</bdi> : null}
                    {task.projectId && !hideProject && task.categoryId ? " · " : null}
                    {task.categoryId && categoryNames.has(task.categoryId) ? <bdi>{categoryNames.get(task.categoryId)}</bdi> : null}
                  </p>
                ) : null}
              </div>
              {/* The task's actions at the row's end, all 44px targets: completion beside the
                  title, the quieter quick actions under it (the title keeps the width). */}
              <div className="-my-1.5 -me-1.5 flex shrink-0 flex-col items-end">
                <span className="inline-flex size-11 items-center justify-center">
                  <CompleteToggle taskId={task.id} title={task.title} status={task.status} focusAfterId={TASKS_LIST_ID} />
                </span>
                <div className="flex items-center">
                  <UrgentToggle {...urgencyProps(task, today)} showNote={false} />
                  <ImportantToggle taskId={task.id} title={task.title} important={task.isImportant} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
