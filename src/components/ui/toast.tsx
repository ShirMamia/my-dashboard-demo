"use client";

import { CircleCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// MASTER.md §7 Toast: surface + popover shadow, never steals focus, aria-live="polite",
// ~5s, persists while hovered or focused. Undo is an optional action button.

export interface ToastOptions {
  message: React.ReactNode;
  /** "success": a completed action (a check icon and a thin start accent in the success color; the text says it too). */
  tone?: "default" | "error" | "success";
  action?: { label: string; onAction: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

const DURATION_MS = 5000;
const MAX_VISIBLE = 3;

const ToastContext = createContext<((toast: ToastOptions) => void) | null>(null);

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((toast: ToastOptions) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...toast, id }].slice(-MAX_VISIBLE));
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Always mounted, so screen readers announce toasts added later. */}
      <div
        aria-live="polite"
        aria-relevant="additions text"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(onDismiss, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [paused, onDismiss]);

  return (
    <div
      // No role of its own: the container is the live region (nested regions double-announce).
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-base shadow-lg",
        toast.tone === "error" && "border-danger text-danger",
        toast.tone === "success" && "border-s-4 border-s-success",
      )}
    >
      {toast.tone === "success" ? <CircleCheck aria-hidden className="size-5 shrink-0 text-success" /> : null}
      <p className="flex-1">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onAction();
            onDismiss();
          }}
          className="min-h-9 rounded-md px-3 font-semibold text-primary hover:bg-primary-subtle"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירת ההודעה"
        className="flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-subtle"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
