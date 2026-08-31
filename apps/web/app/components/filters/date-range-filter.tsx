"use client";

import * as React from "react";
import { DateField, SelectField } from "@/app/components/ui/form-control";
import {
  formatPeriodLabel,
  isPeriodPreset,
  PERIOD_PRESET_OPTIONS,
  periodLengthInDays,
  resolvePeriod,
  type DateRange,
  type PeriodPreset,
} from "./period";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * Preset first, custom dates second.
 *
 * The presets are what people actually pick — "last 30 days", "previous month" —
 * and a pair of empty date inputs asks the reader to know the answer before
 * they have seen the question. The custom fields appear only once "Custom
 * range" is chosen, so the common case is one control.
 *
 * Built from `SelectField` and `DateField` rather than a raw `<select>` and
 * `<input type="date">`. Those two carry the label association, the
 * `aria-invalid` wiring, the keyboard-navigable listbox and the error/hint
 * slots that BUG-0043 and BUG-1956 put there; the attendance exception filters
 * this pattern otherwise follows predate them and still use raw controls with a
 * hand-rolled label wrapper, which is the thing not to copy.
 */

export type DateRangeFilterValue = {
  preset: PeriodPreset;
  /** `yyyy-MM-dd`. Read only when `preset` is `"custom"`. */
  from?: string;
  to?: string;
};

export type DateRangeFilterProps = {
  value: DateRangeFilterValue;
  onChange: (next: DateRangeFilterValue) => void;
  /** The tenant's zone, so "today" means the tenant's today. */
  timezone?: string | null;
  /** Injectable for tests and for a fixed as-of date. */
  referenceDate?: Date | string | null;
  disabled?: boolean;
  className?: string;
  /** Blocks a future date on the custom fields. Default `true`. */
  disallowFuture?: boolean;
  label?: string;
};

export function DateRangeFilter({
  className,
  disabled,
  disallowFuture = true,
  label = "Period",
  onChange,
  referenceDate,
  timezone,
  value,
}: DateRangeFilterProps) {
  const formattingContext = useFormattingContext();
  const isCustom = value.preset === "custom";

  const resolved: DateRange = resolvePeriod(value.preset, {
    timezone,
    referenceDate,
    custom: { from: value.from, to: value.to },
  });

  /*
   * The resolved dates are shown as a hint under the preset. "Previous
   * quarter" is not a date range until it is one, and a reader comparing this
   * screen against a spreadsheet needs to know which days were counted.
   */
  const resolvedLabel = formatPeriodLabel(resolved, formattingContext);
  const days = periodLengthInDays(resolved);

  const today = resolvePeriod("today", { timezone, referenceDate }).to;

  return (
    <div className={className}>
      <SelectField
        disabled={disabled}
        hint={
          resolvedLabel
            ? `${resolvedLabel} (${days} ${days === 1 ? "day" : "days"})`
            : undefined
        }
        label={label}
        onChange={(next) => {
          if (!isPeriodPreset(next)) {
            return;
          }

          /*
           * Leaving from/to behind when switching away from Custom would put
           * a stale explicit range in the URL, which
           * `resolveAnalyticsPeriod` treats as more specific than the preset —
           * so the screen would silently ignore the preset just chosen.
           */
          onChange(
            next === "custom"
              ? { preset: next, from: value.from ?? resolved.from, to: value.to ?? resolved.to }
              : { preset: next },
          );
        }}
        options={PERIOD_PRESET_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        placeholder="Select a period"
        value={value.preset}
      />

      {isCustom ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DateField
            disabled={disabled}
            label="From"
            /*
             * `max` on each field is the other end of the range, so the
             * browser's own picker refuses an inverted range before the query
             * string ever sees one. `normalizeRange` still swaps a pair that
             * gets through — typed, pasted or from a link — because a
             * client-side constraint is a convenience, never a guarantee.
             */
            max={value.to || (disallowFuture ? today : undefined)}
            onChange={(next) => onChange({ ...value, preset: "custom", from: next })}
            value={value.from ?? ""}
          />

          <DateField
            disabled={disabled}
            label="To"
            max={disallowFuture ? today : undefined}
            min={value.from}
            onChange={(next) => onChange({ ...value, preset: "custom", to: next })}
            value={value.to ?? ""}
          />
        </div>
      ) : null}
    </div>
  );
}
