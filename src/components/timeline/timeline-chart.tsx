import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { TimelineEntry, TimelineGroup, TimelineModel, TimelineZoom } from "@/domain/timeline";
import { cn } from "@/lib/utils";
import { EntryIcon } from "./entry-icon";
import { entryClipping, entryDates, entryHref, entryState } from "./entry-text";
import { TimelineScroller } from "./timeline-scroller";

// The visual Gantt (MASTER.md §6 Gantt; ARCHITECTURE §8.3): a read-only renderer of the domain
// model. Day offsets become percentages of the chart column here, and nowhere else.
//
// Layout: one LTR scroll area. Every row is a two-column grid, [chart | labels], so labels and
// bars always share a row; the label column is sticky at the right (inline-end in this LTR area)
// and its text is RTL. Each row's link sits in the label column (one tab stop per item, always
// visible); the bars repeat it for the pointer, outside the tab order and the accessibility tree.

/** Minimum width of one day per zoom: below it the chart scrolls inside its own area. */
const MIN_DAY_WIDTH: Record<TimelineZoom, number> = { week: 88, month: 28, quarter: 10, year: 3 };

const ROW = "grid grid-cols-[minmax(0,1fr)_var(--label-w)]";
const LABEL_CELL = "sticky end-0 z-10 col-start-2 row-start-1 flex min-w-0 border-s bg-surface";

export function TimelineChart({ model, title }: { model: TimelineModel; title: string }) {
  const { range } = model;
  const percent = (days: number) => `${(days / range.days) * 100}%`;
  return (
    <TimelineScroller label={`ציר זמן: ${title}`} resetKey={`${range.zoom}:${range.from}`}>
      <div
        className="relative"
        style={{ minInlineSize: `calc(var(--label-w) + ${range.days * MIN_DAY_WIDTH[range.zoom]}px)` }}
      >
        <GridLines model={model} percent={percent} />
        <Scale model={model} percent={percent} />
        {model.groups.map((group) => (
          <Group key={group.key} group={group} percent={percent} />
        ))}
      </div>
    </TimelineScroller>
  );
}

type Percent = (days: number) => string;

/** Behind the rows: minor-unit lines, stronger lines between major units, and the Today line. */
function GridLines({ model, percent }: { model: TimelineModel; percent: Percent }) {
  const majorStarts = new Set(model.scale.major.map((segment) => segment.start));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 end-(--label-w)">
      {model.scale.minor
        .filter((segment) => segment.start > 0)
        .map((segment) => (
          <div
            key={segment.key}
            className={cn("absolute inset-y-0 w-px", majorStarts.has(segment.start) ? "bg-border-strong" : "bg-border")}
            style={{ insetInlineStart: percent(segment.start) }}
          />
        ))}
      {model.today !== null ? (
        <div
          data-today
          className="absolute inset-y-0 z-[1] w-0.5 bg-primary"
          style={{ insetInlineStart: `calc(${percent(model.today + 0.5)} - 1px)` }}
        />
      ) : null}
    </div>
  );
}

/** The axis: major units above minor units, and a "היום" tag over the Today line. */
function Scale({ model, percent }: { model: TimelineModel; percent: Percent }) {
  const todayAt = model.today === null ? null : (model.today + 0.5) / model.range.days;
  return (
    <div className={cn(ROW, "border-b")}>
      <div data-label-column className={cn(LABEL_CELL, "items-end")}>
        <p dir="rtl" className="w-full px-3 pb-1.5 text-sm font-medium text-text-secondary">
          פרויקט ופריט
        </p>
      </div>
      {/* Opaque and above the grid lines: the Today line starts below the axis, under its tag. */}
      <div className="relative z-[2] col-start-1 row-start-1 flex flex-col bg-surface text-xs text-text-secondary">
        {todayAt !== null ? (
          <div className="relative h-6">
            <span
              className="absolute top-1 rounded-sm bg-primary px-1.5 font-medium text-on-primary"
              // Hangs off the line toward the middle of the chart, so it never leaves the chart.
              style={todayAt < 0.9 ? { insetInlineStart: `calc(${todayAt * 100}% - 1px)` } : { insetInlineEnd: `calc(${(1 - todayAt) * 100}% - 1px)` }}
            >
              היום
            </span>
          </div>
        ) : null}
        {[model.scale.major, model.scale.minor].map((tier, index) => (
          <div key={index} className={cn("relative h-7", index === 0 && "font-medium text-text-primary")}>
            {tier.map((segment) => (
              // Positioned in the LTR axis; only the text inside is direction-isolated (a dir="auto"
              // on the positioned box would flip its inline-start for Hebrew labels).
              <span
                key={segment.key}
                className="absolute inset-y-0 flex items-center justify-center px-0.5 tabular-nums"
                style={{ insetInlineStart: percent(segment.start), inlineSize: percent(segment.length) }}
              >
                <span dir="auto" className="truncate">
                  {segment.label}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Group({ group, percent }: { group: TimelineGroup; percent: Percent }) {
  const headingId = `timeline-group-${group.key}`;
  return (
    <section aria-labelledby={headingId}>
      <div className={cn(ROW, "border-b bg-surface-subtle")}>
        <div className={cn(LABEL_CELL, "items-center bg-surface-subtle")}>
          <h3 id={headingId} dir="rtl" className="w-full px-3 py-2 text-sm font-semibold wrap-anywhere">
            <bdi>{group.name}</bdi>
            {group.completed ? <span className="font-normal text-text-secondary"> (הושלם)</span> : null}
            {group.archived ? <span className="font-normal text-text-secondary"> (בארכיון)</span> : null}
          </h3>
        </div>
        <div className="col-start-1 row-start-1" />
      </div>
      <ul aria-labelledby={headingId}>
        {group.entries.map((entry) => (
          <Row key={entry.key} entry={entry} percent={percent} />
        ))}
      </ul>
    </section>
  );
}

function Row({ entry, percent }: { entry: TimelineEntry; percent: Percent }) {
  const dates = entryDates(entry);
  const state = entryState(entry);
  const clipping = entryClipping(entry);
  const done = state?.tone === "done";
  return (
    <li className={cn(ROW, "h-16 border-b border-border/70 last:border-b-0")}>
      <div className={cn(LABEL_CELL, "items-center")}>
        <div dir="rtl" className="flex w-full min-w-0 items-start gap-2 px-3">
          <EntryIcon entry={entry} className="mt-0.5" />
          <Link
            href={entryHref(entry)}
            className="min-w-0 flex-1 rounded-sm text-sm hover:underline focus-visible:-outline-offset-2"
          >
            <bdi className={cn("line-clamp-2 font-medium wrap-anywhere", done && "text-text-secondary")}>{entry.title}</bdi>
            <span aria-hidden className="block truncate text-xs text-text-secondary tabular-nums">
              {dates.shown}
              {state ? (
                <span className={state.tone === "danger" ? "font-semibold text-danger" : undefined}> · {state.text}</span>
              ) : null}
            </span>
            <span className="sr-only">
              {`, ${dates.spoken}`}
              {state ? `, ${state.text}` : ""}
              {clipping ? `, ${clipping}` : ""}
            </span>
          </Link>
        </div>
      </div>
      <div className="relative col-start-1 row-start-1">
        <Mark entry={entry} percent={percent} title={`${entry.title} · ${dates.shown}`} />
      </div>
    </li>
  );
}

/** The bar or marker. A pointer shortcut to the same link as the label (not focusable, hidden from AT). */
function Mark({ entry, percent, title }: { entry: TimelineEntry; percent: Percent; title: string }) {
  const shared = { href: entryHref(entry), tabIndex: -1, "aria-hidden": true, title } as const;
  if (entry.kind === "span") {
    const done = entry.status === "done";
    return (
      <Link
        {...shared}
        className={cn(
          "absolute top-1/2 -mt-3 flex h-6 items-center justify-between rounded-md border",
          entry.overdue ? "border-2 border-danger bg-danger-tint text-danger" : "border-text-muted bg-surface-subtle text-text-secondary",
          done && "border-dashed bg-surface",
          entry.clippedStart && "rounded-s-none border-s-0",
          entry.clippedEnd && "rounded-e-none border-e-0",
        )}
        // At least 6px wide, so a one-day span stays visible at Year zoom.
        style={{ insetInlineStart: percent(entry.start), inlineSize: `max(${percent(entry.end - entry.start)}, 6px)` }}
      >
        {/* Inside this LTR area, left is earlier: the arrow points to where the span continues. */}
        {entry.clippedStart ? <ChevronLeft className="size-4 shrink-0" /> : <span />}
        {entry.clippedEnd ? <ChevronRight className="size-4 shrink-0" /> : null}
      </Link>
    );
  }
  return (
    <Link
      {...shared}
      className="absolute top-1/2 -mt-3 flex size-6 items-center justify-center rounded-sm"
      style={{ insetInlineStart: `calc(${percent(entry.at + 0.5)} - 12px)` }}
    >
      <EntryIcon entry={entry} />
    </Link>
  );
}
