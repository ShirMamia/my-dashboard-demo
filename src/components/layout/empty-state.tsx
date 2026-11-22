import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border bg-surface px-6 py-12 text-center">
      <Icon aria-hidden className="size-6 text-text-muted" />
      <h2 className="text-md font-semibold">{title}</h2>
      {description ? <p className="max-w-prose text-base text-text-secondary wrap-anywhere">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
