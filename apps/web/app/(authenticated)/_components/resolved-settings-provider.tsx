"use client";

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TenantResolvedSettingsResponse } from "../settings/types";
import { setDefaultFormattingContext } from "@/lib/formatting-context";
import {
  tenantSettingsChangedEvent,
  type TenantSettingsChangedDetail,
} from "@/lib/settings-events";
import { useTenantSettings } from "@/app/components/settings/tenant-settings-provider";
import { resolveTenantBranding } from "@/lib/branding";

export type ResolvedSettingsContextValue = {
  timezone: string;
  locale: string;
  currency: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: string;
  firstDayOfWeek: string;
  uiDensity: string;
  themeMode: string;
  defaultDashboardView: string;
  defaultLandingModule: string;
  defaultRecordsPerPage: number;
  enableStickyFilters: boolean;
  language: string;
  autoLogoutMinutes: number;
  showHelpTips: boolean;
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

export function SystemPreferencesProvider({
  children,
  initialResolvedSettings,
}: PropsWithChildren<{
  initialResolvedSettings: TenantResolvedSettingsResponse | null;
}>) {
  const { updatePublicSettings } = useTenantSettings();
  const [apiContext, setApiContext] = useState<ApiResolvedContext | null>(null);
  const [resolvedSettings, setResolvedSettings] = useState(
    initialResolvedSettings,
  );

  const refresh = useCallback(async () => {
    const [contextResponse, settingsResponse] = await Promise.all([
      fetch("/api/settings/resolved-context", { credentials: "include" }),
      fetch("/api/tenant-settings/resolved", { credentials: "include" }),
    ]);

    if (contextResponse.ok) {
      setApiContext((await contextResponse.json()) as ApiResolvedContext);
    }
    if (settingsResponse.ok) {
      setResolvedSettings(
        (await settingsResponse.json()) as TenantResolvedSettingsResponse,
      );
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<TenantSettingsChangedDetail>).detail;
      if (
        !detail?.categories?.length ||
        detail.categories.some((category) =>
          ["system", "organization", "branding"].includes(category),
        )
      ) {
        void refresh();
      }
    };

    window.addEventListener(tenantSettingsChangedEvent, handleSettingsChanged);
    return () =>
      window.removeEventListener(
        tenantSettingsChangedEvent,
        handleSettingsChanged,
      );
  }, [refresh]);

  const value = useMemo<ResolvedSettingsContextValue>(() => {
    const system = resolvedSettings?.system;
    const organization = resolvedSettings?.organization;

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
      uiDensity: system?.uiDensity ?? "comfortable",
      themeMode:
        resolvedSettings?.branding.defaultThemeMode ??
        system?.defaultThemeMode ??
        "light",
      defaultDashboardView: system?.defaultDashboardView ?? "admin",
      defaultLandingModule: system?.defaultLandingModule ?? "overview",
      defaultRecordsPerPage: system?.defaultRecordsPerPage ?? 25,
      enableStickyFilters: system?.enableStickyFilters ?? true,
      language: system?.defaultLanguage ?? "en",
      autoLogoutMinutes: system?.autoLogoutMinutes ?? 15,
      showHelpTips: system?.showHelpTips ?? true,
      holidayCalendarId: apiContext?.holidayCalendarId ?? null,
      workScheduleId: apiContext?.workScheduleId ?? null,
      payrollRegion: apiContext?.payrollRegion ?? null,
      timesheetPolicy: apiContext?.timesheetPolicy ?? null,
      raw: resolvedSettings,
      refresh,
    };
  }, [apiContext, refresh, resolvedSettings]);

  useEffect(() => {
    setDefaultFormattingContext(value);
    return () => setDefaultFormattingContext(null);
  }, [value]);

  useEffect(() => {
    if (resolvedSettings?.branding) {
      updatePublicSettings({
        ...resolveTenantBranding({
          ...resolvedSettings.branding,
          tenantName: resolvedSettings.organization.companyDisplayName,
        }),
        tenantName: resolvedSettings.organization.companyDisplayName,
      });
    }
  }, [
    resolvedSettings?.branding,
    resolvedSettings?.organization.companyDisplayName,
    updatePublicSettings,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    const direction = /^(ar|fa|he|ur)(-|$)/i.test(value.language)
      ? "rtl"
      : "ltr";
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const configuredTheme = value.themeMode.toLowerCase();
      const effectiveTheme =
        configuredTheme === "system"
          ? systemTheme.matches
            ? "dark"
            : "light"
          : configuredTheme;

      root.dataset.theme = effectiveTheme;
      root.style.colorScheme = effectiveTheme === "dark" ? "dark" : "light";
    };

    root.dataset.density = value.uiDensity.toLowerCase();
    root.lang = value.language;
    root.dir = direction;
    applyTheme();
    systemTheme.addEventListener("change", applyTheme);
    return () => systemTheme.removeEventListener("change", applyTheme);
  }, [value.language, value.themeMode, value.uiDensity]);

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

export const ResolvedSettingsProvider = SystemPreferencesProvider;

export function useSystemPreferences() {
  return useResolvedSettings();
}

export function useOptionalSystemPreferences() {
  return useContext(ResolvedSettingsContext);
}
