"use client";

import { Flame, Star } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { quickUrgencyFor } from "@/domain/urgency";
import { cn } from "@/lib/utils";
import { setTaskImportantAction, setTaskUrgentAction } from "@/server/actions/tasks";

// Quick "חשובה" / "דחופה" actions in a task row (UAT-05). Icon buttons, quiet until active: the
// active state changes the shape (filled icon, "ידני"), never only the color. 44px targets on
// touch layouts (the list, below lg), 32px in the desktop table. aria-disabled while saving.

const BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center gap-0.5 rounded-md hover:bg-surface-subtle lg:size-8 lg:min-w-8 lg:w-auto lg:px-1";

export function ImportantToggle({ taskId, title, important }: { taskId: string; title: string; important: boolean }) {
  const [shown, setShown] = useOptimistic(important);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const label = shown ? "בטל חשיבות" : "סמן כחשובה";
  return (
    <button
      type="button"
      aria-label={`${label}: ${title}`}
      title={label}
      aria-disabled={pending || undefined}
      onClick={() => {
        if (pending) return;
        startTransition(async () => {
          setShown(!important);
          const result = await setTaskImportantAction(taskId, !important);
          if (!result.ok) showToast({ message: result.error, tone: "error" });
        });
      }}
      className={BUTTON}
    >
      <Star aria-hidden className={cn("size-4", shown ? "fill-current text-text-primary" : "text-text-muted")} />
    </button>
  );
}

/**
 * Quick urgency (domain/urgency.ts#quickUrgency): mark manually urgent, or return to automatic.
 * An automatically urgent task shows the state without an action. Overdue rows keep the display
 * rule (MASTER_SPEC §5.4): no "דחופה" mark, a manual override only as "ידני".
 */
export function UrgentToggle({
  taskId,
  title,
  urgentOverride,
  open,
  autoUrgent,
  overdue,
  showNote = true,
}: {
  taskId: string;
  title: string;
  urgentOverride: boolean | null;
  open: boolean;
  /** Urgent by its deadline (today, tomorrow or overdue). */
  autoUrgent: boolean;
  overdue: boolean;
  /** The list's meta line already says the urgency in text: it hides the duplicate note. */
  showNote?: boolean;
}) {
  const [override, setOverride] = useOptimistic(urgentOverride);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const quick = quickUrgencyFor(override, open, autoUrgent);

  if (quick.kind === "none") return <span className="sr-only">לא דחופה</span>;
  if (quick.kind === "auto") {
    return overdue ? (
      <span className="sr-only">דחופה אוטומטית לפי המועד</span>
    ) : (
      <span title="דחופה אוטומטית לפי המועד" className="inline-flex size-8 items-center justify-center text-warning">
        <Flame aria-hidden className="size-4" />
        <span className="sr-only">דחופה אוטומטית לפי המועד</span>
      </span>
    );
  }

  const manualUrgent = quick.kind === "manual";
  const label = manualUrgent ? "חזור לדחיפות אוטומטית" : "סמן כדחופה";
  return (
    <span data-urgency className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <button
        type="button"
        aria-label={`${label}: ${title}`}
        title={label}
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          startTransition(async () => {
            setOverride(quick.next);
            const result = await setTaskUrgentAction(taskId, quick.next);
            if (!result.ok) showToast({ message: result.error, tone: "error" });
          });
        }}
        className={BUTTON}
      >
        <Flame
          aria-hidden
          className={cn("size-4", manualUrgent && !overdue ? "fill-current text-warning" : "text-text-muted")}
        />
      </button>
      {showNote ? <OverrideNote override={override} overdue={overdue} /> : null}
    </span>
  );
}

/**
 * The override as text, outside the button and exactly as the row signals say it (MASTER_SPEC
 * §5.4): "דחופה · ידני" as one unit when manually urgent; on an overdue row, or for a manual
 * "not urgent", only the muted "ידני" with its meaning for screen readers.
 */
function OverrideNote({ override, overdue }: { override: boolean | null; overdue: boolean }) {
  if (override === null) return null;
  if (override && !overdue) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-warning">
        <span className="sr-only">דחופה</span>
        <span className="text-sm text-text-muted">· ידני</span>
      </span>
    );
  }
  return (
    <span className="text-sm whitespace-nowrap text-text-muted">
      <span aria-hidden>ידני</span>
      <span className="sr-only">{override ? "דחיפות: ידנית (דחופה)" : "דחיפות: ידנית (לא דחופה)"}</span>
    </span>
  );
}
