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

let runtimeDefaultContext: ResolvedFormattingContext = {};

export function setDefaultFormattingContext(
  context: ResolvedFormattingContext | null | undefined,
) {
  runtimeDefaultContext = context ? { ...context } : {};
}

export function formatDateTime(
  value: string | Date | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const date = toDate(value);
  if (!date) return "";

  const datePart = formatConfiguredDate(date, context);
  const timePart = formatConfiguredTime(date, context);
  return `${datePart}, ${timePart}`;
}

export function formatDate(
  value: string | Date | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const date = toDate(value);
  if (!date) return "";

  return formatConfiguredDate(date, context);
}

export function formatTime(
  value: string | Date | null | undefined,
  context?: ResolvedFormattingContext | null,
) {
  const date = toDate(value);
  if (!date) return "";

  return formatConfiguredTime(date, context);
}

function formatConfiguredTime(
  date: Date,
  context?: ResolvedFormattingContext | null,
) {
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
    context?.numberFormat ||
      runtimeDefaultContext.numberFormat ||
      resolveLocale(context),
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
  return (
    context?.locale || runtimeDefaultContext.locale || DEFAULT_CONTEXT.locale
  );
}

function resolveTimezone(context?: ResolvedFormattingContext | null) {
  return (
    context?.timezone ||
    runtimeDefaultContext.timezone ||
    DEFAULT_CONTEXT.timezone
  );
}

function resolveHour12(context?: ResolvedFormattingContext | null) {
  const timeFormat = context?.timeFormat ?? runtimeDefaultContext.timeFormat;
  if (timeFormat === "24h") return false;
  if (timeFormat === "12h") return true;
  return undefined;
}

function normalizeCurrency(currencyCode?: string | null) {
  const resolvedCurrency =
    currencyCode || runtimeDefaultContext.currency || DEFAULT_CONTEXT.currency;
  return /^[A-Z]{3}$/.test(resolvedCurrency)
    ? resolvedCurrency
    : DEFAULT_CONTEXT.currency;
}

function formatConfiguredDate(
  date: Date,
  context?: ResolvedFormattingContext | null,
): string {
  const format = context?.dateFormat ?? runtimeDefaultContext.dateFormat;
  if (!format) {
    return new Intl.DateTimeFormat(resolveLocale(context), {
      dateStyle: "medium",
      timeZone: resolveTimezone(context),
    }).format(date);
  }

  const parts = new Intl.DateTimeFormat(resolveLocale(context), {
    day: "2-digit",
    month: format === "dd-MMM-yyyy" ? "short" : "2-digit",
    year: "numeric",
    timeZone: resolveTimezone(context),
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const day = values.day ?? "";
  const month = values.month ?? "";
  const year = values.year ?? "";

  switch (format) {
    case "MM/dd/yyyy":
      return `${month}/${day}/${year}`;
    case "dd/MM/yyyy":
      return `${day}/${month}/${year}`;
    case "yyyy-MM-dd":
      return `${year}-${month}-${day}`;
    case "dd-MMM-yyyy":
      return `${day}-${month}-${year}`;
    default:
      return new Intl.DateTimeFormat(resolveLocale(context), {
        dateStyle: "medium",
        timeZone: resolveTimezone(context),
      }).format(date);
  }
}
