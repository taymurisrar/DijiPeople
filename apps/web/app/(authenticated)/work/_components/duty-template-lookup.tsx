"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LookupField, type LookupOption } from "@/app/components/ui/form-control";
import {
  buildTemplateSearchQuery,
  mergeTemplateOptions,
  type DutyTemplate,
  type Page,
} from "../_lib/duties";
import { workRequest } from "../_lib/work-client";

const DEBOUNCE_MS = 250;

/**
 * A template picker that searches every template of the tenant (name or key, 20
 * at a time) instead of holding a fixed first page, so no template is out of
 * reach however many there are. The chosen template stays in the options even
 * when a later search no longer returns it.
 */
export function DutyTemplateLookup({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (templateId: string) => void;
  value: string;
}) {
  const [options, setOptions] = useState<LookupOption[]>([]);
  const chosen = useRef<{ id: string; name: string; key?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const search = useCallback(async (query: string) => {
    const ticket = (latest.current += 1);
    try {
      const page = await workRequest<Page<DutyTemplate>>(
        "work-duties",
        `/templates?${buildTemplateSearchQuery(query)}`,
      );
      // A slower, older answer never replaces a newer one.
      if (ticket !== latest.current) return;
      setOptions(
        mergeTemplateOptions(page.items, chosen.current).map((t) => ({
          id: t.id,
          name: t.name,
          code: t.key,
        })),
      );
    } catch {
      // A failed search leaves the previous options in place.
    }
  }, []);

  useEffect(() => {
    void search("");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [search]);

  return (
    <LookupField
      label={label}
      onChange={(next) => {
        const picked = options.find((o) => o.id === next);
        chosen.current = picked
          ? { id: picked.id, name: picked.name, key: picked.code ?? undefined }
          : null;
        onChange(next);
      }}
      onSearch={(query) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void search(query), DEBOUNCE_MS);
      }}
      options={options}
      placeholder="All templates"
      value={value}
    />
  );
}
