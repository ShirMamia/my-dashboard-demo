import { CircleAlert, Hand } from "lucide-react";
import Link from "next/link";
import { CompleteToggle } from "@/components/tasks/complete-toggle";
import { DeadlineText, ImportantMark, StatusPill, UrgentMark, signalsOf } from "@/components/tasks/task-signals";
import { formatDayMonth, type DateOnly } from "@/domain/dates";
import type { TodayItem, TodayReason } from "@/domain/today";
import { AddToTodayDialog, type PickCandidate } from "./add-to-today-dialog";
import { TodayRowAction } from "./today-row-action";

export const TODAY_HEADING_ID = "today-heading";

/** Reasons that already state the days remaining, so the meta line shows only the date. */
const REASON_HAS_DAYS: ReadonlySet<TodayReason["code"]> = new Set([
  "overdue",
  "due_today",
  "due_tomorrow",
  "important",
  "upcoming",
]);

/** Today (MASTER_SPEC §6, MASTER.md §6): the Dashboard's primary surface, up to 5 tasks. */
export function TodaySection({
  items,
  today,
  candidates,
  pickLimitReached,
  projectNames,
  categoryNames,
}: {
  items: TodayItem[];
  today: DateOnly;
  candidates: PickCandidate[];
  pickLimitReached: boolean;
  projectNames: Map<string, string>;
  categoryNames: Map<string, string>;
}) {
  const noOpenTasks = items.length === 0 && candidates.length === 0;
  return (
    <section aria-labelledby={TODAY_HEADING_ID} className="flex flex-col rounded-xl border bg-surface">
      <h2 id={TODAY_HEADING_ID} tabIndex={-1} className="px-4 pt-4 pb-2 text-lg font-semibold outline-none">
        המשימות למיקוד היום
      </h2>

      {items.length > 0 ? (
        <ol aria-labelledby={TODAY_HEADING_ID} className="flex flex-col">
          {items.map((item) => (
            <TodayRow
              key={item.task.id}
              item={item}
              today={today}
              projectNames={projectNames}
              categoryNames={categoryNames}
            />
          ))}
        </ol>
      ) : (
        <div className="flex flex-col gap-1 px-4 py-6">
          <p className="font-medium">אין משימות למיקוד היום.</p>
          <p className="text-text-secondary">
            {noOpenTasks
              ? "אין משימות פתוחות. משימה חדשה אפשר ליצור מהכפתור משימה חדשה."
              : "משימות באיחור, דחופות, חשובות או קרובות יוצעו כאן. אפשר גם לבחור משימה בעצמך."}
          </p>
        </div>
      )}

      {noOpenTasks ? null : (
        <div className="border-t px-4 py-3">
          <AddToTodayDialog candidates={candidates} full={pickLimitReached} />
        </div>
      )}
    </section>
  );
}

function TodayRow({
  item,
  today,
  projectNames,
  categoryNames,
}: {
  item: TodayItem;
  today: DateOnly;
  projectNames: Map<string, string>;
  categoryNames: Map<string, string>;
}) {
  const { task } = item;
  const signals = signalsOf(task, today);
  const projectName = task.projectId ? projectNames.get(task.projectId) : undefined;
  const categoryName = task.categoryId ? categoryNames.get(task.categoryId) : undefined;

  return (
    // Content, then completion beside the title (the leading edge stays free for a future
    // selection mode), then the row action. Below sm the row action moves under the content.
    <li className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/tasks/${task.id}`} className="text-md font-medium wrap-anywhere hover:underline">
          <bdi>{task.title}</bdi>
        </Link>
        <Reason item={item} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
          <DeadlineText
            task={task}
            signals={signals}
            dateOnly={item.source === "recommended" && REASON_HAS_DAYS.has(item.reason.code)}
          />
          <UrgentMark signals={signals} />
          <ImportantMark important={signals.important} />
          <StatusPill status={task.status} />
          {item.startsOn ? <span>מתחילה ב-{formatDayMonth(item.startsOn)}</span> : null}
          {projectName ? (
            <Link href={`/projects/${task.projectId}`} className="hover:underline">
              <span className="sr-only">פרויקט: </span>
              <bdi>{projectName}</bdi>
            </Link>
          ) : null}
          {categoryName ? (
            <span>
              <span className="sr-only">קטגוריה: </span>
              <bdi>{categoryName}</bdi>
            </span>
          ) : null}
        </div>
      </div>
      <div className="pt-1">
        <CompleteToggle taskId={task.id} title={task.title} status={task.status} focusAfterId={TODAY_HEADING_ID} />
      </div>
      <div className="col-start-1 -ms-3 sm:col-start-auto sm:ms-0">
        <TodayRowAction
          taskId={task.id}
          title={task.title}
          kind={item.source === "pick" ? "remove" : "dismiss"}
          focusAfterId={TODAY_HEADING_ID}
        />
      </div>
    </li>
  );
}

/** Why the task is here, as text (never color or position alone). */
function Reason({ item }: { item: TodayItem }) {
  if (item.source === "pick") {
    return (
      <p className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        <Hand aria-hidden className="size-4 shrink-0" />
        {item.reasonText}
      </p>
    );
  }
  const overdue = item.reason.code === "overdue";
  return (
    <p className={overdue ? "inline-flex items-center gap-1 text-sm font-semibold text-danger" : "text-sm text-text-secondary"}>
      {overdue ? <CircleAlert aria-hidden className="size-4 shrink-0" /> : null}
      <span className="sr-only">הומלצה: </span>
      {item.reasonText}
    </p>
  );
}
