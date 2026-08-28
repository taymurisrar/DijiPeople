import { toCanonicalEnumValue } from "@/lib/domain";

const fallbackNumberFormatter = new Intl.NumberFormat("en-US");

export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0";
  }

  if (!options) {
    return fallbackNumberFormatter.format(value);
  }

  return new Intl.NumberFormat("en-US", options).format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  currency: string,
): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/*
 * The Unix epoch is not a date anybody meant.
 *
 * Contract dates with no value rendered as `Jan 1, 1970` — two of seven
 * contracts on production showed it — because the absent value arrives as an
 * epoch-zero timestamp rather than as null, so the `!value` guard below never
 * saw it. A screen presenting a date that looks real and is not is worse than
 * one presenting no date (BUG-1556).
 *
 * Exactly zero, not "before some cutoff". A business date of
 * 1970-01-01T00:00:00.000Z to the millisecond is the sentinel; 1970 dates that
 * are not exactly midnight UTC are somebody's real data and are left alone.
 */
function isEpochSentinel(date: Date): boolean {
  return date.getTime() === 0;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "Not available";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  if (isEpochSentinel(date)) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "Not available";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  if (isEpochSentinel(date)) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatEnumLabel(
  value: string | null | undefined,
  overrides?: Record<string, string>,
): string {
  if (!value) return "Not specified";

  const canonical = toCanonicalEnumValue(value);

  if (overrides?.[canonical]) {
    return overrides[canonical];
  }

  return canonical
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatBillingCycle(value: string | null | undefined): string {
  return formatEnumLabel(value, {
    MONTHLY: "Monthly",
    ANNUAL: "Annual",
  });
}

export function formatFeatureName(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
