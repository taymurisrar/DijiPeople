"use client";

import { useEffect, useMemo, useState } from "react";
import { LookupOption } from "../types";

type EmployeeLookups = {
  countries: LookupOption[];
  states: LookupOption[];
  cities: LookupOption[];
  documentTypes: LookupOption[];
  documentCategories: LookupOption[];
  relationTypes: LookupOption[];
  departments: LookupOption[];
  designations: LookupOption[];
  employeeLevels: LookupOption[];
  locations: LookupOption[];
  workSchedules: LookupOption[];
};

const emptyLookups: EmployeeLookups = {
  countries: [],
  states: [],
  cities: [],
  documentTypes: [],
  documentCategories: [],
  relationTypes: [],
  departments: [],
  designations: [],
  employeeLevels: [],
  locations: [],
  workSchedules: [],
};

type BaseLookups = Pick<
  EmployeeLookups,
  | "countries"
  | "documentTypes"
  | "documentCategories"
  | "relationTypes"
  | "departments"
  | "designations"
  | "employeeLevels"
  | "locations"
  | "workSchedules"
>;

let baseLookupsInFlight: Promise<BaseLookups> | null = null;
let baseLookupsCache: { value: BaseLookups; expiresAt: number } | null = null;
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 8_000;

export function useEmployeeLookups(filters?: {
  countryId?: string;
  stateProvinceId?: string;
  enabled?: boolean;
}) {
  const [lookups, setLookups] = useState<EmployeeLookups>(emptyLookups);
  const [isLoading, setIsLoading] = useState(filters?.enabled !== false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (filters?.enabled === false) {
        setLookups(emptyLookups);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      const stateQuery = new URLSearchParams();
      const cityQuery = new URLSearchParams();

      if (filters?.countryId) {
        stateQuery.set("countryId", filters.countryId);
        cityQuery.set("countryId", filters.countryId);
      }

      if (filters?.stateProvinceId) {
        cityQuery.set("stateProvinceId", filters.stateProvinceId);
      }

      const requests = [
        fetch(
          `/api/lookups/states${stateQuery.size ? `?${stateQuery.toString()}` : ""}`,
          { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
        ),
        fetch(
          `/api/lookups/cities${cityQuery.size ? `?${cityQuery.toString()}` : ""}`,
          { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
        ),
      ] as const;

      const [baseLookups, responses] = await Promise.all([
        loadBaseLookups(),
        Promise.allSettled(requests),
      ]);
      const payloads = await Promise.all(
        responses.map(async (result) => {
          if (result.status === "rejected" || !result.value.ok) {
            return null;
          }

          return result.value.json();
        }),
      );

      if (ignore) {
        return;
      }

      setLookups({
        ...baseLookups,
        states: normalizeLookupList(payloads[0]),
        cities: normalizeLookupList(payloads[1]),
      });
      setIsLoading(false);
    }

    void load().catch(() => {
      if (!ignore) {
        setIsLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [filters?.countryId, filters?.enabled, filters?.stateProvinceId]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const stateOptions = useMemo(() => {
    if (!filters?.countryId) {
      return lookups.states;
    }

    return lookups.states.filter(
      (stateOption) => stateOption.countryId === filters.countryId,
    );
  }, [filters?.countryId, lookups.states]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const cityOptions = useMemo(() => {
    return lookups.cities.filter((cityOption) => {
      if (
        filters?.stateProvinceId &&
        cityOption.stateProvinceId !== filters.stateProvinceId
      ) {
        return false;
      }

      if (filters?.countryId && cityOption.countryId !== filters.countryId) {
        return false;
      }

      return true;
    });
  }, [filters?.countryId, filters?.stateProvinceId, lookups.cities]);

  return {
    ...lookups,
    states: stateOptions,
    cities: cityOptions,
    isLoading,
  };
}

function loadBaseLookups() {
  if (baseLookupsCache && baseLookupsCache.expiresAt > Date.now()) {
    return Promise.resolve(baseLookupsCache.value);
  }

  if (!baseLookupsInFlight) {
    baseLookupsInFlight = Promise.all([
      fetchLookup("/api/lookups/countries"),
      fetchLookup("/api/lookups/document-types"),
      fetchLookup("/api/lookups/document-categories"),
      fetchLookup("/api/lookups/relation-types"),
      fetchLookup("/api/departments?isActive=true"),
      fetchLookup("/api/designations?isActive=true"),
      fetchLookup("/api/employee-levels?isActive=true"),
      fetchLookup("/api/locations?isActive=true"),
      fetchLookup("/api/work-schedules?isActive=true"),
    ])
      .then(
        ([
          countries,
          documentTypes,
          documentCategories,
          relationTypes,
          departments,
          designations,
          employeeLevels,
          locations,
          workSchedules,
        ]) => {
          const value = {
            countries,
            documentTypes,
            documentCategories,
            relationTypes,
            departments,
            designations,
            employeeLevels,
            locations,
            workSchedules,
          };
          baseLookupsCache = {
            value,
            expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS,
          };
          return value;
        },
      )
      .finally(() => {
        baseLookupsInFlight = null;
      });
  }

  return baseLookupsInFlight;
}

async function fetchLookup(url: string) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) {
      return [];
    }

    return normalizeLookupList(await response.json());
  } catch {
    return [];
  }
}

function normalizeLookupList(payload: unknown): LookupOption[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    const normalizedItems: LookupOption[] = [];
    const seen = new Set<string>();

    for (const item of payload) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : null;
      const name = typeof record.name === "string" ? record.name : null;

      if (!id || !name) {
        continue;
      }

      const key = typeof record.key === "string" ? record.key : null;
      const code = typeof record.code === "string" ? record.code : null;
      const countryId =
        typeof record.countryId === "string" ? record.countryId : null;
      const stateProvinceId =
        typeof record.stateProvinceId === "string"
          ? record.stateProvinceId
          : null;
      const dedupeKey = [
        countryId,
        stateProvinceId,
        key?.trim().toLowerCase(),
        code?.trim().toLowerCase(),
        name.trim().toLowerCase(),
      ]
        .filter(Boolean)
        .join(":");

      if (seen.has(id) || (dedupeKey && seen.has(dedupeKey))) {
        continue;
      }

      seen.add(id);
      if (dedupeKey) {
        seen.add(dedupeKey);
      }

      normalizedItems.push({
        id,
        name,
        key,
        code,
        countryId,
        stateProvinceId,
      });
    }

    return normalizedItems;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "items" in payload &&
    Array.isArray((payload as { items?: unknown[] }).items)
  ) {
    return normalizeLookupList((payload as { items: unknown[] }).items);
  }

  return [];
}
