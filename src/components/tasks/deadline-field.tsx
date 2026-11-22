"use client";

import { addDays, formatDateLong, formatDateOnly, type DateOnly } from "@/domain/dates";
import { DatePicker } from "./date-picker";
import { ChipRadio, FieldError, describedBy } from "./form-parts";

const CHIPS = [
  { label: "היום", days: 0 },
  { label: "מחר", days: 1 },
  { label: "בעוד שבוע", days: 7 },
] as const;

/**
 * Deadline: chips "היום / מחר / בעוד שבוע", then "תאריך אחר…" (the RTL date picker).
 * The resolved date is always spelled out below (MASTER.md §6 Quick Create).
 */
export function DeadlineField({
  idPrefix,
  value,
  onChange,
  today,
  defaultDeadline,
  error,
  warning,
}: {
  idPrefix: string;
  value: DateOnly;
  onChange: (value: DateOnly) => void;
  today: DateOnly;
  /** today + the user's horizon; marked "ברירת המחדל". */
  defaultDeadline: DateOnly;
  error?: string;
  /** e.g. the override-clearing warning in the edit form. */
  warning?: string;
}) {
  const legendId = `${idPrefix}-deadline-legend`;
  const resolvedId = `${idPrefix}-deadline-resolved`;
  const errorId = `${idPrefix}-deadline-error`;
  const warningId = `${idPrefix}-deadline-warning`;
  const chipDates = CHIPS.map((chip) => addDays(today, chip.days));
  const isChip = chipDates.includes(value);

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={describedBy(resolvedId, error && errorId, warning && warningId)}>
      <legend id={legendId} className="mb-2 text-sm font-medium">
        מועד <span aria-hidden className="text-danger">*</span>
        <span className="sr-only"> (חובה)</span>
      </legend>
      <input type="hidden" name="deadline" value={value} />
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((chip, index) => (
          <ChipRadio
            key={chip.label}
            name={`${idPrefix}-deadline-chip`}
            value={chipDates[index]!}
            checked={value === chipDates[index]}
            onChange={(date) => onChange(date)}
          >
            {chip.label}
          </ChipRadio>
        ))}
        <DatePicker
          id={`${idPrefix}-deadline`}
          labelId={legendId}
          value={isChip ? null : value}
          placeholder="תאריך אחר…"
          onChange={(date) => date && onChange(date)}
          today={today}
          invalid={Boolean(error)}
          describedBy={error ? errorId : undefined}
        />
      </div>
      <p id={resolvedId} className="text-sm text-text-secondary">
        {formatDateLong(value)} · <span className="tabular-nums">{formatDateOnly(value)}</span>
        {value === defaultDeadline ? " · ברירת המחדל" : null}
      </p>
      {warning ? (
        <p id={warningId} role="status" className="text-sm text-warning">
          {warning}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
