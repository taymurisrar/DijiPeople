"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { DataTableFilterField } from "./types";

type DataTableToolbarProps = {
  fields: DataTableFilterField[];
  submitLabel?: string;
  resetLabel?: string;
};

export function DataTableToolbar({
  fields,
  submitLabel = "Apply filters",
  resetLabel = "Reset",
}: DataTableToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentValues = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      values[field.key] = searchParams.get(field.key) ?? "";
    }
    return values;
  }, [fields, searchParams]);

  function handleSubmit(formData: FormData) {
    const nextParams = new URLSearchParams(searchParams.toString());

    for (const field of fields) {
      const value = formData.get(field.key)?.toString().trim() ?? "";
      if (value) {
        nextParams.set(field.key, value);
      } else {
        nextParams.delete(field.key);
      }
    }

    router.push(`${pathname}?${nextParams.toString()}`);
  }

  function handleReset() {
    const nextParams = new URLSearchParams(searchParams.toString());

    for (const field of fields) {
      nextParams.delete(field.key);
    }

    const queryString = nextParams.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  return (
    <form
      action={handleSubmit}
      className="rounded-[24px] border border-border bg-surface p-5 shadow-sm"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(220px,1fr))]">
        {fields.map((field) => (
          <label key={field.key} className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {field.label}
            </span>

            {field.type === "select" ? (
              <select
                className="h-12 rounded-2xl border border-border bg-white px-4 text-sm text-foreground outline-none transition focus:border-accent"
                defaultValue={currentValues[field.key] ?? ""}
                name={field.key}
              >
                <option value="">All</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  className="h-12 w-full rounded-2xl border border-border bg-white pl-11 pr-4 text-sm text-foreground outline-none transition focus:border-accent"
                  defaultValue={currentValues[field.key] ?? ""}
                  name={field.key}
                  placeholder={field.placeholder}
                  type="text"
                />
              </div>
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          type="submit"
        >
          {submitLabel}
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          onClick={handleReset}
          type="button"
        >
          <X className="h-4 w-4" />
          {resetLabel}
        </button>
      </div>
    </form>
  );
}