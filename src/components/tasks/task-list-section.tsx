import { ListChecks, SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import type { DateOnly } from "@/domain/dates";
import type { Task } from "@/domain/task";
import {
  DEFAULT_FILTERS,
  applyTaskFilters,
  hasActiveFilters,
  serializeTaskFilters,
  type TaskFilters,
} from "@/domain/task-filters";
import type { Option } from "./form-parts";
import { TaskFiltersBar } from "./task-filters-bar";
import { TasksTable } from "./tasks-table";

/**
 * Filter bar + count + table for a set of tasks: the Tasks page (all tasks) and a project page
 * (that project's tasks, already scoped by the query). Filters live in `basePath`'s URL.
 */
export function TaskListSection({
  basePath,
  tasks,
  filters,
  today,
  projects,
  categories,
  scopedToProject = false,
  emptyTitle,
  emptyDescription,
}: {
  basePath: string;
  tasks: Task[];
  filters: TaskFilters;
  today: DateOnly;
  /** All projects, including archived (for names and the filter). */
  projects: Option[];
  categories: Option[];
  scopedToProject?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (tasks.length === 0) {
    return <EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription} />;
  }

  const visible = applyTaskFilters(tasks, filters, today);
  const filtered = hasActiveFilters(filters);
  const clearQuery = serializeTaskFilters({
    ...DEFAULT_FILTERS,
    sort: filters.sort,
    dir: filters.dir,
    showCompleted: filters.showCompleted,
  });

  return (
    <>
      <TaskFiltersBar
        filters={filters}
        projects={projects}
        categories={categories}
        today={today}
        hideProject={scopedToProject}
      />
      <p role="status" className="text-sm text-text-secondary">
        {visible.length === 1 ? "משימה אחת" : `${visible.length} משימות`}
      </p>
      {visible.length > 0 ? (
        <TasksTable
          basePath={basePath}
          hideProject={scopedToProject}
          tasks={visible}
          today={today}
          filters={filters}
          projectNames={new Map(projects.map((project) => [project.id, project.name]))}
          categoryNames={new Map(categories.map((category) => [category.id, category.name]))}
        />
      ) : (
        <EmptyState
          icon={SearchX}
          title="לא נמצאו משימות."
          description={filtered ? "אין משימות שמתאימות לסינון הנוכחי." : "כל המשימות הושלמו."}
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href={clearQuery ? `${basePath}?${clearQuery}` : basePath}>ניקוי הסינון</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </>
  );
}
