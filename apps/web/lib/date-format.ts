type TenantDateFormatOptions = {
  dateFormat?: string;
  locale?: string;
  timeFormat?: string;
  timezone?: string;
};

export function formatDateWithTenantSettings(
  value: string | Date | null | undefined,
  options: TenantDateFormatOptions,
) {
  if (!value) {
    return "Not set";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  const formatter = buildDateFormatter(options);
  return formatter.format(date);
}

export function formatDateTimeWithTenantSettings(
  value: string | Date | null | undefined,
  options: TenantDateFormatOptions,
) {
  if (!value) {
    return "Not set";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  const formatter = buildDateTimeFormatter(options);
  return formatter.format(date);
}

function buildDateFormatter(options: TenantDateFormatOptions) {
  const locale = options.locale || "en-US";
  const timeZone = options.timezone || "UTC";
  const dateFormat = (options.dateFormat || "MM/dd/yyyy").toLowerCase();

  if (dateFormat.includes("yyyy-mm-dd")) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
  }

  if (dateFormat.includes("dd/mm/yyyy")) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone,
    });
  }

  if (dateFormat.includes("dd-mmm-yyyy")) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone,
    });
  }

  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone,
  });
}

function buildDateTimeFormatter(options: TenantDateFormatOptions) {
  const locale = options.locale || "en-US";
  const timeZone = options.timezone || "UTC";
  const hour12 = (options.timeFormat || "12h").toLowerCase() !== "24h";

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12,
    timeZone,
  });
}
