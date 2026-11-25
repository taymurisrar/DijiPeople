"use client";

import { DateField, TimeField } from "@/app/components/ui/form-control";
import { dateInputFor } from "../_lib/daily-updates";

/**
 * A date and a time, edited with the shared controls, as one local
 * `YYYY-MM-DDTHH:mm` value ("" until both are chosen).
 */
export function MomentField({
  label,
  onChange,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  const [date = "", time = ""] = value.split("T");

  const combine = (nextDate: string, nextTime: string) =>
    nextDate && nextTime ? `${nextDate}T${nextTime}` : "";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DateField
        label={`${label} date`}
        onChange={(next) => onChange(combine(next, time || "09:00"))}
        required={required}
        value={date}
      />
      <TimeField
        label={`${label} time`}
        onChange={(next) => onChange(combine(date || dateInputFor(), next))}
        required={required}
        value={time}
      />
    </div>
  );
}
