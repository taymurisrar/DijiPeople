"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  EXCEPTION_STATUS_OPTIONS,
  EXCEPTION_TYPE_OPTIONS,
} from "../_lib/types";

/**
 * Filters, driven through the URL.
 *
 * The query string is the state: a reviewer can bookmark "open leave conflicts
 * this month" or paste it to a colleague, and it survives a refresh. Local
 * component state would lose all three.
 *
 * Employee, organization, business unit, department and team are filtered
 * server-side by the caller's own scope, so the fields offered here are the ones
 * that narrow within it rather than ones that could imply wider access than the
 * reader has.
 */
export function AttendanceExceptionFilters({
  current,
}: {
  current: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const value = (key: string): string => {
    const raw = current[key];
    return (Array.isArray(raw) ? raw[0] : raw) ?? "";
  };

  function apply(key: string, next: string) {
    const search = new URLSearchParams(params?.toString() ?? "");

    if (next) {
      search.set(key, next);
    } else {
      search.delete(key);
    }

    // Any filter change returns to the first page: staying on page 4 of a
    // narrower result set usually shows nothing at all.
    search.delete("page");

    router.push(`/attendance/exceptions?${search.toString()}`);
  }

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="From">
        <input
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          defaultValue={value("from")}
          onChange={(event) => apply("from", event.target.value)}
          type="date"
        />
      </Field>

      <Field label="To">
        <input
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          defaultValue={value("to")}
          onChange={(event) => apply("to", event.target.value)}
          type="date"
        />
      </Field>

      <Field label="Type">
        <select
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          defaultValue={value("type")}
          onChange={(event) => apply("type", event.target.value)}
        >
          <option value="">All types</option>
          {EXCEPTION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Status">
        <select
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          defaultValue={value("status") || "OPEN"}
          onChange={(event) => apply("status", event.target.value)}
        >
          {EXCEPTION_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Employee">
        <input
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          defaultValue={value("employeeId")}
          onBlur={(event) => apply("employeeId", event.target.value.trim())}
          placeholder="Employee ID"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
