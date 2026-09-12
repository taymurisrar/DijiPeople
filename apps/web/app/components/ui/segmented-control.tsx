"use client";

import { useId } from "react";

/*
 * Extracted from the subscription Plans screen (BUG-3345) where it was a
 * local, hand-rolled control painted in `bg-foreground` — the body-text
 * colour — instead of the tenant brand accent. Moved here so any screen that
 * needs a Monthly/Annual-style toggle reuses one accessible, on-brand
 * implementation instead of growing another local copy.
 *
 * `role="radiogroup"` / `role="radio"` / `aria-checked` per ITEM-0159: the
 * control's previous incarnation was two plain buttons whose selected state
 * was conveyed by background colour alone, so assistive technology reported
 * no state at all.
 */
export type SegmentedControlOption<T extends string> = {
  label: string;
  value: T;
  /** Short qualifier rendered beside the label, e.g. "save 17%". */
  description?: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  const labelId = useId();

  return (
    <div className={className}>
      <p id={labelId} className="text-sm font-medium text-foreground">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="mt-2 inline-grid auto-cols-fr grid-flow-col rounded-[14px] border border-border bg-white p-1"
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`whitespace-nowrap rounded-[10px] px-4 py-2 text-sm font-semibold transition ${
                selected
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {option.label}
              {option.description ? (
                <span className="ml-1.5 text-xs font-medium opacity-80">
                  {option.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
