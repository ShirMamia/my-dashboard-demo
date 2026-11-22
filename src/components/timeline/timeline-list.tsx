import Link from "next/link";
import type { TimelineModel } from "@/domain/timeline";
import { cn } from "@/lib/utils";
import { EntryIcon } from "./entry-icon";
import { entryClipping, entryDates, entryHref, entryState, KIND_LABELS } from "./entry-text";

/**
 * The accessible list alternative (MASTER_SPEC §12): the same groups and entries as the chart,
 * after the same filters, as text. The only Gantt view below 768px; "הצג כרשימה" on wider screens.
 */
export function TimelineList({ model }: { model: TimelineModel }) {
  return (
    <div className="flex flex-col gap-6">
      {model.groups.map((group) => {
        const headingId = `timeline-list-${group.key}`;
        return (
          <section key={group.key} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h3 id={headingId} className="text-md font-semibold wrap-anywhere">
              <bdi>{group.name}</bdi>
              {group.completed ? <span className="font-normal text-text-secondary"> (הושלם)</span> : null}
              {group.archived ? <span className="font-normal text-text-secondary"> (בארכיון)</span> : null}
            </h3>
            <ul aria-labelledby={headingId} className="flex flex-col divide-y rounded-xl border bg-surface">
              {group.entries.map((entry) => {
                const state = entryState(entry);
                const clipping = entryClipping(entry);
                return (
                  <li key={entry.key} className="flex items-start gap-3 px-4 py-3">
                    <EntryIcon entry={entry} className="mt-1" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={entryHref(entry)}
                        className={cn("font-medium wrap-anywhere hover:underline", state?.tone === "done" && "text-text-secondary")}
                      >
                        <bdi>{entry.title}</bdi>
                      </Link>
                      <p className="text-sm text-text-secondary tabular-nums">
                        {KIND_LABELS[entry.kind]}
                        {" · "}
                        {entryDates(entry).shown}
                        {state ? (
                          <span className={state.tone === "danger" ? "font-semibold text-danger" : undefined}> · {state.text}</span>
                        ) : null}
                      </p>
                      {clipping ? <p className="text-sm text-text-muted">{clipping}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
