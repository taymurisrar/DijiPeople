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
>;

let baseLookupsInFlight: Promise<BaseLookups> | null = null;

export function useEmployeeLookups(filters?: {
  countryId?: string;
  stateProvinceId?: string;
}) {
  const [lookups, setLookups] = useState<EmployeeLookups>(emptyLookups);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function load() {
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
        ),
        fetch(
          `/api/lookups/cities${cityQuery.size ? `?${cityQuery.toString()}` : ""}`,
        ),
      ] as const;

      const [baseLookups, responses] = await Promise.all([
        loadBaseLookups(),
        Promise.all(requests),
      ]);
      const payloads = await Promise.all(
        responses.map(async (response) => {
          if (!response.ok) {
            return null;
          }

          return response.json();
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

    void load();

    return () => {
      ignore = true;
    };
  }, [filters?.countryId, filters?.stateProvinceId]);

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
        ]) => ({
          countries,
          documentTypes,
          documentCategories,
          relationTypes,
          departments,
          designations,
          employeeLevels,
          locations,
        }),
      )
      .finally(() => {
        baseLookupsInFlight = null;
      });
  }

  return baseLookupsInFlight;
}

async function fetchLookup(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  return normalizeLookupList(await response.json());
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
