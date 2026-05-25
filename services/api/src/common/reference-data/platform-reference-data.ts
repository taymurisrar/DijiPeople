export const PLATFORM_COUNTRIES = [
  { code: 'QA', name: 'Qatar' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'OM', name: 'Oman' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
] as const;

export const PLATFORM_CURRENCIES = [
  { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'BHD', name: 'Bahraini Dinar' },
  { code: 'KWD', name: 'Kuwaiti Dinar' },
  { code: 'OMR', name: 'Omani Rial' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'GBP', name: 'Pound Sterling' },
] as const;

export const PLATFORM_TIMEZONES = [
  'Asia/Qatar',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Bahrain',
  'Asia/Kuwait',
  'Asia/Muscat',
  'UTC',
  'Europe/London',
  'America/New_York',
] as const;

export const PLATFORM_DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD MMM YYYY', label: 'DD MMM YYYY' },
] as const;

export const PLATFORM_TIME_FORMATS = [
  { value: '12-hour', label: '12-hour' },
  { value: '24-hour', label: '24-hour' },
] as const;

export const PLATFORM_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ar-QA', label: 'Arabic (Qatar)' },
  { code: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
] as const;

export const DEFAULT_PLATFORM_DEFAULTS = {
  country: 'QA',
  currency: 'QAR',
  timezone: 'Asia/Qatar',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12-hour',
  locale: 'en-US',
} as const;

export function validatePlatformDefaults(value: Record<string, unknown>) {
  assertIncluded(
    'country',
    value.country,
    PLATFORM_COUNTRIES.map((item) => item.code),
  );
  assertIncluded(
    'currency',
    value.currency,
    PLATFORM_CURRENCIES.map((item) => item.code),
  );
  assertIncluded('timezone', value.timezone, [...PLATFORM_TIMEZONES]);
  assertIncluded(
    'dateFormat',
    value.dateFormat,
    PLATFORM_DATE_FORMATS.map((item) => item.value),
  );
  assertIncluded(
    'timeFormat',
    value.timeFormat,
    PLATFORM_TIME_FORMATS.map((item) => item.value),
  );
  assertIncluded(
    'locale',
    value.locale,
    PLATFORM_LOCALES.map((item) => item.code),
  );
}

function assertIncluded(field: string, value: unknown, allowed: string[]) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`Invalid platform default: ${field}.`);
  }
}
