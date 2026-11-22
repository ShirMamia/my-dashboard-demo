import { formatDateLong, formatDateOnly, isDateOnly, type DateOnly } from "@/domain/dates";
import { preparationDeadline } from "@/domain/planning";

export const INDEPENDENCE_NOTE = "משימת ההכנה היא משימה עצמאית ולא תתעדכן אם התאריך ישתנה.";

/**
 * The preparation task's deadline as it will be created: item date − lead time, or today when
 * that is already past (with the reason). Recomputed on the server at creation.
 */
export function PreparationPreview({ date, leadDays, today }: { date: DateOnly | null; leadDays: number | null; today: DateOnly }) {
  if (!date || !isDateOnly(date) || leadDays === null || leadDays > 365) {
    return <p className="text-sm text-text-muted">מועד משימת ההכנה יחושב לפי התאריך וזמן ההכנה.</p>;
  }
  const { deadline, clamped } = preparationDeadline(date, leadDays, today);
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      <p>
        מועד משימת ההכנה: {formatDateLong(deadline)} · <span className="tabular-nums">{formatDateOnly(deadline)}</span>
      </p>
      {clamped ? <p className="text-warning">המועד המחושב כבר עבר, ולכן מועד משימת ההכנה יהיה היום.</p> : null}
    </div>
  );
}
