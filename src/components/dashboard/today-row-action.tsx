"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { dismissForTodayAction, removeTodayPickAction, undoDismissAction } from "@/server/actions/today";

/**
 * The Today row action (MASTER_SPEC §6.5): "לא היום" on a recommendation (undo toast) or
 * "הסר מהיום" on a manual pick. The task itself never changes. The row leaves the list when
 * the refreshed Dashboard arrives, so focus moves to `focusAfterId`.
 */
export function TodayRowAction({
  taskId,
  title,
  kind,
  focusAfterId,
}: {
  taskId: string;
  title: string;
  kind: "dismiss" | "remove";
  focusAfterId: string;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function act() {
    if (pending) return;
    startTransition(async () => {
      const result = kind === "dismiss" ? await dismissForTodayAction(taskId) : await removeTodayPickAction(taskId);
      if (!result.ok) {
        showToast({ message: result.error, tone: "error" });
        return;
      }
      document.getElementById(focusAfterId)?.focus();
      showToast(
        kind === "dismiss"
          ? {
              message: (
                <>
                  המשימה <bdi className="font-semibold">{title}</bdi> לא תוצע היום.
                </>
              ),
              action: { label: "ביטול", onAction: () => undo() },
            }
          : {
              message: (
                <>
                  המשימה <bdi className="font-semibold">{title}</bdi> הוסרה מהיום.
                </>
              ),
            },
      );
    });
  }

  function undo() {
    startTransition(async () => {
      const result = await undoDismissAction(taskId);
      if (!result.ok) showToast({ message: result.error, tone: "error" });
    });
  }

  const label = kind === "dismiss" ? "לא היום" : "הסר מהיום";
  return (
    <Button
      variant="ghost"
      aria-disabled={pending || undefined}
      aria-label={`${label}: ${title}`}
      onClick={act}
      className="shrink-0 text-text-secondary"
    >
      {kind === "remove" ? <X aria-hidden /> : null}
      {label}
    </Button>
  );
}
