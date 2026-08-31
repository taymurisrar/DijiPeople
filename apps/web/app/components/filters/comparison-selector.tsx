"use client";

import * as React from "react";
import { SelectField } from "@/app/components/ui/form-control";
import {
  COMPARISON_MODE_OPTIONS,
  formatPeriodLabel,
  isComparisonMode,
  periodLengthInDays,
  resolveComparison,
  type ComparisonMode,
  type DateRange,
} from "./period";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";

/*
 * What the current period is measured against.
 *
 * The hint under the control is the point of the component. "Previous period"
 * and "Same range, previous month" are two different windows and a reader
 * cannot tell which one produced a "-3.2%" from the phrase alone — 1–31 October
 * against the previous *period* is the 31 days ending 30 September, while
 * against the previous *month* it is the 30 days of September. The second
 * comparison is one day shorter, and on a daily-count metric that difference is
 * roughly 3%: the whole of the movement, entirely an artefact.
 *
 * So the resolved window is printed, always. A comparison whose dates are
 * invisible is a comparison the reader has to trust.
 */

export type ComparisonSelectorProps = {
  value: ComparisonMode;
  onChange: (next: ComparisonMode) => void;
  /** The period being compared. Drives the resolved-window hint. */
  period: DateRange;
  disabled?: boolean;
  className?: string;
  label?: string;
};

export function ComparisonSelector({
  className,
  disabled,
  label = "Compare to",
  onChange,
  period,
  value,
}: ComparisonSelectorProps) {
  const formattingContext = useFormattingContext();
  const comparison = resolveComparison(period, value);

  const hint = React.useMemo(() => {
    if (!comparison) {
      return undefined;
    }

    const rendered = formatPeriodLabel(comparison, formattingContext);
    if (!rendered) {
      return undefined;
    }

    const periodDays = periodLengthInDays(period);
    const comparisonDays = periodLengthInDays(comparison);

    /*
     * A length mismatch is called out rather than left for the reader to
     * notice, because it is the thing that makes the percentage misleading and
     * it is invisible in the dates unless you count them.
     */
    return comparisonDays === periodDays
      ? rendered
      : `${rendered} - ${comparisonDays} days vs ${periodDays}, so totals are not directly comparable`;
  }, [comparison, period, formattingContext]);

  return (
    <SelectField
      className={className}
      disabled={disabled}
      hint={hint}
      label={label}
      onChange={(next) => {
        /* An unrecognised value clears the comparison rather than storing junk. */
        onChange(isComparisonMode(next) ? next : "none");
      }}
      options={COMPARISON_MODE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
      placeholder="No comparison"
      value={value}
    />
  );
}
