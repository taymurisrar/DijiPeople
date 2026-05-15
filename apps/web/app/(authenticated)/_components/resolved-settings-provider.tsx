"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TenantResolvedSettingsResponse } from "../settings/types";

export type ResolvedSettingsContextValue = {
  timezone: string;
  locale: string;
  currency: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: string;
  firstDayOfWeek: string;
  holidayCalendarId: string | null;
  workScheduleId: string | null;
  payrollRegion: unknown;
  timesheetPolicy: unknown;
  raw: TenantResolvedSettingsResponse | null;
  refresh: () => Promise<void>;
};

type ApiResolvedContext = {
  timezone?: string | null;
  locale?: string | null;
  currency?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  numberFormat?: string | null;
  firstDayOfWeek?: string | null;
  holidayCalendarId?: string | null;
  workScheduleId?: string | null;
  payrollRegion?: unknown;
  timesheetPolicy?: unknown;
};

const ResolvedSettingsContext =
  createContext<ResolvedSettingsContextValue | null>(null);

export function ResolvedSettingsProvider({
  children,
  initialResolvedSettings,
}: PropsWithChildren<{
  initialResolvedSettings: TenantResolvedSettingsResponse | null;
}>) {
  const [apiContext, setApiContext] = useState<ApiResolvedContext | null>(null);

  const refresh = async () => {
    const response = await fetch("/api/settings/resolved-context", {
      credentials: "include",
    });
    if (!response.ok) return;
    setApiContext((await response.json()) as ApiResolvedContext);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<ResolvedSettingsContextValue>(() => {
    const system = initialResolvedSettings?.system;
    const organization = initialResolvedSettings?.organization;
    return {
      timezone:
        apiContext?.timezone ??
        system?.defaultTimezone ??
        organization?.timezone ??
        "UTC",
      locale: apiContext?.locale ?? system?.locale ?? "en-US",
      currency:
        apiContext?.currency ??
        system?.defaultCurrency ??
        organization?.currency ??
        "USD",
      dateFormat:
        apiContext?.dateFormat ??
        system?.dateFormat ??
        organization?.dateFormat ??
        "MMM d, yyyy",
      timeFormat: apiContext?.timeFormat ?? system?.timeFormat ?? "24h",
      numberFormat: apiContext?.numberFormat ?? system?.locale ?? "en-US",
      firstDayOfWeek:
        apiContext?.firstDayOfWeek ??
        system?.defaultWeekStartDay ??
        organization?.weekStartsOn ??
        "MONDAY",
      holidayCalendarId: apiContext?.holidayCalendarId ?? null,
      workScheduleId: apiContext?.workScheduleId ?? null,
      payrollRegion: apiContext?.payrollRegion ?? null,
      timesheetPolicy: apiContext?.timesheetPolicy ?? null,
      raw: initialResolvedSettings,
      refresh,
    };
  }, [apiContext, initialResolvedSettings]);

  return (
    <ResolvedSettingsContext.Provider value={value}>
      {children}
    </ResolvedSettingsContext.Provider>
  );
}

export function useResolvedSettings() {
  const value = useContext(ResolvedSettingsContext);
  if (!value) {
    throw new Error(
      "useResolvedSettings must be used inside ResolvedSettingsProvider.",
    );
  }
  return value;
}
