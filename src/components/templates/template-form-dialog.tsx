"use client";

import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { CategoryField } from "@/components/tasks/category-field";
import { ErrorSummary, FieldError, selectClassName, textareaClassName, type Option } from "@/components/tasks/form-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { TITLE_MAX_LENGTH } from "@/domain/task";
import { TEMPLATE_NAME_MAX_LENGTH, type Template, type TemplateFieldErrors, type TemplateInput } from "@/domain/template";
import { createTemplateAction, updateTemplateAction } from "@/server/actions/templates";

const EMPTY: TemplateInput = {
  name: "",
  title: "",
  notes: null,
  isImportant: false,
  projectId: null,
  categoryId: null,
};

/**
 * Create or edit a template (MASTER_SPEC §9): name, the task's title, notes, category, project,
 * Important. Editing never changes tasks already created from it, and the form says so.
 */
export function TemplateFormDialog({
  template,
  projects,
  categories,
}: {
  /** Absent: create. */
  template?: Template & { projectName?: string; projectSuffix?: string };
  /** Active projects (the picker never offers archived ones). */
  projects: Option[];
  categories: Option[];
}) {
  const isEdit = template !== undefined;
  const idPrefix = isEdit ? `tpl-${template.id.slice(0, 8)}` : "tpl-new";
  const initial: TemplateInput = isEdit ? template : EMPTY;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<TemplateInput>(initial);
  const [errors, setErrors] = useState<TemplateFieldErrors>({});
  const [summary, setSummary] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  // A completed or archived project stays selectable for the template that already has it, marked as such.
  const projectOptions =
    isEdit && template.projectSuffix && template.projectId && template.projectName
      ? [...projects, { id: template.projectId, name: `${template.projectName}${template.projectSuffix}` }]
      : projects;

  const ids = { name: `${idPrefix}-name`, title: `${idPrefix}-title`, notes: `${idPrefix}-notes`, project: `${idPrefix}-project` };
  const set = (patch: Partial<TemplateInput>) => setValues((current) => ({ ...current, ...patch }));

  function submit() {
    startTransition(async () => {
      const result = isEdit ? await updateTemplateAction(template.id, values) : await createTemplateAction(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setSummary(result.error);
        return;
      }
      setOpen(false);
      showToast({
        message: (
          <>
            התבנית <bdi className="font-semibold">{result.data.name}</bdi> {isEdit ? "נשמרה." : "נוצרה."}
          </>
        ),
      });
    });
  }

  const summaryErrors: [string, string][] = [];
  if (errors.name) summaryErrors.push([ids.name, errors.name]);
  if (errors.title) summaryErrors.push([ids.title, errors.title]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(initial);
          setErrors({});
          setSummary(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost">
            <Pencil aria-hidden />
            עריכה
            {/* The visible label starts the accessible name (WCAG 2.5.3). */}
            <span className="sr-only"> של התבנית {template.name}</span>
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden />
            תבנית חדשה
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-5 sm:max-w-xl">
        <div className="flex flex-col gap-1 pe-10">
          <DialogTitle className="text-lg font-semibold">{isEdit ? "עריכת תבנית" : "תבנית חדשה"}</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            {isEdit
              ? "השינויים יחולו רק על משימות שייווצרו מעכשיו. משימות שכבר נוצרו מהתבנית לא ישתנו."
              : "כל שימוש בתבנית יוצר משימה חדשה ועצמאית."}
          </DialogDescription>
        </div>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit();
          }}
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} errors={summaryErrors} />

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.name} className="text-sm font-medium">
              שם התבנית <span aria-hidden className="text-danger">*</span>
              <span className="sr-only"> (חובה)</span>
            </label>
            <Input
              id={ids.name}
              dir="auto"
              autoComplete="off"
              autoFocus
              aria-required
              maxLength={TEMPLATE_NAME_MAX_LENGTH}
              value={values.name}
              onChange={(event) => set({ name: event.target.value })}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${ids.name}-error` : undefined}
            />
            <FieldError id={`${ids.name}-error`} message={errors.name} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.title} className="text-sm font-medium">
              כותרת המשימה <span aria-hidden className="text-danger">*</span>
              <span className="sr-only"> (חובה)</span>
            </label>
            <Input
              id={ids.title}
              dir="auto"
              autoComplete="off"
              aria-required
              maxLength={TITLE_MAX_LENGTH}
              value={values.title}
              onChange={(event) => set({ title: event.target.value })}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? `${ids.title}-error` : undefined}
            />
            <FieldError id={`${ids.title}-error`} message={errors.title} />
          </div>

          <CategoryField
            idPrefix={idPrefix}
            categories={categories}
            value={values.categoryId}
            onChange={(categoryId) => set({ categoryId })}
          />

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.project} className="text-sm font-medium">
              פרויקט
            </label>
            <select
              id={ids.project}
              value={values.projectId ?? ""}
              onChange={(event) => set({ projectId: event.target.value || null })}
              className={selectClassName}
            >
              <option value="">ללא פרויקט</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.notes} className="text-sm font-medium">
              תיאור
            </label>
            <textarea
              id={ids.notes}
              dir="auto"
              rows={3}
              value={values.notes ?? ""}
              onChange={(event) => set({ notes: event.target.value })}
              className={textareaClassName}
            />
          </div>

          <label className="flex min-h-9 items-center gap-2 self-start text-base">
            <input
              type="checkbox"
              checked={values.isImportant}
              onChange={(event) => set({ isImportant: event.target.checked })}
              className="size-4 accent-primary"
            />
            חשובה
          </label>

          <p className="text-sm text-text-muted">
            המועד ייקבע בכל יצירה לפי ברירת המחדל בהגדרות, ואפשר לשנות אותו לפני השמירה.
          </p>

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" size="lg" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              {pending ? "שומר…" : isEdit ? "שמירה" : "יצירת תבנית"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
