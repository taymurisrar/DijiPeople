"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCcw, Search } from "lucide-react";
import { DataTableFilterField } from "./types";

type DataTableToolbarProps = {
  fields: DataTableFilterField[];
  submitLabel?: string;
  resetLabel?: string;
  title?: string;
  description?: string;
};

export function DataTableToolbar({
  fields,
  submitLabel = "Apply filters",
  resetLabel = "Reset",
  title = "Filter records",
  description = "Refine the current view using saved query filters.",
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

  const hasActiveFilters = useMemo(
    () => fields.some((field) => Boolean(currentValues[field.key]?.trim())),
    [fields, currentValues],
  );

  function buildUrl(params: URLSearchParams) {
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }

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

    router.push(buildUrl(nextParams));
  }

  function handleReset() {
    const nextParams = new URLSearchParams(searchParams.toString());

    for (const field of fields) {
      nextParams.delete(field.key);
    }

    router.push(buildUrl(nextParams));
  }

  if (!fields.length) {
    return null;
  }

  return (
    <form
      action={handleSubmit}
      className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-border bg-surface-strong px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted" />
            <p className="text-sm font-semibold text-foreground">{title}</p>
          </div>
          <p className="mt-1 text-xs text-muted">{description}</p>
        </div>

        {hasActiveFilters ? (
          <span className="w-fit rounded-full bg-foreground px-3 py-1 text-xs font-medium text-white">
            Active filters
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <label key={field.key} className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
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
                  placeholder={field.placeholder ?? `Search ${field.label}`}
                  type="text"
                />
              </div>
            )}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border bg-surface-strong px-5 py-4">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
          type="submit"
        >
          {submitLabel}
        </button>

        <button
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-5 py-3 text-sm font-medium text-muted transition hover:border-accent/30 hover:text-foreground"
          disabled={!hasActiveFilters}
          onClick={handleReset}
          type="button"
        >
          <RotateCcw className="h-4 w-4" />
          {resetLabel}
        </button>
      </div>
    </form>
  );
}