"use client";

import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { DatePicker } from "@/components/tasks/date-picker";
import { ErrorSummary, FieldError, textareaClassName } from "@/components/tasks/form-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateLong, type DateOnly } from "@/domain/dates";
import type { EventFieldErrors, EventFormValues } from "@/domain/events";
import { TITLE_MAX_LENGTH } from "@/domain/task";
import { saveEventAction } from "@/server/actions/events";

const FIELD_ORDER: (keyof EventFieldErrors)[] = ["title", "startDate", "startTime", "endDate", "endTime", "yearly"];

/**
 * Create or edit a user event (MASTER_SPEC §10.2): all-day (a date range, optionally yearly when
 * it's one day) or timed (Asia/Jerusalem dates and times). Validation runs on the server.
 */
export function EventFormDialog({
  today,
  eventId,
  initial,
  title: eventTitle,
}: {
  today: DateOnly;
  /** Absent: create. */
  eventId?: string;
  initial: EventFormValues;
  /** The event's title, for the edit trigger's accessible name. */
  title?: string;
}) {
  const isEdit = eventId !== undefined;
  const prefix = isEdit ? `ev-${eventId.slice(0, 8)}` : "ev-new";
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<EventFieldErrors>({});
  const [summary, setSummary] = useState<string>();
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const set = (patch: Partial<EventFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const ids = {
    title: `${prefix}-title`,
    startDate: `${prefix}-start`,
    startTime: `${prefix}-start-time`,
    endDate: `${prefix}-end`,
    endTime: `${prefix}-end-time`,
    yearly: `${prefix}-yearly`,
  };
  const err = (field: keyof EventFieldErrors) => (errors[field] ? `${ids[field]}-error` : undefined);

  function submit() {
    // A yearly event is a single day.
    const payload = values.allDay && values.yearly ? { ...values, endDate: values.startDate } : values;
    startTransition(async () => {
      const result = await saveEventAction(eventId ?? null, payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setSummary(result.error);
        return;
      }
      setOpen(false);
      showToast({
        message: (
          <>
            האירוע <bdi className="font-semibold">{result.data.title}</bdi> {isEdit ? "נשמר." : "נוסף."}
          </>
        ),
      });
    });
  }

  const summaryErrors = FIELD_ORDER.flatMap((field): [string, string][] => (errors[field] ? [[ids[field], errors[field]!]] : []));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(initial);
          setErrors({});
          setSummary(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm">
            <Pencil aria-hidden />
            עריכה
            <span className="sr-only"> של האירוע {eventTitle}</span>
          </Button>
        ) : (
          <Button variant="outline">
            <Plus aria-hidden />
            אירוע ביום זה
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-5 sm:max-w-xl">
        <div className="flex flex-col gap-1 pe-10">
          <DialogTitle className="text-lg font-semibold">{isEdit ? "עריכת אירוע" : "אירוע חדש"}</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            {isEdit ? "שינוי האירוע לא משפיע על משימות או על פריטים אחרים בלוח השנה." : `ביום ${formatDateLong(initial.startDate)}. אפשר לשנות את התאריכים.`}
          </DialogDescription>
        </div>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit();
          }}
          className="flex flex-col gap-5"
        >
          <ErrorSummary message={summary} errors={summaryErrors} />

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.title} className="text-sm font-medium">
              כותרת <span aria-hidden className="text-danger">*</span>
              <span className="sr-only"> (חובה)</span>
            </label>
            <Input
              id={ids.title}
              dir="auto"
              autoComplete="off"
              autoFocus
              aria-required
              maxLength={TITLE_MAX_LENGTH}
              value={values.title}
              onChange={(event) => set({ title: event.target.value })}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={err("title")}
            />
            <FieldError id={`${ids.title}-error`} message={errors.title} />
          </div>

          <label className="flex min-h-9 items-center gap-2 self-start text-base">
            <input
              type="checkbox"
              checked={values.allDay}
              onChange={(event) => set(event.target.checked ? { allDay: true } : { allDay: false, yearly: false })}
              className="size-4 accent-primary"
            />
            יום שלם
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <DateTimeField
              label={values.allDay && values.yearly ? "תאריך" : "התחלה"}
              dateId={ids.startDate}
              timeId={ids.startTime}
              date={values.startDate}
              time={values.startTime}
              showTime={!values.allDay}
              today={today}
              onDate={(startDate) => set(values.endDate < startDate ? { startDate, endDate: startDate } : { startDate })}
              onTime={(startTime) => set({ startTime })}
              dateError={errors.startDate}
              timeError={errors.startTime}
            />
            {values.allDay && values.yearly ? null : (
              <DateTimeField
                label="סיום"
                dateId={ids.endDate}
                timeId={ids.endTime}
                date={values.endDate}
                time={values.endTime}
                showTime={!values.allDay}
                today={today}
                onDate={(endDate) => set({ endDate })}
                onTime={(endTime) => set({ endTime })}
                dateError={errors.endDate}
                timeError={errors.endTime}
              />
            )}
          </div>
          {values.allDay ? null : <p className="text-sm text-text-muted">השעות לפי שעון ישראל.</p>}

          {values.allDay ? (
            <div className="flex flex-col gap-1">
              <label className="flex min-h-9 items-center gap-2 self-start text-base">
                <input
                  id={ids.yearly}
                  type="checkbox"
                  checked={values.yearly}
                  onChange={(event) => set({ yearly: event.target.checked })}
                  aria-describedby={`${ids.yearly}-hint ${err("yearly") ?? ""}`.trim()}
                  className="size-4 accent-primary"
                />
                חוזר מדי שנה
              </label>
              <p id={`${ids.yearly}-hint`} className="text-sm text-text-muted">
                למשל ימי הולדת. אירוע חוזר הוא אירוע של יום אחד.
              </p>
              <FieldError id={`${ids.yearly}-error`} message={errors.yearly} />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <label htmlFor={`${prefix}-notes`} className="text-sm font-medium">
              הערות
            </label>
            <textarea
              id={`${prefix}-notes`}
              dir="auto"
              rows={3}
              value={values.notes}
              onChange={(event) => set({ notes: event.target.value })}
              className={textareaClassName}
            />
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" size="lg" aria-disabled={pending || undefined} aria-busy={pending || undefined}>
              {pending ? "שומר…" : isEdit ? "שמירה" : "הוספת אירוע"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DateTimeField({
  label,
  dateId,
  timeId,
  date,
  time,
  showTime,
  today,
  onDate,
  onTime,
  dateError,
  timeError,
}: {
  label: string;
  dateId: string;
  timeId: string;
  date: string;
  time: string;
  showTime: boolean;
  today: DateOnly;
  onDate: (date: DateOnly) => void;
  onTime: (time: string) => void;
  dateError?: string;
  timeError?: string;
}) {
  const labelId = `${dateId}-label`;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={labelId} className="mb-2 text-sm font-medium">
        {label} <span aria-hidden className="text-danger">*</span>
        <span className="sr-only"> (חובה)</span>
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          id={dateId}
          labelId={labelId}
          value={date || null}
          onChange={(value) => value && onDate(value)}
          today={today}
          invalid={Boolean(dateError)}
          describedBy={dateError ? `${dateId}-error` : undefined}
        />
        {showTime ? (
          <>
            <label htmlFor={timeId} className="sr-only">
              שעת {label} (HH:MM)
            </label>
            <Input
              id={timeId}
              dir="ltr"
              inputMode="numeric"
              placeholder="HH:MM"
              maxLength={5}
              value={time}
              onChange={(event) => onTime(event.target.value)}
              aria-invalid={timeError ? true : undefined}
              aria-describedby={timeError ? `${timeId}-error` : undefined}
              className="w-24 text-center tabular-nums"
            />
          </>
        ) : null}
      </div>
      <FieldError id={`${dateId}-error`} message={dateError} />
      <FieldError id={`${timeId}-error`} message={timeError} />
    </fieldset>
  );
}
