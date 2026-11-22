"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { FieldError, type Option } from "@/components/tasks/form-parts";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from "@/server/actions/categories";

/** Category management (MASTER_SPEC §8, §14). Categories are independent of projects. */
export function CategoriesManager({ categories }: { categories: Option[] }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          startTransition(async () => {
            const result = await createCategoryAction(name);
            if (!result.ok) {
              setError(result.error);
              document.getElementById("new-category")?.focus();
              return;
            }
            setName("");
            setError(undefined);
            showToast({
              message: (
                <>
                  הקטגוריה <bdi className="font-semibold">{result.data.name}</bdi> נוספה.
                </>
              ),
            });
          });
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="new-category" className="text-sm font-medium">
          קטגוריה חדשה
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="new-category"
            dir="auto"
            maxLength={50}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "new-category-error" : undefined}
            className="w-auto min-w-0 flex-1 sm:max-w-xs"
          />
          <Button type="submit" variant="outline" aria-disabled={pending || undefined}>
            <Plus aria-hidden />
            הוספה
          </Button>
        </div>
        <FieldError id="new-category-error" message={error} />
      </form>

      {categories.length === 0 ? (
        <p className="text-text-muted">עדיין אין קטגוריות.</p>
      ) : (
        <ul aria-label="קטגוריות" className="flex flex-col rounded-xl border bg-surface">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({ category }: { category: Option }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const inputId = `category-${category.id}`;

  if (editing) {
    return (
      <li className="border-b p-3 last:border-b-0">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            startTransition(async () => {
              const result = await renameCategoryAction(category.id, name);
              if (!result.ok) {
                setError(result.error);
                document.getElementById(inputId)?.focus();
                return;
              }
              setError(undefined);
              setEditing(false);
              showToast({ message: "שם הקטגוריה עודכן." });
            });
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor={inputId} className="sr-only">
            שם חדש לקטגוריה {category.name}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={inputId}
              dir="auto"
              autoFocus
              maxLength={50}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setEditing(false);
                  setName(category.name);
                  setError(undefined);
                }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-error` : undefined}
              className="w-auto min-w-0 flex-1 sm:max-w-xs"
            />
            <Button type="submit" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              שמירה
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setName(category.name);
                setError(undefined);
              }}
            >
              ביטול
            </Button>
          </div>
          <FieldError id={`${inputId}-error`} message={error} />
        </form>
      </li>
    );
  }

  return (
    <li className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0">
      <bdi className="font-medium">{category.name}</bdi>
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => setEditing(true)} aria-label={`שינוי שם: ${category.name}`}>
          <Pencil aria-hidden />
          <span aria-hidden>שינוי שם</span>
        </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogTrigger asChild>
          <Button variant="ghost" aria-label={`מחיקה: ${category.name}`}>
            <Trash2 aria-hidden />
            <span aria-hidden>מחיקה</span>
          </Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">למחוק את הקטגוריה?</DialogTitle>
          <DialogDescription className="text-base text-text-secondary">
            הקטגוריה <bdi className="font-semibold">{category.name}</bdi> תוסר מכל המשימות שמשויכות אליה. המשימות עצמן לא יימחקו.
          </DialogDescription>
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
                  const result = await deleteCategoryAction(category.id);
                  setConfirming(false);
                  showToast(
                    result.ok
                      ? { message: (<>הקטגוריה <bdi className="font-semibold">{category.name}</bdi> נמחקה.</>) }
                      : { message: result.error, tone: "error" },
                  );
                });
              }}
            >
              מחיקת הקטגוריה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </li>
  );
}
