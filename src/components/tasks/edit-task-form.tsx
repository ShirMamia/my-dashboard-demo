"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { appDateOf, formatAppTime, type DateOnly } from "@/domain/dates";
import { isOverdue, type Task } from "@/domain/task";
import { DEADLINE_CHANGE_WARNING, deadlineChangeClearsOverride, isAutoUrgent } from "@/domain/urgency";
import { deleteTaskAction, updateTaskAction } from "@/server/actions/tasks";
import { ErrorSummary, type Option } from "./form-parts";
import { TaskFields, fieldIds, type TaskFieldErrors, type TaskFormValues, type Urgency } from "./task-fields";

const ID_PREFIX = "edit";

function valuesOf(task: Task): TaskFormValues {
  return {
    title: task.title,
    deadline: task.deadline,
    categoryId: task.categoryId,
    projectId: task.projectId,
    notes: task.notes ?? "",
    isImportant: task.isImportant,
    status: task.status,
    startDate: task.startDate,
    scheduledDate: task.scheduledAt ? appDateOf(task.scheduledAt) : null,
    scheduledTime: task.scheduledAt ? formatAppTime(task.scheduledAt) : "",
    urgency: task.urgentOverride === null ? "auto" : task.urgentOverride ? "urgent" : "not_urgent",
  };
}

export function EditTaskForm({
  task,
  today,
  defaultDeadline,
  categories,
  projects,
}: {
  task: Task;
  today: DateOnly;
  defaultDeadline: DateOnly;
  categories: Option[];
  projects: Option[];
}) {
  // The last saved state: the deadline-change warning compares against it.
  const [saved, setSaved] = useState(task);
  const [values, setValues] = useState(() => valuesOf(task));
  const [errors, setErrors] = useState<TaskFieldErrors>({});
  const [summary, setSummary] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  const clearsOverride = deadlineChangeClearsOverride(saved, values.deadline);
  const ids = fieldIds(ID_PREFIX);
  const summaryErrors = (Object.entries(errors) as [keyof TaskFieldErrors, string][]).map(
    ([field, message]): [string, string] => [ids[field], message],
  );

  function submit(form: HTMLFormElement) {
    const formData = new FormData(form);
    const submitted = values;
    startTransition(async () => {
      const result = await updateTaskAction(task.id, null, formData);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setSummary(result.error);
        return;
      }
      setErrors({});
      setSummary(undefined);
      // Show what was stored (e.g. an override cleared by a deadline change).
      setSaved(result.data);
      // Unless the user kept editing while saving: then their newer values win.
      setValues((current) => (current === submitted ? valuesOf(result.data) : current));
      showToast({ message: "השינויים נשמרו." });
    });
  }

  return (
    <>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) submit(event.currentTarget);
        }}
        className="flex flex-col gap-5 rounded-xl border bg-surface p-5"
      >
        <ErrorSummary message={summary} errors={summaryErrors} />
        <TaskFields
          idPrefix={ID_PREFIX}
          mode="edit"
          values={values}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          today={today}
          defaultDeadline={defaultDeadline}
          categories={categories}
          projects={projects}
          errors={errors}
          deadlineWarning={clearsOverride ? DEADLINE_CHANGE_WARNING : undefined}
          urgencySlot={
            <UrgencyControl
              value={values.urgency}
              onChange={(urgency) => setValues((current) => ({ ...current, urgency }))}
              autoUrgent={isAutoUrgent({ deadline: values.deadline }, today)}
              overdue={isOverdue({ status: values.status, deadline: values.deadline }, today)}
              error={errors.urgency}
            />
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <DeleteTaskButton taskId={task.id} title={task.title} />
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/tasks">חזרה למשימות</Link>
            </Button>
            <Button type="submit" size="lg" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              {pending ? "שומר…" : "שמירה"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

/**
 * The 3-way urgency control "אוטומטי / דחופה / לא דחופה" (MASTER_SPEC §5.2) with the automatic
 * result for reference. On an overdue task the override is subtle metadata (§5.4).
 */
function UrgencyControl({
  value,
  onChange,
  autoUrgent,
  overdue,
  error,
}: {
  value: Urgency;
  onChange: (value: Urgency) => void;
  autoUrgent: boolean;
  overdue: boolean;
  error?: string;
}) {
  const options: { value: Urgency; label: string }[] = [
    { value: "auto", label: `אוטומטי (כרגע: ${autoUrgent ? "דחופה" : "לא דחופה"})` },
    { value: "urgent", label: "דחופה" },
    { value: "not_urgent", label: "לא דחופה" },
  ];
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${ID_PREFIX}-urgency-hint`}>
      <legend className="mb-2 text-sm font-medium">דחיפות</legend>
      <input type="hidden" name="urgency" value={value} />
      <div className="inline-flex flex-wrap gap-1 self-start rounded-lg border border-border-input bg-surface-subtle p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-primary has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              id={`${ID_PREFIX}-urgency-${option.value === "not_urgent" ? "not-urgent" : option.value}`}
              name={`${ID_PREFIX}-urgency-choice`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      <p id={`${ID_PREFIX}-urgency-hint`} className="text-sm text-text-muted">
        {value !== "auto"
          ? overdue
            ? "דחיפות: ידנית. המשימה באיחור, ולכן מוצג רק מצב האיחור."
            : "ידני: הדחיפות נקבעה ידנית ולא תשתנה עם הזמן."
          : "הדחיפות מחושבת לפי המועד: באיחור, היום או מחר."}
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </fieldset>
  );
}

function DeleteTaskButton({ taskId, title }: { taskId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const showToast = useToast();
  const router = useRouter();

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive">
            <Trash2 aria-hidden />
            מחיקה
          </Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">למחוק את המשימה?</DialogTitle>
          <DialogDescription className="text-base text-text-secondary">
            המשימה <bdi className="font-semibold">{title}</bdi> תימחק לצמיתות. אי אפשר לבטל את הפעולה.
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
                  const result = await deleteTaskAction(taskId);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setOpen(false);
                  showToast({
                    message: (
                      <>
                        המשימה <bdi className="font-semibold">{title}</bdi> נמחקה.
                      </>
                    ),
                  });
                  // Leave the deleted task's page first, then refresh (the action doesn't revalidate).
                  router.push("/tasks");
                  router.refresh();
                });
              }}
            >
              {pending ? "מוחק…" : "מחיקת המשימה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
