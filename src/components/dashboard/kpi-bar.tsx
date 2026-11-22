import { CircleCheck } from "lucide-react";
import Link from "next/link";
import type { DashboardKpis } from "@/domain/dashboard";
import { tasksHref } from "@/domain/task-filters";
import { cn } from "@/lib/utils";

/**
 * KPI counters (MASTER_SPEC §7.3): small numbers + labels, each a link to the matching Tasks
 * filter. Not deduplicated: each counts every qualifying task. Semantic accents only when there
 * is something to say: overdue > 0 in danger red; completed this week > 0 in success green, with a
 * check icon (MASTER.md §2 "Success green"). The label always says it in text; no tinted cards.
 */
export function KpiBar({ kpis }: { kpis: DashboardKpis }) {
  const items = [
    { label: "פתוחות", value: kpis.open, href: tasksHref({}), tone: null },
    { label: "באיחור", value: kpis.overdue, href: tasksHref({ overdue: true }), tone: kpis.overdue > 0 ? "danger" : null },
    {
      label: "הושלמו השבוע",
      value: kpis.completedThisWeek,
      href: tasksHref({ completedThisWeek: true }),
      tone: kpis.completedThisWeek > 0 ? "success" : null,
    },
  ];
  return (
    <ul aria-label="סיכום משימות" className="flex flex-wrap gap-x-8 gap-y-2">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="inline-flex items-baseline gap-2 rounded-md hover:underline"
          >
            {item.tone === "success" ? (
              <CircleCheck aria-hidden data-kpi-success className="size-4 shrink-0 self-center text-success" />
            ) : null}
            <span
              className={cn(
                "text-xl font-semibold tabular-nums",
                item.tone === "danger" && "text-danger",
                item.tone === "success" && "text-success",
              )}
            >
              {item.value}
            </span>
            <span className="text-xs text-text-secondary">{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Same footprint as KpiBar, with no numbers (never a misleading 0 while loading). */
export function KpiBarSkeleton() {
  return (
    <div aria-hidden className="flex flex-wrap gap-x-8 gap-y-2">
      {["פתוחות", "באיחור", "הושלמו השבוע"].map((label) => (
        <span key={label} className="inline-flex items-baseline gap-2">
          <span className="inline-block h-6 w-7 self-center rounded bg-surface-subtle" />
          <span className="text-xs text-text-muted">{label}</span>
        </span>
      ))}
    </div>
  );
}
