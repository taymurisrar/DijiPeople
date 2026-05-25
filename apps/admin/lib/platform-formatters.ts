import type { PlatformDefaults } from "@/lib/reference-data/platform-reference-data";
import { DEFAULT_PLATFORM_DEFAULTS } from "@/lib/reference-data/platform-reference-data";

export function formatPlatformDate(
  value: string | Date | null | undefined,
  defaults: Partial<PlatformDefaults> = DEFAULT_PLATFORM_DEFAULTS,
) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(defaults.locale ?? "en-US", {
    dateStyle: dateStyleFor(defaults.dateFormat),
    timeZone: defaults.timezone,
  }).format(new Date(value));
}

export function formatPlatformDateTime(
  value: string | Date | null | undefined,
  defaults: Partial<PlatformDefaults> = DEFAULT_PLATFORM_DEFAULTS,
) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(defaults.locale ?? "en-US", {
    dateStyle: dateStyleFor(defaults.dateFormat),
    timeStyle: "short",
    hour12: defaults.timeFormat !== "24-hour",
    timeZone: defaults.timezone,
  }).format(new Date(value));
}

export function formatPlatformTime(
  value: string | Date | null | undefined,
  defaults: Partial<PlatformDefaults> = DEFAULT_PLATFORM_DEFAULTS,
) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(defaults.locale ?? "en-US", {
    timeStyle: "short",
    hour12: defaults.timeFormat !== "24-hour",
    timeZone: defaults.timezone,
  }).format(new Date(value));
}

export function formatPlatformCurrency(
  value: number,
  defaults: Partial<PlatformDefaults> = DEFAULT_PLATFORM_DEFAULTS,
) {
  return new Intl.NumberFormat(defaults.locale ?? "en-US", {
    style: "currency",
    currency: defaults.currency ?? "QAR",
  }).format(value);
}

function dateStyleFor(dateFormat?: string): "short" | "medium" {
  return dateFormat === "DD MMM YYYY" ? "medium" : "short";
}
