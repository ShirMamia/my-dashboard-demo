import { ChevronLeft, ChevronRight, Diamond, Square } from "lucide-react";
import Link from "next/link";
import {
  hiddenDeadlineOnlyText,
  stepAnchor,
  TIMELINE_ZOOMS,
  timelineHref,
  ZOOM_LABELS,
  zoomAnchor,
  type TimelineModel,
  type TimelineParams,
} from "@/domain/timeline";
import type { DateOnly } from "@/domain/dates";
import { cn } from "@/lib/utils";
import { TimelineToggle } from "./timeline-toggle";

const CONTROL = "inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-subtle";

/**
 * Range navigation, zoom, and the view filters (MASTER.md §6 Gantt). Every state is a URL, so
 * Back/Forward and reload restore it. The earlier/later pair follows the timeline, not the page:
 * earlier on the left (MASTER.md §5, the Gantt exception), labelled in Hebrew.
 */
export function TimelineToolbar({
  params,
  model,
  title,
  today,
}: {
  params: TimelineParams;
  model: TimelineModel;
  title: string;
  today: DateOnly;
}) {
  const { range } = model;
  const href = (changes: Partial<TimelineParams>) => timelineHref({ ...params, ...changes });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 aria-live="polite" className="min-w-36 text-lg font-semibold tabular-nums">
            {title}
          </h2>
          <div dir="ltr" role="group" aria-label="ניווט בטווח" className="flex items-center gap-1">
            <Link href={href({ anchor: stepAnchor(range, -1) })} scroll={false} className={CONTROL}>
              <ChevronLeft aria-hidden className="size-4" />
              <span dir="rtl">מוקדם יותר</span>
            </Link>
            <Link href={href({ anchor: stepAnchor(range, 1) })} scroll={false} className={CONTROL}>
              <span dir="rtl">מאוחר יותר</span>
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </div>
          <Link href={timelineHref({ ...params, anchor: undefined })} scroll={false} className={CONTROL}>
            היום
          </Link>
        </div>
        <nav aria-label="רמת תצוגה">
          <ul className="flex rounded-lg border border-border p-0.5">
            {TIMELINE_ZOOMS.map((zoom) => {
              const current = zoom === range.zoom;
              return (
                <li key={zoom}>
                  <Link
                    href={href({ zoom, anchor: zoomAnchor(range, today) })}
                    scroll={false}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "inline-flex min-h-8 items-center rounded-md px-3 text-sm font-medium",
                      current ? "bg-primary text-on-primary" : "hover:bg-surface-subtle",
                    )}
                  >
                    {ZOOM_LABELS[zoom]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <TimelineToggle
          label="הצג משימות שהושלמו"
          checked={params.showDone}
          checkedHref={href({ showDone: true })}
          uncheckedHref={href({ showDone: false })}
        />
        {model.densityFilter ? (
          <TimelineToggle
            label="הצג גם משימות עם מועד בלבד"
            checked={params.showDeadlineOnly}
            checkedHref={href({ showDeadlineOnly: true })}
            uncheckedHref={href({ showDeadlineOnly: false })}
          />
        ) : null}
        {model.hiddenDeadlineOnly > 0 ? (
          <p className="text-sm text-text-muted">{hiddenDeadlineOnlyText(model.hiddenDeadlineOnly)}</p>
        ) : null}
        {/* The list is the only view below 768px; wider screens can switch. */}
        <Link href={href({ list: !params.list })} scroll={false} className={cn(CONTROL, "ms-auto hidden md:inline-flex")}>
          {params.list ? "הצג כגאנט" : "הצג כרשימה"}
        </Link>
      </div>
    </div>
  );
}

export function TimelineLegend() {
  return (
    <ul aria-label="מקרא" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-secondary">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-5 rounded-sm border border-text-muted bg-surface-subtle" />
        משימה מתאריך התחלה עד מועד
      </li>
      <li className="flex items-center gap-1.5">
        <Square aria-hidden className="size-4" />
        מועד משימה (ללא תאריך התחלה)
      </li>
      <li className="flex items-center gap-1.5">
        <Diamond aria-hidden className="size-4 fill-primary text-primary" />
        פריט תכנון
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-4 w-0.5 bg-primary" />
        היום
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-danger bg-danger-tint" />
        באיחור
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-5 rounded-sm border border-dashed border-text-muted bg-surface" />
        הושלמה
      </li>
    </ul>
  );
}
