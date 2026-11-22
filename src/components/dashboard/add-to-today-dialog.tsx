"use client";

import { Plus } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PICK_LIMIT_MESSAGE } from "@/domain/today";
import { cn } from "@/lib/utils";
import { addTodayPickAction } from "@/server/actions/today";

export interface PickCandidate {
  id: string;
  title: string;
  /** Deadline with days remaining, e.g. "מחר · 03.11.2026". */
  deadlineText: string;
  overdue: boolean;
}

/**
 * "הוספת משימה להיום" (MASTER_SPEC §6.5): a manual pick from every open task, including
 * Waiting, future-start and dismissed ones. Manual picks lead Today, up to 5.
 */
export function AddToTodayDialog({ candidates, full }: { candidates: PickCandidate[]; full: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [, startTransition] = useTransition();
  const showToast = useToast();
  const searchId = useId();
  const errorId = useId();

  const needle = query.trim().toLocaleLowerCase();
  const visible = needle ? candidates.filter((task) => task.title.toLocaleLowerCase().includes(needle)) : candidates;

  function add(task: PickCandidate) {
    if (pendingId) return;
    setPendingId(task.id);
    startTransition(async () => {
      const result = await addTodayPickAction(task.id);
      setPendingId(undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      showToast({
        message: (
          <>
            המשימה <bdi className="font-semibold">{task.title}</bdi> נוספה להיום.
          </>
        ),
      });
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus aria-hidden />
          הוספת משימה להיום
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogTitle>הוספת משימה להיום</DialogTitle>
        <DialogDescription>משימות שנבחרות ידנית מופיעות ראשונות. אפשר לבחור עד 5.</DialogDescription>

        {full ? (
          <p role="status" className="rounded-lg bg-surface-subtle px-3 py-2">
            {PICK_LIMIT_MESSAGE} כדי להוסיף משימה, יש להסיר אחת מהיום.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor={searchId} className="text-sm font-medium">
                חיפוש משימה
              </label>
              <Input
                id={searchId}
                type="search"
                dir="auto"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
            {error ? (
              <p id={errorId} role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            {visible.length > 0 ? (
              <ul aria-label="משימות פתוחות" className="-mx-1 flex min-h-0 flex-col overflow-y-auto">
                {visible.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 border-b px-1 py-2 last:border-b-0">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <bdi className="font-medium wrap-anywhere">{task.title}</bdi>
                      <span className={cn("text-sm text-text-secondary", task.overdue && "font-semibold text-danger")}>
                        {task.deadlineText}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      aria-label={`הוספה להיום: ${task.title}`}
                      aria-disabled={pendingId ? true : undefined}
                      onClick={() => add(task)}
                    >
                      {pendingId === task.id ? "מוסיף…" : "הוספה"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-muted">{candidates.length > 0 ? "לא נמצאו משימות." : "אין משימות פתוחות להוספה."}</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
