"use client";

import { useMemo } from "react";

type ColorPickerFieldProps = {
  description?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
};

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ColorPickerField({
  description,
  label,
  onChange,
  value,
}: ColorPickerFieldProps) {
  const normalizedColor = useMemo(() => {
    const trimmed = value.trim();
    return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : "#0f766e";
  }, [value]);

  const isValid = HEX_COLOR_PATTERN.test(value.trim());

  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-white px-3 py-2">
        <input
          className="h-10 w-14 rounded-lg border border-border bg-white p-0"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={normalizedColor}
        />
        <input
          className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${
            isValid
              ? "border-border focus:border-accent focus:ring-2 focus:ring-accent/20"
              : "border-amber-300 bg-amber-50 text-amber-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          }`}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#0f766e"
          value={value}
        />
        <span
          className="h-8 w-8 rounded-lg border border-border"
          style={{ backgroundColor: normalizedColor }}
        />
      </div>
      {description ? <span className="text-xs text-muted">{description}</span> : null}
      {!isValid && value.trim().length > 0 ? (
        <span className="text-xs text-amber-700">
          Enter a valid HEX color (for example `#0f766e`).
        </span>
      ) : null}
    </label>
  );
}
