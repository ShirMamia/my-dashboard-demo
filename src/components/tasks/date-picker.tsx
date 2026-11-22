"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { he } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateLong, formatDateOnly, type DateOnly } from "@/domain/dates";
import { cn } from "@/lib/utils";

// Accessible RTL date picker (MASTER.md §6 "Date picker"): shadcn Calendar / react-day-picker
// with the Hebrew locale, Sunday first, keyboard per MASTER.md §5. Not the native date input.
//
// Date-only values never pass through UTC here: "YYYY-MM-DD" ↔ a local Date built from its
// year/month/day parts, which is the same calendar day in any browser timezone.

export function toLocalDate(date: DateOnly): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

export function fromLocalDate(date: Date): DateOnly {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DatePicker({
  id,
  labelId,
  value,
  onChange,
  today,
  invalid,
  describedBy,
  placeholder = "בחירת תאריך",
  allowClear = false,
  className,
}: {
  id: string;
  /** id of the visible label; the trigger's name is "<label>: <date>". */
  labelId: string;
  value: DateOnly | null;
  onChange: (value: DateOnly | null) => void;
  /** Today in Asia/Jerusalem, from the server. */
  today: DateOnly;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const valueId = `${id}-value`;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-labelledby={`${labelId} ${valueId}`}
            data-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="flex min-h-9 items-center gap-2 rounded-lg border border-border-input bg-surface px-2.5 text-base hover:border-text-secondary data-invalid:border-danger"
          >
            <CalendarDays aria-hidden className="size-4 text-text-secondary" />
            <span id={valueId} className={cn("tabular-nums", !value && "text-text-muted")}>
              {value ? formatDateOnly(value) : placeholder}
              {value ? <span className="sr-only">, {formatDateLong(value)}</span> : null}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-2"
          // Focus the selected day (or today) rather than the first button (previous month),
          // so the grid's arrow keys work immediately (MASTER.md §5).
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget as HTMLElement | null;
            const day =
              content?.querySelector<HTMLElement>('[data-selected="true"] button') ??
              content?.querySelector<HTMLElement>('[data-today="true"] button') ??
              content?.querySelector<HTMLElement>("[data-day] button, button[data-day]");
            if (!day) return;
            event.preventDefault();
            day.focus();
          }}
        >
          <Calendar
            mode="single"
            dir="rtl"
            locale={he}
            weekStartsOn={0}
            today={toLocalDate(today)}
            selected={value ? toLocalDate(value) : undefined}
            defaultMonth={toLocalDate(value ?? today)}
            onSelect={(date) => {
              if (date) onChange(fromLocalDate(date));
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {allowClear && value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="min-h-9 rounded-md px-2 text-sm text-text-secondary underline-offset-4 hover:underline"
        >
          ניקוי
          <span className="sr-only"> התאריך</span>
        </button>
      ) : null}
    </div>
  );
}
