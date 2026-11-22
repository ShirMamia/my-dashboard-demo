"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/tasks/form-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PROJECT_NAME_MAX_LENGTH } from "@/domain/project";
import { createProjectAction, renameProjectAction } from "@/server/actions/projects";

/**
 * Create a project (then open its page) or rename one. The name is the only editable field
 * (MASTER_SPEC §8). Validation runs on the server; the submit button is disabled while pending.
 */
export function ProjectNameDialog(
  props: { mode: "create" } | { mode: "rename"; projectId: string; currentName: string },
) {
  const isCreate = props.mode === "create";
  const initialName = isCreate ? "" : props.currentName;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const router = useRouter();
  const inputId = isCreate ? "project-create-name" : "project-rename-name";

  function submit() {
    startTransition(async () => {
      const result = isCreate ? await createProjectAction(name) : await renameProjectAction(props.projectId, name);
      if (!result.ok) {
        setError(result.error);
        document.getElementById(inputId)?.focus();
        return;
      }
      setOpen(false);
      showToast({
        message: (
          <>
            הפרויקט <bdi className="font-semibold">{result.data.name}</bdi> {isCreate ? "נוצר." : "עודכן."}
          </>
        ),
      });
      if (isCreate) router.push(`/projects/${result.data.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(initialName);
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        {isCreate ? (
          <Button>
            <Plus aria-hidden />
            פרויקט חדש
          </Button>
        ) : (
          <Button variant="outline">
            <Pencil aria-hidden />
            שינוי שם
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="gap-5 p-5 sm:max-w-md">
        <div className="flex flex-col gap-1 pe-10">
          <DialogTitle className="text-lg font-semibold">{isCreate ? "פרויקט חדש" : "שינוי שם הפרויקט"}</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            {isCreate ? "פרויקט מקבץ משימות ומציג את ההתקדמות שלהן." : "המשימות של הפרויקט לא משתנות."}
          </DialogDescription>
        </div>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              שם הפרויקט <span aria-hidden className="text-danger">*</span>
              <span className="sr-only"> (חובה)</span>
            </label>
            <Input
              id={inputId}
              dir="auto"
              autoComplete="off"
              autoFocus
              aria-required
              maxLength={PROJECT_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-error` : undefined}
            />
            <FieldError id={`${inputId}-error`} message={error} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="lg" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              {pending ? "שומר…" : isCreate ? "יצירת פרויקט" : "שמירה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
