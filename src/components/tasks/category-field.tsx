"use client";

import { Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCategoryAction } from "@/server/actions/categories";
import { ChipRadio, FieldError, describedBy, type Option } from "./form-parts";

/** Category chips including "ללא", with inline creation (MASTER_SPEC §8 [PROPOSED DEFAULT]). */
export function CategoryField({
  idPrefix,
  categories: initialCategories,
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  categories: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const legendId = `${idPrefix}-category-legend`;
  const errorId = `${idPrefix}-category-error`;
  const newId = `${idPrefix}-category-new`;
  const newErrorId = `${idPrefix}-category-new-error`;

  function create() {
    if (pending) return;
    startTransition(async () => {
      const result = await createCategoryAction(name);
      if (!result.ok) {
        setCreateError(result.error);
        inputRef.current?.focus();
        return;
      }
      setCategories((current) =>
        [...current, result.data].sort((a, b) => a.name.localeCompare(b.name, "he")),
      );
      onChange(result.data.id);
      setName("");
      setCreateError(undefined);
      setAdding(false);
      addButtonRef.current?.focus();
    });
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={describedBy(error && errorId)}>
      <legend id={legendId} className="mb-2 text-sm font-medium">
        קטגוריה
      </legend>
      <input type="hidden" name="categoryId" value={value ?? ""} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRadio name={`${idPrefix}-category-chip`} value="" checked={value === null} onChange={() => onChange(null)}>
          ללא
        </ChipRadio>
        {categories.map((category) => (
          <ChipRadio
            key={category.id}
            name={`${idPrefix}-category-chip`}
            value={category.id}
            checked={value === category.id}
            onChange={(id) => onChange(id)}
          >
            <bdi>{category.name}</bdi>
          </ChipRadio>
        ))}
        {!adding ? (
          <Button
            ref={addButtonRef}
            type="button"
            variant="ghost"
            onClick={() => {
              setAdding(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <Plus aria-hidden />
            קטגוריה חדשה
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={newId} className="text-sm">
            שם הקטגוריה החדשה
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={inputRef}
              id={newId}
              dir="auto"
              value={name}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                // Enter creates the category, not the task.
                if (event.key === "Enter") {
                  event.preventDefault();
                  create();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setAdding(false);
                  setCreateError(undefined);
                  requestAnimationFrame(() => addButtonRef.current?.focus());
                }
              }}
              aria-invalid={createError ? true : undefined}
              aria-describedby={createError ? newErrorId : undefined}
              className="w-auto flex-1"
            />
            <Button type="button" variant="outline" onClick={create} aria-disabled={pending || undefined}>
              {pending ? "מוסיף…" : "הוספה"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setCreateError(undefined);
                requestAnimationFrame(() => addButtonRef.current?.focus());
              }}
            >
              ביטול
            </Button>
          </div>
          <FieldError id={newErrorId} message={createError} />
        </div>
      ) : null}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
