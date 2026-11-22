"use client";

import { Check } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import type { TaskStatus } from "@/domain/task";
import { cn } from "@/lib/utils";
import { setTaskStatusAction } from "@/server/actions/tasks";

/**
 * Completion control for a task row (UAT-01). A round target, not a square checkbox, so it never
 * reads as row selection: an empty circle while open, a filled success circle with a check when
 * Done. A button whose name says the action ("סמן כהושלמה" / "בטל השלמה"). Complete → toast with
 * undo (restores the previous status, MASTER_SPEC §14); on a Done task it reopens (לביצוע).
 */
export function CompleteToggle({
  taskId,
  title,
  status,
  focusAfterId,
}: {
  taskId: string;
  title: string;
  status: TaskStatus;
  /** Element that receives focus when this row disappears from the list. */
  focusAfterId: string;
}) {
  const done = status === "done";
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function change(next: TaskStatus, undoTo?: TaskStatus) {
    startTransition(async () => {
      setOptimisticDone(next === "done");
      const result = await setTaskStatusAction(taskId, next);
      if (!result.ok) {
        showToast({ message: result.error, tone: "error" });
        return;
      }
      document.getElementById(focusAfterId)?.focus();
      if (undoTo) return;
      const previous = result.data.previousStatus;
      showToast({
        tone: next === "done" ? "success" : "default",
        message:
          next === "done" ? (
            <>
              המשימה <bdi className="font-semibold">{title}</bdi> הושלמה.
            </>
          ) : (
            <>
              המשימה <bdi className="font-semibold">{title}</bdi> הוחזרה לביצוע.
            </>
          ),
        action: { label: "ביטול", onAction: () => change(previous, previous) },
      });
    });
  }

  // A 44×44px hit area around the 20px circle (MASTER.md §4: ~44px on touch). The negative
  // margin keeps the row's height unchanged. aria-disabled (not disabled) keeps focus while busy.
  return (
    <button
      type="button"
      aria-label={optimisticDone ? `בטל השלמה: ${title}` : `סמן כהושלמה: ${title}`}
      aria-disabled={pending || undefined}
      title={optimisticDone ? "בטל השלמה" : "סמן כהושלמה"}
      onClick={() => {
        if (!pending) change(done ? "todo" : "done");
      }}
      className="group -m-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full border-2 transition-colors",
          optimisticDone
            ? "border-success bg-success text-on-success"
            : "border-text-muted text-transparent group-hover:border-success group-hover:text-success",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}
