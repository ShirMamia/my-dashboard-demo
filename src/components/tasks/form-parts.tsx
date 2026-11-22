"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface Option {
  id: string;
  name: string;
}

/** Error text linked to its field via aria-describedby (MASTER.md §7 Input "Error"). */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}

export function describedBy(...ids: (string | false | undefined | null)[]): string | undefined {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

/**
 * Error summary at the top of a form (MASTER.md §8): takes focus when shown, and lists each
 * field error as a link to the field.
 */
export function ErrorSummary({
  message,
  errors,
}: {
  message?: string;
  /** [fieldId, message] pairs in form order. */
  errors: [string, string][];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message, errors]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-danger bg-danger-tint p-3 text-sm text-danger"
    >
      <p className="flex items-start gap-2 font-semibold">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {message}
      </p>
      {errors.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 ps-10">
          {errors.map(([fieldId, text]) => (
            <li key={fieldId}>
              <a
                href={`#${fieldId}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(fieldId)?.focus();
                }}
                className="underline underline-offset-2"
              >
                {text}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A native radio styled as a chip. Arrow keys move within the group (browser behavior). */
export function ChipRadio({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center rounded-full border border-border-input bg-surface px-3 text-sm transition-colors hover:border-text-secondary",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
        "has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:checked]:font-semibold has-[:checked]:text-primary",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {children}
    </label>
  );
}

export const selectClassName =
  "min-h-9 w-full rounded-lg border border-border-input bg-surface px-2.5 text-base hover:border-text-secondary aria-invalid:border-danger";

export const textareaClassName =
  "min-h-20 w-full rounded-lg border border-border-input bg-surface px-2.5 py-2 text-base hover:border-text-secondary aria-invalid:border-danger";
