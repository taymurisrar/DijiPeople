export type ResolvedFormattingContext = {
  timezone?: string | null;
  currency?: string | null;
  locale?: string | null;
  dateFormat?: string | null;
  timeFormat?: "12h" | "24h" | string | null;
  numberFormat?: string | null;
};

const DEFAULT_CONTEXT: {
  timezone: string;
  currency: string;
  locale: string;
} = {
  timezone: "UTC",
  currency: "USD",
  locale: "en-US",
};

export function formatDateTime(
  value: string | Date | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const date = toDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(resolveLocale(context), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: resolveTimezone(context),
    hour12: resolveHour12(context),
  }).format(date);
}

export function formatDate(
  value: string | Date | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const date = toDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(resolveLocale(context), {
    dateStyle: "medium",
    timeZone: resolveTimezone(context),
  }).format(date);
}

export function formatTime(
  value: string | Date | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const date = toDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(resolveLocale(context), {
    timeStyle: "short",
    timeZone: resolveTimezone(context),
    hour12: resolveHour12(context),
  }).format(date);
}

export function formatMoney(
  amount: number | string | null | undefined,
  currencyCode?: string | null,
  context?: ResolvedFormattingContext | null,
) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "";

  return new Intl.NumberFormat(resolveLocale(context), {
    style: "currency",
    currency: normalizeCurrency(currencyCode || context?.currency),
  }).format(numericAmount);
}

export function formatNumber(
  value: number | string | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "";

  return new Intl.NumberFormat(
    context?.numberFormat || resolveLocale(context),
  ).format(numericValue);
}

export function formatTimezoneLabel(timezone?: string | null) {
  if (!timezone) return "UTC";
  try {
    const now = new Date();
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;

    return offset ? `${timezone} (${offset})` : timezone;
  } catch {
    return timezone;
  }
}

export function formatWorkHours(
  hours: number | string | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const numericHours = Number(hours);
  if (!Number.isFinite(numericHours)) return "";
  return `${formatNumber(Number(numericHours.toFixed(2)), context)} h`;
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveLocale(context?: ResolvedFormattingContext | null) {
  return context?.locale || DEFAULT_CONTEXT.locale;
}

function resolveTimezone(context?: ResolvedFormattingContext | null) {
  return context?.timezone || DEFAULT_CONTEXT.timezone;
}

function resolveHour12(context?: ResolvedFormattingContext | null) {
  if (context?.timeFormat === "24h") return false;
  if (context?.timeFormat === "12h") return true;
  return undefined;
}

function normalizeCurrency(currencyCode?: string | null) {
  return /^[A-Z]{3}$/.test(currencyCode || "")
    ? currencyCode!
    : DEFAULT_CONTEXT.currency;
}
