import { ChartGantt } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { TimelineChart } from "@/components/timeline/timeline-chart";
import { TimelineList } from "@/components/timeline/timeline-list";
import { TimelineLegend, TimelineToolbar } from "@/components/timeline/timeline-toolbar";
import { todayInAppZone } from "@/domain/dates";
import { buildTimeline, parseTimelineParams, timelineRange, timelineTitle } from "@/domain/timeline";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/server/auth";
import { listProjects } from "@/server/data/projects";
import { listTimelinePlanningItems, listTimelineTasks } from "@/server/data/timeline";

export const metadata: Metadata = { title: "גאנט · לוח בקרה" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="גאנט" />
      <Suspense fallback={<TimelineSkeleton />}>
        <TimelineContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TimelineContent({ searchParams }: Pick<PageProps<"/timeline">, "searchParams">) {
  const auth = await requireAuth();
  const raw = await searchParams;
  const today = todayInAppZone();
  const params = parseTimelineParams(
    Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, first(value)])),
    today,
  );
  const range = timelineRange(params.zoom, params.anchor);
  // One parallel round for the visible range: tasks overlapping it, planning items dated in it,
  // and the project names (archived included: their tasks remain). Nothing per project or task.
  const [tasks, planningItems, projects] = await Promise.all([
    listTimelineTasks(auth, range.from, range.to),
    listTimelinePlanningItems(auth, range.from, range.to),
    listProjects(auth, { includeArchived: true }),
  ]);
  const model = buildTimeline({
    range,
    today,
    tasks,
    planningItems,
    projects,
    showDone: params.showDone,
    showDeadlineOnly: params.showDeadlineOnly,
  });
  const title = timelineTitle(range);

  return (
    <>
      <TimelineToolbar params={params} model={model} title={title} today={today} />
      {model.groups.length === 0 ? (
        <EmptyState icon={ChartGantt} title="אין משימות או אבני דרך בטווח זה." />
      ) : (
        <>
          {/* Below 768px only the list renders (display: none takes the chart out of layout and
              the accessibility tree); the chart is server-rendered markup with no chart library. */}
          <div className={cn("hidden flex-col gap-3", !params.list && "md:flex")}>
            <TimelineChart model={model} title={title} />
            <TimelineLegend />
          </div>
          <div className={cn(!params.list && "md:hidden")}>
            <TimelineList model={model} />
          </div>
        </>
      )}
    </>
  );
}

function TimelineSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="טוען את הגאנט" className="flex flex-col gap-4">
      <div className="h-9 w-72 max-w-full rounded-lg bg-surface-subtle" />
      <div className="flex flex-col gap-px overflow-hidden rounded-xl border bg-border">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-14 bg-surface" />
        ))}
      </div>
    </div>
  );
}
