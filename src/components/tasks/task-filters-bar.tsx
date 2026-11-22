"use client";

import { ArrowDownUp, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateOnly } from "@/domain/dates";
import { STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/domain/task";
import {
  DEFAULT_FILTERS,
  DUE_RANGE_LABELS,
  SORT_LABELS,
  activeFilterCount,
  hasActiveFilters,
  serializeTaskFilters,
  type DueRange,
  type SortKey,
  type TaskFilters,
} from "@/domain/task-filters";
import { cn } from "@/lib/utils";
import { DatePicker } from "./date-picker";
import { selectClassName, type Option } from "./form-parts";

const SEARCH_DEBOUNCE_MS = 300;

/** Filters and sort for the Tasks list (MASTER_SPEC §13). The URL is the state. */
export function TaskFiltersBar({
  filters: urlFilters,
  projects,
  categories,
  today,
  hideProject = false,
}: {
  filters: TaskFilters;
  /** On a project page the list is already scoped to that project. */
  hideProject?: boolean;
  projects: Option[];
  categories: Option[];
  today: DateOnly;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // Controls reflect a change immediately; the URL (the source of truth) follows.
  const [filters, setOptimisticFilters] = useOptimistic(urlFilters);
  const [q, setQ] = useState(filters.q);
  const lastPushedQ = useRef(filters.q);

  // Back/forward or a link changed the URL: show its query.
  useEffect(() => {
    if (filters.q !== lastPushedQ.current) {
      lastPushedQ.current = filters.q;
      setQ(filters.q);
    }
  }, [filters.q]);

  function navigate(next: TaskFilters, mode: "push" | "replace" = "push") {
    const query = serializeTaskFilters(next);
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      setOptimisticFilters(next);
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
  }

  const update = (patch: Partial<TaskFilters>) => navigate({ ...filters, ...patch });

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === filters.q) return;
    const timer = window.setTimeout(() => {
      lastPushedQ.current = trimmed;
      navigate({ ...filters, q: trimmed }, "replace");
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate/filters are read at fire time
  }, [q]);

  const toggleStatus = (status: TaskStatus) =>
    update({
      statuses: filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : TASK_STATUSES.filter((s) => s === status || filters.statuses.includes(s)),
    });

  const statusSummary =
    filters.statuses.length === 0
      ? "הכול"
      : filters.statuses.map((status) => STATUS_LABELS[status]).join(", ");

  // Below 768px the controls collapse behind "סינון (N)" so tasks are reachable first; the
  // panel shows the same controls and URL state (no second model).
  const [panelOpen, setPanelOpen] = useState(false);
  const count = activeFilterCount(filters);
  const summary = activeFilterSummary(filters, projects, categories);

  function clearFilters() {
    setQ("");
    lastPushedQ.current = "";
    navigate({ ...DEFAULT_FILTERS, sort: filters.sort, dir: filters.dir, showCompleted: filters.showCompleted });
  }

  return (
    <section aria-label="סינון ומיון" aria-busy={pending || undefined} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            aria-expanded={panelOpen}
            aria-controls={PANEL_ID}
            onClick={() => setPanelOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden />
            {count > 0 ? `סינון (${count})` : "סינון"}
          </Button>
          {count > 0 ? (
            <Button variant="ghost" onClick={clearFilters}>
              <X aria-hidden />
              ניקוי הסינון
            </Button>
          ) : null}
          <SortControls idPrefix="filter-m" filters={filters} update={update} className="ms-auto" />
        </div>
        {count > 0 && !panelOpen ? (
          <p className="text-sm text-text-secondary wrap-anywhere">
            <span className="sr-only">סינון פעיל: </span>
            {summary}
          </p>
        ) : null}
      </div>

      <div id={PANEL_ID} className={cn("flex-col gap-3 md:flex", panelOpen ? "flex" : "hidden")}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-48 flex-1 flex-col gap-1 sm:max-w-64">
            <label htmlFor="filter-q" className="text-sm font-medium">
              חיפוש במשימות
            </label>
            <Input
              id="filter-q"
              type="search"
              dir="auto"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  lastPushedQ.current = q.trim();
                  navigate({ ...filters, q: q.trim() }, "replace");
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span id="filter-status-label" className="text-sm font-medium">
              סטטוס
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" aria-labelledby="filter-status-label filter-status-value" className="justify-between">
                  <span id="filter-status-value" className="max-w-40 truncate">
                    {statusSummary}
                  </span>
                  <ChevronDown aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56">
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-sm font-medium">סינון לפי סטטוס</legend>
                  {TASK_STATUSES.map((status) => (
                    <label key={status} className="flex min-h-9 items-center gap-2 rounded-md px-1 text-base hover:bg-surface-subtle">
                      <input
                        type="checkbox"
                        checked={filters.statuses.includes(status)}
                        onChange={() => toggleStatus(status)}
                        className="size-4 accent-primary"
                      />
                      {STATUS_LABELS[status]}
                    </label>
                  ))}
                </fieldset>
              </PopoverContent>
            </Popover>
          </div>

          {hideProject ? null : (
            <RefSelect
              id="filter-project"
              label="פרויקט"
              noneLabel="ללא פרויקט"
              value={filters.projectId}
              options={projects}
              onChange={(projectId) => update({ projectId })}
            />
          )}
          <RefSelect
            id="filter-category"
            label="קטגוריה"
            noneLabel="ללא קטגוריה"
            value={filters.categoryId}
            options={categories}
            onChange={(categoryId) => update({ categoryId })}
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-due" className="text-sm font-medium">
              מועד
            </label>
            <select
              id="filter-due"
              value={filters.due ?? ""}
              onChange={(event) => {
                const due = (event.target.value || null) as DueRange | null;
                update({ due, from: null, to: null });
              }}
              className={cn(selectClassName, "w-auto")}
            >
              <option value="">הכול</option>
              {(Object.keys(DUE_RANGE_LABELS) as DueRange[]).map((range) => (
                <option key={range} value={range}>
                  {DUE_RANGE_LABELS[range]}
                </option>
              ))}
            </select>
          </div>

          {filters.due === "custom" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <span id="filter-from-label" className="text-sm font-medium">
                  מתאריך
                </span>
                <DatePicker
                  id="filter-from"
                  labelId="filter-from-label"
                  value={filters.from}
                  onChange={(from) => update({ from })}
                  today={today}
                  allowClear
                  placeholder="ללא"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span id="filter-to-label" className="text-sm font-medium">
                  עד תאריך
                </span>
                <DatePicker
                  id="filter-to"
                  labelId="filter-to-label"
                  value={filters.to}
                  onChange={(to) => update({ to })}
                  today={today}
                  allowClear
                  placeholder="ללא"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ToggleChip label="חשובות" checked={filters.important} onChange={(important) => update({ important })} />
          <ToggleChip label="דחופות" checked={filters.urgent} onChange={(urgent) => update({ urgent })} />
          <ToggleChip label="באיחור" checked={filters.overdue} onChange={(overdue) => update({ overdue })} />
          {/* Reached from the Dashboard's "הושלמו השבוע" counter; shown while active so it can be removed. */}
          {filters.completedThisWeek ? (
            <ToggleChip
              label="הושלמו השבוע"
              checked
              onChange={(completedThisWeek) => update({ completedThisWeek })}
            />
          ) : null}
          <label className="flex min-h-9 items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={filters.showCompleted}
              onChange={(event) => update({ showCompleted: event.target.checked })}
              className="size-4 accent-primary"
            />
            הצג משימות שהושלמו
          </label>

          {/* Narrow screens show sorting (and clearing) in the always-visible row above. */}
          <SortControls idPrefix="filter" filters={filters} update={update} className="hidden md:flex md:ms-auto" />

          {hasActiveFilters(filters) ? (
            <Button variant="ghost" className="hidden md:inline-flex" onClick={clearFilters}>
              <X aria-hidden />
              ניקוי הסינון
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const PANEL_ID = "task-filters-panel";

/** Active criteria in words, for the collapsed mobile bar ("חשובות · באיחור · פרויקט: …"). */
function activeFilterSummary(filters: TaskFilters, projects: Option[], categories: Option[]): string {
  const refName = (value: string | null, options: Option[], none: string) =>
    value === "none" ? none : (options.find((option) => option.id === value)?.name ?? "");
  const parts: string[] = [];
  if (filters.q) parts.push(`חיפוש: ${filters.q}`);
  if (filters.statuses.length > 0) parts.push(`סטטוס: ${filters.statuses.map((status) => STATUS_LABELS[status]).join(", ")}`);
  if (filters.projectId) parts.push(`פרויקט: ${refName(filters.projectId, projects, "ללא פרויקט")}`);
  if (filters.categoryId) parts.push(`קטגוריה: ${refName(filters.categoryId, categories, "ללא קטגוריה")}`);
  if (filters.important) parts.push("חשובות");
  if (filters.urgent) parts.push("דחופות");
  if (filters.overdue) parts.push("באיחור");
  if (filters.due) parts.push(`מועד: ${DUE_RANGE_LABELS[filters.due]}`);
  if (filters.completedThisWeek) parts.push("הושלמו השבוע");
  return parts.join(" · ");
}

function SortControls({
  idPrefix,
  filters,
  update,
  className,
}: {
  idPrefix: string;
  filters: TaskFilters;
  update: (patch: Partial<TaskFilters>) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={`${idPrefix}-sort`} className="text-sm font-medium">
        מיון
      </label>
      <select
        id={`${idPrefix}-sort`}
        value={filters.sort}
        onChange={(event) => update({ sort: event.target.value as SortKey })}
        className={cn(selectClassName, "w-auto")}
      >
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <option key={key} value={key}>
            {SORT_LABELS[key]}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="icon"
        onClick={() => update({ dir: filters.dir === "asc" ? "desc" : "asc" })}
        aria-label={filters.dir === "asc" ? "סדר עולה. לחיצה תהפוך לסדר יורד" : "סדר יורד. לחיצה תהפוך לסדר עולה"}
      >
        <ArrowDownUp aria-hidden />
      </Button>
    </div>
  );
}

function RefSelect({
  id,
  label,
  noneLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  noneLabel: string;
  value: string | null;
  options: Option[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className={cn(selectClassName, "w-auto max-w-48")}
      >
        <option value="">הכול</option>
        <option value="none">{noneLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border-input bg-surface px-3 text-sm hover:border-text-secondary",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
        "has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:checked]:font-semibold has-[:checked]:text-primary",
      )}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-primary" />
      {label}
    </label>
  );
}
