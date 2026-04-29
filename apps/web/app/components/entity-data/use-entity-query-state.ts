"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type EntityQueryState = {
  search: string;
  page: number;
  pageSize: number;
  orderBy: string;
  filter: string;
};

export function useEntityQueryState(defaults: Partial<EntityQueryState> = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = useMemo<EntityQueryState>(
    () => ({
      search: searchParams.get("search") ?? defaults.search ?? "",
      page: getPositiveInteger(searchParams.get("page"), defaults.page ?? 1),
      pageSize: getPositiveInteger(
        searchParams.get("pageSize"),
        defaults.pageSize ?? 25,
      ),
      orderBy: searchParams.get("orderBy") ?? defaults.orderBy ?? "",
      filter: searchParams.get("filter") ?? defaults.filter ?? "",
    }),
    [defaults.filter, defaults.orderBy, defaults.page, defaults.pageSize, defaults.search, searchParams],
  );

  const setState = useCallback(
    (next: Partial<EntityQueryState>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }

      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return { state, setState };
}

function getPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}
