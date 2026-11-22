import { CircleAlert, Flame, Star } from "lucide-react";
import { formatDateOnly, relativeDaysText, type DateOnly } from "@/domain/dates";
import { STATUS_LABELS, type Task, type TaskSummary } from "@/domain/task";
import { taskSignals, type TaskSignals } from "@/domain/urgency";
import { cn } from "@/lib/utils";

// Task row signals (MASTER.md §1): Overdue lives in the deadline text itself (danger, weight 600,
// icon); Urgent is "דחופה" + icon, never shown when overdue (§5.4); Important is neutral.
// Every state is text, never color alone.

export function signalsOf(task: TaskSummary, today: DateOnly): TaskSignals {
  return taskSignals(task, today);
}

export function DeadlineText({
  task,
  signals,
  dateOnly = false,
}: {
  task: Pick<Task, "deadline" | "status">;
  signals: TaskSignals;
  /** Only the date (red when overdue): a Today reason already says the relative days. */
  dateOnly?: boolean;
}) {
  const date = <span className="tabular-nums">{formatDateOnly(task.deadline)}</span>;
  if (dateOnly) return <span className={cn(signals.overdue && "font-semibold text-danger")}>{date}</span>;
  if (signals.overdue) {
    return (
      <span className="inline-flex items-start gap-1 font-semibold text-danger">
        <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
        <span className="whitespace-nowrap">
          {relativeDaysText(signals.daysRemaining)} · {date}
        </span>
      </span>
    );
  }
  if (task.status === "done") return date;
  return (
    <span className="whitespace-nowrap">
      {relativeDaysText(signals.daysRemaining)} · {date}
    </span>
  );
}

/** Urgent column/label. Overdue rows: no mark; a manual override is muted metadata only. */
export function UrgentMark({ signals, compact = false }: { signals: TaskSignals; compact?: boolean }) {
  if (signals.urgentBadge) {
    return (
      // One unit: the icon, the label and "· ידני" never wrap apart (e.g. in the narrow table column).
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-warning">
        <Flame aria-hidden className="size-4 shrink-0" />
        <span className={cn(compact && "sr-only")}>דחופה</span>
        {signals.urgentBadgeManual ? <span className="text-sm text-text-muted">· ידני</span> : null}
      </span>
    );
  }
  if (signals.overrideMetadata) {
    return (
      <span className="text-sm text-text-muted">
        <span aria-hidden>ידני</span>
        <span className="sr-only">
          {signals.overrideMetadata === "urgent" ? "דחיפות: ידנית (דחופה)" : "דחיפות: ידנית (לא דחופה)"}
        </span>
      </span>
    );
  }
  return compact ? <span className="sr-only">לא דחופה</span> : null;
}

export function ImportantMark({ important, compact = false }: { important: boolean; compact?: boolean }) {
  if (!important) return compact ? <span className="sr-only">לא חשובה</span> : null;
  return (
    <span className="inline-flex items-center gap-1 text-text-secondary">
      <Star aria-hidden className="size-4 shrink-0" />
      <span className={cn(compact && "sr-only")}>חשובה</span>
    </span>
  );
}

/**
 * A task's status as text (MASTER.md §1). The default, "לביצוע", stays visible but quiet: muted
 * text, not a pill, so lists aren't a column of identical badges (SKILLS_AUDIT C7). The other
 * statuses keep their outlined pill in their semantic color.
 */
export function StatusPill({ status }: { status: Task["status"] }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex min-h-6 items-center text-sm whitespace-nowrap",
        status === "todo" ? "text-text-muted" : "rounded-full border px-2",
        status === "done" && "border-success text-success",
        status === "waiting" && "border-waiting text-waiting",
        status === "in_progress" && "border-info text-info",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
