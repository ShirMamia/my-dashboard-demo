import { Archive, CircleCheck } from "lucide-react";
import type { Project } from "@/domain/project";

/**
 * A project's lifecycle marks (UAT-03): "✓ הושלם" in the success color (quiet tint), and
 * "בארכיון" as muted metadata. Independent: a completed archived project shows both. Each is an
 * icon plus text, never color alone. Active projects show nothing.
 */
export function ProjectStatus({ project }: { project: Pick<Project, "completedAt" | "archivedAt"> }) {
  if (project.completedAt === null && project.archivedAt === null) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm font-normal">
      {project.completedAt !== null ? (
        <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-success-tint px-2 text-success">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          הושלם
        </span>
      ) : null}
      {project.archivedAt !== null ? (
        <span className="inline-flex items-center gap-1 text-text-muted">
          <Archive aria-hidden className="size-4 shrink-0" />
          בארכיון
        </span>
      ) : null}
    </span>
  );
}
