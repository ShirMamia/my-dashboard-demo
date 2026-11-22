import { CircleAlert } from "lucide-react";
import { progressPercent } from "@/domain/project";
import type { ProjectProgress } from "@/domain/project-progress";
import { cn } from "@/lib/utils";

// MASTER_SPEC §8 / MASTER.md §6 Projects: "X מתוך Y הושלמו" + open/overdue counts. The thin
// bar is optional and never the only signal: it's aria-hidden and the text carries the value.

export function ProgressSummary({
  progress,
  size = "default",
}: {
  progress: ProjectProgress;
  size?: "default" | "large";
}) {
  const percent = progressPercent(progress);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", size === "large" ? "text-base" : "text-sm")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn(progress.total === 0 ? "text-text-muted" : "font-medium")}>{progress.text}</span>
        {progress.total > 0 ? (
          <>
            <span className="text-text-secondary">{progress.open === 1 ? "פתוחה אחת" : `${progress.open} פתוחות`}</span>
            {progress.overdue > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-danger">
                <CircleAlert aria-hidden className="size-4 shrink-0" />
                {progress.overdue === 1 ? "אחת באיחור" : `${progress.overdue} באיחור`}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {percent !== null ? (
        <div aria-hidden className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle", size === "large" ? "max-w-md" : "max-w-48")}>
          <div className="h-full rounded-full bg-primary" style={{ inlineSize: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}
