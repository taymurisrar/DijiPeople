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
        fetch("/api/lookups/countries"),
        fetch(
          `/api/lookups/states${stateQuery.size ? `?${stateQuery.toString()}` : ""}`,
        ),
        fetch(
          `/api/lookups/cities${cityQuery.size ? `?${cityQuery.toString()}` : ""}`,
        ),
        fetch("/api/lookups/document-types"),
        fetch("/api/lookups/document-categories"),
        fetch("/api/lookups/relation-types"),
        fetch("/api/departments"),
        fetch("/api/designations"),
        fetch("/api/employee-levels?isActive=true"),
        fetch("/api/locations"),
      ] as const;

      const responses = await Promise.all(requests);
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
        countries: normalizeLookupList(payloads[0]),
        states: normalizeLookupList(payloads[1]),
        cities: normalizeLookupList(payloads[2]),
        documentTypes: normalizeLookupList(payloads[3]),
        documentCategories: normalizeLookupList(payloads[4]),
        relationTypes: normalizeLookupList(payloads[5]),
        departments: normalizeLookupList(payloads[6]),
        designations: normalizeLookupList(payloads[7]),
        employeeLevels: normalizeLookupList(payloads[8]),
        locations: normalizeLookupList(payloads[9]),
      });
      setIsLoading(false);
    }

    void load();

    return () => {
      ignore = true;
    };
  }, [filters?.countryId, filters?.stateProvinceId]);

  const stateOptions = useMemo(() => {
    if (!filters?.countryId) {
      return lookups.states;
    }

    return lookups.states.filter(
      (stateOption) => stateOption.countryId === filters.countryId,
    );
  }, [filters?.countryId, lookups.states]);

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

function normalizeLookupList(payload: unknown): LookupOption[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    const normalizedItems: LookupOption[] = [];

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

      normalizedItems.push({
        id,
        name,
        key: typeof record.key === "string" ? record.key : null,
        code: typeof record.code === "string" ? record.code : null,
        countryId:
          typeof record.countryId === "string" ? record.countryId : null,
        stateProvinceId:
          typeof record.stateProvinceId === "string"
            ? record.stateProvinceId
            : null,
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
