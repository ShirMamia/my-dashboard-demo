"use client";

import { Trash2 } from "lucide-react";
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

/**
 * "מחיקה" with a confirmation dialog (MASTER_SPEC §14) for a row that disappears once deleted.
 * While deleting, the confirm button keeps focus (aria-disabled + aria-busy, repeats ignored);
 * a failure shows the error and focus stays; success moves focus to `focusAfterId`, since the
 * row and its trigger are gone.
 */
export function ConfirmDeleteButton({
  srContext,
  title,
  description,
  confirmLabel,
  successMessage,
  onConfirm,
  focusAfterId,
  size,
}: {
  /** Completes the trigger's name for screen readers, e.g. "של התבנית X". */
  srContext: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  successMessage: React.ReactNode;
  onConfirm: () => Promise<{ ok: true } | { ok: false; error: string }>;
  focusAfterId: string;
  size?: "sm";
}) {
  const deleted = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size={size} className="text-danger hover:text-danger">
          <Trash2 aria-hidden />
          מחיקה
          <span className="sr-only"> {srContext}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          if (!deleted.current) return;
          event.preventDefault();
          document.getElementById(focusAfterId)?.focus();
        }}
      >
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-base text-text-secondary">{description}</DialogDescription>
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
                const result = await onConfirm();
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                deleted.current = true;
                setOpen(false);
                showToast({ message: successMessage });
              });
            }}
          >
            {pending ? "מוחק…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
