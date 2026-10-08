"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import {
  SEVERITY_LABEL,
  severityGroupOf,
  titleCase,
  type SeverityGroup,
} from "@/lib/error-log-console";

/*
 * The small vocabulary the monitoring screens share: a severity badge, a
 * support-status badge, a filter select and a copyable reference. One
 * definition each, so a "Critical" on the overview and a "Critical" in the
 * error log are the same colour and the same word.
 *
 * Badges carry their meaning in text; the colour is emphasis only.
 */

const SEVERITY_TONE: Record<SeverityGroup, string> = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  info: "bg-slate-100 text-slate-700 ring-slate-200",
  other: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function SeverityBadge({
  severity,
  group,
}: {
  severity: string;
  group?: string | null;
}) {
  const resolved = severityGroupOf(severity, group);
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${SEVERITY_TONE[resolved]}`}
      title={`Recorded as "${severity}"`}
    >
      {resolved === "other" ? titleCase(severity) : SEVERITY_LABEL[resolved]}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  NEW: "bg-rose-50 text-rose-700 ring-rose-200",
  INVESTIGATING: "bg-blue-50 text-blue-700 ring-blue-200",
  FIX_IN_PROGRESS: "bg-blue-50 text-blue-700 ring-blue-200",
  WAITING_ON_CUSTOMER: "bg-amber-50 text-amber-800 ring-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  NOT_AN_INCIDENT: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function SupportStatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_TONE[value] ?? STATUS_TONE.NOT_AN_INCIDENT}`}
    >
      {titleCase(value)}
    </span>
  );
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
  includeAll = true,
  disabled = false,
  className = "",
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allLabel?: string;
  includeAll?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={`grid min-w-0 gap-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10 disabled:bg-slate-50 disabled:text-slate-400"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {includeAll ? <option value="">{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A reference id that copies itself; it is what support pastes to a customer. */
export function CopyReference({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={`Copy reference ${value}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md font-mono text-xs text-slate-700 hover:text-slate-950 ${className}`}
      onClick={(event) => {
        // Inside a clickable table row: copying must not also open the row.
        event.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      // The row opens on Enter as well; a key press here is for the button.
      onKeyDown={(event) => event.stopPropagation()}
      title="Copy reference"
      type="button"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Copy aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

/** A labelled value in a detail grid. */
export function Field({
  label,
  children,
  mono = false,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-words text-sm text-slate-900 ${mono ? "font-mono text-xs" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}
