import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { DeadlineText, ImportantMark, UrgentMark, signalsOf } from "@/components/tasks/task-signals";
import type { DashboardSection as Section } from "@/domain/dashboard";
import type { DateOnly } from "@/domain/dates";

/**
 * A secondary Dashboard section (MASTER_SPEC §7.2): up to 5 compact rows, deduplicated against
 * higher sections, every signal still shown. No count in the heading (it would disagree with
 * the deduplicated rows); "הצגת הכול" opens the full, non-deduplicated Tasks filter.
 */
export function DashboardSection({
  id,
  title,
  allLabel,
  allHref,
  emptyText,
  section,
  today,
}: {
  id: string;
  title: string;
  /** Completes "הצגת הכול" for screen readers, e.g. "המשימות הדחופות". */
  allLabel: string;
  allHref: string;
  emptyText: string;
  section: Section;
  today: DateOnly;
}) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id={headingId} className="text-md font-semibold">
          {title}
        </h2>
        {section.total > 0 ? (
          <Link href={allHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            הצגת הכול
            <span className="sr-only"> {allLabel}</span>
            <ChevronRight aria-hidden className="size-4 rtl:-scale-x-100" />
          </Link>
        ) : null}
      </div>
      {section.rows.length > 0 ? (
        <ul aria-labelledby={headingId} className="flex flex-col border-y">
          {section.rows.map((task) => {
            const signals = signalsOf(task, today);
            return (
              <li
                key={task.id}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0"
              >
                <Link href={`/tasks/${task.id}`} className="min-w-0 font-medium wrap-anywhere hover:underline">
                  <bdi>{task.title}</bdi>
                </Link>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                  <DeadlineText task={task} signals={signals} />
                  <UrgentMark signals={signals} />
                  <ImportantMark important={signals.important} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-text-muted">
          {/* All qualifying tasks may already be listed higher up (dedup). */}
          {section.total > 0 ? "כל המשימות כאן כבר מופיעות למעלה." : emptyText}
        </p>
      )}
    </section>
  );
}
