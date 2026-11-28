"use client";

import { useCallback, useEffect, useState } from "react";
import { LookupField, type LookupOption } from "@/app/components/ui/form-control";
import type { PersonOption } from "../_lib/people";

type PersonRow = {
  id: string;
  fullName: string;
  employeeCode?: string | null;
};

/**
 * An employee picker. `employees` searches the employees the caller may read, so
 * a person out of reach is never offered (used for assigning a template, which
 * the API re-checks). `handover-recipients` lists the colleagues a handover may
 * go to: a person who can read only their own employee record could not name a
 * receiver through the employees list, so handovers have a list of their own.
 */
export function EmployeeLookupField({
  label,
  onChange,
  people,
  required,
  source = "employees",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  people: readonly PersonOption[];
  required?: boolean;
  source?: "employees" | "handover-recipients";
  value: string;
}) {
  const [options, setOptions] = useState<LookupOption[]>(() =>
    people.map((p) => ({ id: p.id, name: p.name, code: p.code ?? null })),
  );

  const search = useCallback(
    async (query: string) => {
      try {
        const text = query.trim();
        const url =
          source === "handover-recipients"
            ? `/api/work-duties/handover-recipients${
                text ? `?search=${encodeURIComponent(text)}` : ""
              }`
            : `/api/employees?${new URLSearchParams({
                pageSize: "20",
                ...(text ? { search: text } : {}),
              }).toString()}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { items?: PersonRow[] };
        const found = (body.items ?? []).map((item) => ({
          id: item.id,
          name: item.fullName,
          code: item.employeeCode ?? null,
        }));
        setOptions((previous) => {
          const kept = previous.filter((p) => p.id === value);
          return [...kept, ...found.filter((f) => f.id !== value)];
        });
      } catch {
        // A failed search leaves the previous options in place.
      }
    },
    [source, value],
  );

  // The handover list is not seeded by the page, so load the first people on open.
  useEffect(() => {
    if (source === "handover-recipients") void search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  return (
    <LookupField
      label={label}
      onChange={onChange}
      onSearch={(query) => void search(query)}
      options={options}
      required={required}
      value={value}
    />
  );
}
