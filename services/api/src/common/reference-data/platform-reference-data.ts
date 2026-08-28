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

/*
 * The currency catalog is `@repo/config`'s, not this file's (BUG-1425).
 *
 * There were two lists. This one knew eight currencies and nothing read it;
 * `apps/admin` offered thirty-five to the operator; and no DTO checked a code
 * against either, because `@IsString() @MaxLength(3)` measures length and calls
 * the result a currency. A partner created through the console carries
 * `currencyCode: "5"`.
 *
 * Re-exported rather than deleted: the name is part of this module's surface,
 * and a caller asking for the platform's currencies should keep getting them.
 */
export {
  PLATFORM_CURRENCIES,
  PLATFORM_CURRENCY_CODES,
  isSupportedCurrencyCode,
  resolvePlatformCurrency,
} from '@repo/config';

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
  reportingCurrency: 'QAR',
  timezone: 'Asia/Qatar',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12-hour',
  locale: 'en-US',
} as const;

export function validatePlatformDefaults(value: Record<string, unknown>) {
  assertCountry(value.country);
  assertCurrency('currency', value.currency);
  assertCurrency('reportingCurrency', value.reportingCurrency);
  assertTimezone(value.timezone);
  assertIncluded('dateFormat', value.dateFormat, [
    ...PLATFORM_DATE_FORMATS.map((item) => item.value),
    'MMM DD, YYYY',
    'DD MMMM YYYY',
  ]);
  assertIncluded(
    'timeFormat',
    value.timeFormat,
    PLATFORM_TIME_FORMATS.map((item) => item.value),
  );
  assertLocale(value.locale);
}

function assertCountry(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) {
    throw new Error('Invalid platform default: country.');
  }
}

function assertCurrency(field: string, value: unknown) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new Error(`Invalid platform default: ${field}.`);
  }

  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: value });
  } catch {
    throw new Error(`Invalid platform default: ${field}.`);
  }
}

function assertTimezone(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('Invalid platform default: timezone.');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
  } catch {
    throw new Error('Invalid platform default: timezone.');
  }
}

function assertLocale(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('Invalid platform default: locale.');
  }
  try {
    new Intl.DateTimeFormat(value);
  } catch {
    throw new Error('Invalid platform default: locale.');
  }
}

function assertIncluded(field: string, value: unknown, allowed: string[]) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`Invalid platform default: ${field}.`);
  }
}
