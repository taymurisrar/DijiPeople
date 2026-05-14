import {
  formatDate,
  formatDateTime,
  type ResolvedFormattingContext,
} from "./formatting-context";

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
  return formatDate(value, toFormattingContext(options)) || "Not set";
}

export function formatDateTimeWithTenantSettings(
  value: string | Date | null | undefined,
  options: TenantDateFormatOptions,
) {
  return formatDateTime(value, toFormattingContext(options)) || "Not set";
}

function toFormattingContext(
  options: TenantDateFormatOptions,
): ResolvedFormattingContext {
  return {
    dateFormat: options.dateFormat,
    locale: options.locale,
    timeFormat: options.timeFormat,
    timezone: options.timezone,
  };
}
