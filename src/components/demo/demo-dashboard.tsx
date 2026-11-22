"use client";

import { CircleCheck, LayoutDashboard, RotateCcw, Search } from "lucide-react";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DeadlineText, ImportantMark, StatusPill, UrgentMark, signalsOf } from "@/components/tasks/task-signals";
import { Button } from "@/components/ui/button";
import { buildDashboard } from "@/domain/dashboard";
import { formatDateLong } from "@/domain/dates";
import { applyStatusChange, isOpen, type TaskSummary } from "@/domain/task";
import { applyTaskFilters, DEFAULT_FILTERS, type TaskFilters } from "@/domain/task-filters";
import { DEMO_DATE, DEMO_TASKS, DEMO_TIME } from "./demo-data";

const FILTERS: readonly { id: string; label: string; patch: Partial<TaskFilters> }[] = [
  { id: "open", label: "פתוחות", patch: {} },
  { id: "overdue", label: "באיחור", patch: { overdue: true } },
  { id: "important", label: "חשובות", patch: { important: true } },
  { id: "done", label: "הושלמו השבוע", patch: { completedThisWeek: true } },
];

export function DemoDashboard() {
  const [tasks, setTasks] = useState(DEMO_TASKS);
  const [activeFilter, setActiveFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const focusHeading = useRef<HTMLHeadingElement>(null);
  const tasksHeading = useRef<HTMLHeadingElement>(null);

  const { today, kpis } = buildDashboard({
    openTasks: tasks.filter(isOpen),
    completed: tasks.filter((task) => !isOpen(task)),
    picks: [],
    dismissedTaskIds: [],
    today: DEMO_DATE,
  });
  const filter = FILTERS.find(({ id }) => id === activeFilter);
  const filtered = applyTaskFilters(
    tasks,
    { ...DEFAULT_FILTERS, ...filter?.patch, q: query.trim() },
    DEMO_DATE,
  );

  function toggleTask(task: TaskSummary, nextFocus: HTMLHeadingElement | null) {
    const status = task.status === "done" ? "todo" : "done";
    setTasks((current) => current.map((item) => {
      if (item.id !== task.id) return item;
      return { ...item, ...applyStatusChange(item, status, new Date(DEMO_TIME)) };
    }));
    setAnnouncement(status === "done" ? "המשימה סומנה כהושלמה." : "המשימה נפתחה מחדש.");
    nextFocus?.focus();
  }

  function reset() {
    setTasks(DEMO_TASKS);
    setActiveFilter("open");
    setQuery("");
    setAnnouncement("נתוני ההדגמה אופסו.");
  }

  return (
    <div className="min-h-dvh bg-surface-subtle">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <span className="inline-flex items-center gap-2 font-semibold">
            <LayoutDashboard aria-hidden className="size-5 text-primary" />
            לוח בקרה
          </span>
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw aria-hidden className="size-4" />
            איפוס הדגמה
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <PageHeader title="לוח בקרה אישי">
          <p className="text-sm text-text-secondary">{formatDateLong(DEMO_DATE)}</p>
        </PageHeader>
        <p className="text-sm text-text-secondary">
          המשימות בדף הן לדוגמה. השינויים נשמרים עד לרענון הדף.
        </p>
        <p role="status" className="sr-only">{announcement}</p>

        <ul aria-label="סיכום משימות" className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "פתוחות", value: kpis.open, color: "text-foreground" },
            { label: "באיחור", value: kpis.overdue, color: "text-danger" },
            { label: "הושלמו השבוע", value: kpis.completedThisWeek, color: "text-success" },
          ].map(({ label, value, color }) => (
            <li key={label} className="rounded-xl border bg-surface px-5 py-4">
              <span className={`block text-xl font-semibold tabular-nums ${color}`}>{value}</span>
              <span className="text-sm text-text-secondary">{label}</span>
            </li>
          ))}
        </ul>

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.12fr]">
          <section aria-labelledby="demo-focus" className="rounded-xl border bg-surface">
            <h2 ref={focusHeading} id="demo-focus" tabIndex={-1} className="border-b px-5 py-4 text-lg font-semibold">
              המשימות למיקוד היום
            </h2>
            {today.length ? (
              <ol className="divide-y">
                {today.map(({ task, reasonText }) => (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-text-secondary">{reasonText}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`סימון כהושלמה: ${task.title}`}
                      onClick={() => toggleTask(task, focusHeading.current)}
                    >
                      <CircleCheck aria-hidden className="size-5" />
                    </Button>
                  </li>
                ))}
              </ol>
            ) : <p className="px-5 py-4 text-text-secondary">אין משימות למיקוד היום.</p>}
          </section>

          <section aria-labelledby="demo-tasks" className="rounded-xl border bg-surface">
            <div className="flex flex-col gap-3 border-b px-5 py-4">
              <h2 ref={tasksHeading} id="demo-tasks" tabIndex={-1} className="text-lg font-semibold">משימות</h2>
              <label className="flex items-center gap-2 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-ring">
                <Search aria-hidden className="size-4 shrink-0 text-text-secondary" />
                <span className="sr-only">חיפוש משימות</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-h-10 w-full bg-transparent outline-none"
                  placeholder="חיפוש משימות"
                />
              </label>
              <div role="group" aria-label="סינון משימות" className="flex flex-wrap gap-2">
                {FILTERS.map(({ id, label }) => (
                  <Button
                    key={id}
                    type="button"
                    variant={activeFilter === id ? "default" : "outline"}
                    aria-pressed={activeFilter === id}
                    onClick={() => setActiveFilter(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {filtered.length ? (
              <ul className="divide-y">
                {filtered.map((task) => {
                  const signals = signalsOf(task, DEMO_DATE);
                  return (
                    <li key={task.id} className="flex items-start justify-between gap-3 px-5 py-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{task.title}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
                          <span>{task.projectId}</span>
                          <DeadlineText task={task} signals={signals} />
                          <StatusPill status={task.status} />
                          <UrgentMark signals={signals} />
                          <ImportantMark important={task.isImportant} />
                        </span>
                      </div>
                      <Button type="button" variant="ghost" onClick={() => toggleTask(task, tasksHeading.current)}>
                        {task.status === "done" ? "פתיחה מחדש" : "סיום"}
                        <span className="sr-only">: {task.title}</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-5 py-4 text-text-secondary">אין משימות שמתאימות לסינון.</p>}
          </section>
        </div>
      </main>
    </div>
  );
}
