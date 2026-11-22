"use client";

import { Archive, ArchiveRestore, CircleCheck, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { openTasksWarning } from "@/domain/project";
import { deleteProjectAction, setProjectArchivedAction, setProjectCompletedAction } from "@/server/actions/projects";
import { ProjectNameDialog } from "./project-name-dialog";

/**
 * Project page actions: complete/reopen (UAT-03), rename, archive/restore (with undo), delete
 * (with confirmation). Completing and archiving are independent.
 */
export function ProjectActions({
  projectId,
  name,
  archived,
  completed,
  openCount,
  taskCount,
}: {
  projectId: string;
  name: string;
  archived: boolean;
  completed: boolean;
  /** Open (not Done) tasks: completing with any asks first; they stay unchanged. */
  openCount: number;
  taskCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function setArchived(next: boolean, withUndo: boolean) {
    startTransition(async () => {
      const result = await setProjectArchivedAction(projectId, next);
      if (!result.ok) {
        showToast({ message: result.error, tone: "error" });
        return;
      }
      if (!withUndo) return;
      showToast({
        message: next ? (
          <>
            הפרויקט <bdi className="font-semibold">{name}</bdi> הועבר לארכיון. המשימות שלו נשארו.
          </>
        ) : (
          <>
            הפרויקט <bdi className="font-semibold">{name}</bdi> הוחזר מהארכיון.
          </>
        ),
        action: { label: "ביטול", onAction: () => setArchived(!next, false) },
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CompleteProjectButton projectId={projectId} name={name} completed={completed} openCount={openCount} />
      <ProjectNameDialog mode="rename" projectId={projectId} currentName={name} />
      {/* aria-disabled, not disabled: the button keeps focus while saving and when its label flips. */}
      <Button
        variant="outline"
        aria-disabled={pending || undefined}
        onClick={() => {
          if (!pending) setArchived(!archived, true);
        }}
      >
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {archived ? "החזרה מהארכיון" : "העברה לארכיון"}
      </Button>
      <DeleteProjectButton projectId={projectId} name={name} taskCount={taskCount} />
    </div>
  );
}

function DeleteProjectButton({ projectId, name, taskCount }: { projectId: string; name: string; taskCount: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 aria-hidden />
          מחיקה
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogTitle className="text-lg font-semibold">למחוק את הפרויקט?</DialogTitle>
        <DialogDescription className="text-base text-text-secondary">
          הפרויקט <bdi className="font-semibold">{name}</bdi> יימחק לצמיתות.{" "}
          {taskCount === 0
            ? "אין בו משימות."
            : taskCount === 1
              ? "המשימה שלו לא תימחק, היא רק תישאר בלי פרויקט."
              : `${taskCount} המשימות שלו לא יימחקו, הן רק יישארו בלי פרויקט.`}{" "}
          אפשר במקום זאת להעביר אותו לארכיון.
        </DialogDescription>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              ביטול
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="bg-danger text-on-primary hover:bg-danger/90"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onClick={() => {
              if (pending) return; // busy: the button keeps focus but ignores repeats
              startTransition(async () => {
                const result = await deleteProjectAction(projectId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                showToast({
                  message: (
                    <>
                      הפרויקט <bdi className="font-semibold">{name}</bdi> נמחק.
                    </>
                  ),
                });
                // Leave the deleted project's page first, then refresh (the action doesn't revalidate).
                router.push("/projects");
                router.refresh();
              });
            }}
          >
            {pending ? "מוחק…" : "מחיקת הפרויקט"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "סמן פרויקט כהושלם" / "פתח מחדש" (UAT-03). One button in every state, so focus stays on it
 * when the label flips. With open tasks it asks first: they stay as they are, only the project
 * is marked completed (no bulk change). Without open tasks it completes at once, with undo.
 */
function CompleteProjectButton({
  projectId,
  name,
  completed,
  openCount,
}: {
  projectId: string;
  name: string;
  completed: boolean;
  openCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const warning = openTasksWarning(openCount);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function setCompleted(next: boolean, withUndo: boolean) {
    startTransition(async () => {
      const result = await setProjectCompletedAction(projectId, next);
      if (!result.ok) {
        showToast({ message: result.error, tone: "error" });
        return;
      }
      setConfirming(false);
      if (!withUndo) return;
      showToast({
        tone: next ? "success" : "default",
        message: next ? (
          <>
            הפרויקט <bdi className="font-semibold">{name}</bdi> סומן כהושלם.
          </>
        ) : (
          <>
            הפרויקט <bdi className="font-semibold">{name}</bdi> נפתח מחדש.
          </>
        ),
        action: { label: "ביטול", onAction: () => setCompleted(!next, false) },
      });
    });
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline"
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          if (completed) setCompleted(false, true);
          else if (warning) setConfirming(true);
          else setCompleted(true, true);
        }}
      >
        {completed ? <RotateCcw aria-hidden /> : <CircleCheck aria-hidden className="text-success" />}
        {completed ? "פתח מחדש" : "סמן פרויקט כהושלם"}
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          // Opened without a DialogTrigger: return focus to the button (now "פתח מחדש" after completing).
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            buttonRef.current?.focus();
          }}
        >
          <DialogTitle className="text-lg font-semibold">לסמן את הפרויקט כהושלם?</DialogTitle>
          <DialogDescription className="text-base text-text-secondary">
            {warning} המשימות לא ישתנו: רק הפרויקט יסומן כהושלם.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                ביטול
              </Button>
            </DialogClose>
            <Button
              type="button"
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              onClick={() => {
                if (!pending) setCompleted(true, true);
              }}
            >
              {pending ? "שומר…" : "סמן כהושלם"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
