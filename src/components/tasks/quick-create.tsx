"use client";

import { CopyPlus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { DateOnly } from "@/domain/dates";
import { createTaskAction } from "@/server/actions/tasks";
import { ErrorSummary, type Option } from "./form-parts";
import { TaskFields, fieldIds, type TaskFieldErrors, type TaskFormValues } from "./task-fields";

export interface QuickCreateProps {
  /** Pre-selects a project (e.g. "משימה חדשה" on a project page). */
  defaultProject?: Option;
  today: DateOnly;
  /** today + the user's default horizon (Settings). */
  defaultDeadline: DateOnly;
  categories: Option[];
  projects: Option[];
  /**
   * "יצירת משימה מתבנית" (MASTER_SPEC §9): the same form, pre-filled and still editable. The task
   * is created by the ordinary task action, so it keeps no link to the template.
   */
  fromTemplate?: {
    name: string;
    values: Partial<TaskFormValues>;
    /** The template's project is archived: the task is created without it. */
    projectDropped: boolean;
  };
  /** "משימה ליום זה" in the Calendar (MASTER_SPEC §10.4): the deadline is that day. */
  forDay?: DateOnly;
}

const ID_PREFIX = "qc";

function emptyValues(defaultDeadline: DateOnly, projectId: string | null = null): TaskFormValues {
  return {
    title: "",
    deadline: defaultDeadline,
    categoryId: null,
    projectId,
    notes: "",
    isImportant: false,
    status: "todo",
    startDate: null,
    scheduledDate: null,
    scheduledTime: "",
    urgency: "auto",
  };
}

/**
 * Quick Create (MASTER.md §6): a dialog on desktop, a bottom sheet below 768px.
 * Fast path: type a title, press Enter. Deadline = the default horizon, no category.
 */
export function QuickCreate({ today, defaultDeadline, categories, projects, defaultProject, fromTemplate, forDay }: QuickCreateProps) {
  const initialValues = (): TaskFormValues => ({
    ...emptyValues(forDay ?? defaultDeadline, defaultProject?.id ?? null),
    ...fromTemplate?.values,
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<TaskFieldErrors>({});
  const [summary, setSummary] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();

  function reset() {
    setValues(initialValues());
    setErrors({});
    setSummary(undefined);
  }

  function submit(form: HTMLFormElement) {
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createTaskAction(null, formData);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setSummary(result.error);
        return;
      }
      setOpen(false);
      reset();
      showToast({
        message: (
          <>
            המשימה <bdi className="font-semibold">{result.data.title}</bdi> נוצרה.
          </>
        ),
        action: { label: "פתיחה", onAction: () => router.push(`/tasks/${result.data.id}`) },
      });
    });
  }

  const ids = fieldIds(ID_PREFIX);
  const summaryErrors = (Object.entries(errors) as [keyof TaskFieldErrors, string][]).map(
    ([field, message]): [string, string] => [ids[field], message],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {fromTemplate ? (
          <Button variant="outline" aria-label={`יצירת משימה מהתבנית: ${fromTemplate.name}`}>
            <CopyPlus aria-hidden />
            יצירת משימה
          </Button>
        ) : forDay ? (
          <Button variant="outline">
            <Plus aria-hidden />
            משימה ליום זה
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden />
            משימה חדשה
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] gap-5 overflow-y-auto p-5 sm:max-w-xl max-md:inset-x-0 max-md:start-0 max-md:top-auto max-md:bottom-0 max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rtl:translate-x-0"
        onOpenAutoFocus={(event) => {
          if (!fromTemplate) return;
          // The title is already filled in: start at the deadline (MASTER.md §6 Templates).
          event.preventDefault();
          const chip = document.querySelector<HTMLInputElement>(`input[name="${ID_PREFIX}-deadline-chip"]:checked`);
          (chip ?? document.getElementById(`${ID_PREFIX}-deadline`))?.focus();
        }}
      >
        <div className="flex flex-col gap-1 pe-10">
          <DialogTitle className="text-lg font-semibold">{fromTemplate ? "משימה חדשה מתבנית" : "משימה חדשה"}</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            {fromTemplate ? (
              <>
                לפי התבנית <bdi className="font-semibold">{fromTemplate.name}</bdi>. אפשר לשנות כל שדה לפני היצירה. המשימה
                תהיה עצמאית: שינוי או מחיקה של התבנית לא ישנו אותה.
                {fromTemplate.projectDropped ? " הפרויקט של התבנית בארכיון, ולכן המשימה תיווצר בלי פרויקט." : null}
              </>
            ) : (
              "מספיק לכתוב כותרת וללחוץ Enter."
            )}
            {defaultProject && values.projectId === defaultProject.id ? (
              <>
                {" "}
                המשימה תשויך לפרויקט <bdi className="font-semibold">{defaultProject.name}</bdi>.
              </>
            ) : null}
          </DialogDescription>
        </div>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit(event.currentTarget);
          }}
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} errors={summaryErrors} />
          <TaskFields
            idPrefix={ID_PREFIX}
            mode="create"
            values={values}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
            today={today}
            defaultDeadline={defaultDeadline}
            categories={categories}
            projects={projects}
            errors={errors}
            autoFocusTitle={!fromTemplate}
            detailsInitiallyOpen={Boolean(fromTemplate)}
          />
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <Button type="submit" size="lg" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              {pending ? "יוצר…" : "יצירת משימה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
