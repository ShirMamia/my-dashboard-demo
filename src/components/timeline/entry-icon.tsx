import { Diamond, Square } from "lucide-react";
import type { TimelineEntry } from "@/domain/timeline";
import { cn } from "@/lib/utils";

/**
 * The entry's shape, matching the Calendar legend: ◆ planning item, □ task deadline, and a short
 * bar for a start → deadline span. Never color alone (MASTER.md §2).
 */
export function EntryIcon({ entry, className }: { entry: TimelineEntry; className?: string }) {
  const done = entry.kind !== "milestone" && entry.status === "done";
  if (entry.kind === "milestone") return <Diamond aria-hidden className={cn("size-4 shrink-0 fill-primary text-primary", className)} />;
  if (entry.kind === "deadline") {
    return (
      <Square
        aria-hidden
        className={cn("size-4 shrink-0", entry.overdue ? "fill-danger-tint text-danger" : "text-text-secondary", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1 h-2.5 w-4 shrink-0 rounded-sm border",
        entry.overdue ? "border-danger bg-danger-tint" : "border-text-muted bg-surface-subtle",
        done && "border-dashed bg-surface",
        className,
      )}
    />
  );
}
