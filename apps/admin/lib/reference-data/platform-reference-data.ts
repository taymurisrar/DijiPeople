export type PlatformOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

export type PlatformCountry = {
  code: string;
  name: string;
  region: string;
};

export type PlatformCurrency = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
};

export const PLATFORM_COUNTRIES = [
  { code: "QA", name: "Qatar", region: "Middle East" },
  { code: "SA", name: "Saudi Arabia", region: "Middle East" },
  { code: "AE", name: "United Arab Emirates", region: "Middle East" },
  { code: "BH", name: "Bahrain", region: "Middle East" },
  { code: "KW", name: "Kuwait", region: "Middle East" },
  { code: "OM", name: "Oman", region: "Middle East" },
  { code: "PK", name: "Pakistan", region: "Asia" },
  { code: "IN", name: "India", region: "Asia" },
  { code: "BD", name: "Bangladesh", region: "Asia" },
  { code: "LK", name: "Sri Lanka", region: "Asia" },
  { code: "NP", name: "Nepal", region: "Asia" },
  { code: "PH", name: "Philippines", region: "Asia" },
  { code: "MY", name: "Malaysia", region: "Asia" },
  { code: "SG", name: "Singapore", region: "Asia" },
  { code: "CN", name: "China", region: "Asia" },
  { code: "JP", name: "Japan", region: "Asia" },
  { code: "KR", name: "South Korea", region: "Asia" },
  { code: "TR", name: "Türkiye", region: "Europe / Asia" },
  { code: "EG", name: "Egypt", region: "Africa" },
  { code: "ZA", name: "South Africa", region: "Africa" },
  { code: "NG", name: "Nigeria", region: "Africa" },
  { code: "KE", name: "Kenya", region: "Africa" },
  { code: "GB", name: "United Kingdom", region: "Europe" },
  { code: "IE", name: "Ireland", region: "Europe" },
  { code: "FR", name: "France", region: "Europe" },
  { code: "DE", name: "Germany", region: "Europe" },
  { code: "IT", name: "Italy", region: "Europe" },
  { code: "ES", name: "Spain", region: "Europe" },
  { code: "NL", name: "Netherlands", region: "Europe" },
  { code: "SE", name: "Sweden", region: "Europe" },
  { code: "NO", name: "Norway", region: "Europe" },
  { code: "DK", name: "Denmark", region: "Europe" },
  { code: "CH", name: "Switzerland", region: "Europe" },
  { code: "US", name: "United States", region: "North America" },
  { code: "CA", name: "Canada", region: "North America" },
  { code: "MX", name: "Mexico", region: "North America" },
  { code: "BR", name: "Brazil", region: "South America" },
  { code: "AR", name: "Argentina", region: "South America" },
  { code: "AU", name: "Australia", region: "Oceania" },
  { code: "NZ", name: "New Zealand", region: "Oceania" },
] as const satisfies readonly PlatformCountry[];

export const PLATFORM_CURRENCIES = [
  { code: "QAR", name: "Qatari Riyal", symbol: "ر.ق", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "ر.س", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2 },
  { code: "BHD", name: "Bahraini Dinar", symbol: ".د.ب", decimals: 3 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك", decimals: 3 },
  { code: "OMR", name: "Omani Rial", symbol: "ر.ع.", decimals: 3 },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "GBP", name: "Pound Sterling", symbol: "£", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", decimals: 2 },
  { code: "NPR", name: "Nepalese Rupee", symbol: "रू", decimals: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "$", decimals: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "ARS", name: "Argentine Peso", symbol: "$", decimals: 2 },
] as const satisfies readonly PlatformCurrency[];

export const PLATFORM_TIMEZONES = [
  "UTC",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Bahrain",
  "Asia/Kuwait",
  "Asia/Muscat",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Asia/Kathmandu",
  "Asia/Manila",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Zurich",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
] as const;

export const PLATFORM_DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "DD MMM YYYY", label: "DD MMM YYYY" },
  { value: "MMM DD, YYYY", label: "MMM DD, YYYY" },
  { value: "DD MMMM YYYY", label: "DD MMMM YYYY" },
] as const satisfies readonly PlatformOption[];

export const PLATFORM_TIME_FORMATS = [
  { value: "12-hour", label: "12-hour" },
  { value: "24-hour", label: "24-hour" },
] as const satisfies readonly PlatformOption[];

export const PLATFORM_LOCALES = [
  { code: "en", label: "English" },
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-QA", label: "English (Qatar)" },
  { code: "ar", label: "Arabic" },
  { code: "ar-QA", label: "Arabic (Qatar)" },
  { code: "ar-SA", label: "Arabic (Saudi Arabia)" },
  { code: "ar-AE", label: "Arabic (United Arab Emirates)" },
  { code: "ur", label: "Urdu" },
  { code: "ur-PK", label: "Urdu (Pakistan)" },
  { code: "hi-IN", label: "Hindi (India)" },
  { code: "bn-BD", label: "Bangla (Bangladesh)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "de-DE", label: "German (Germany)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "it-IT", label: "Italian (Italy)" },
  { code: "nl-NL", label: "Dutch (Netherlands)" },
  { code: "tr-TR", label: "Turkish (Türkiye)" },
  { code: "zh-CN", label: "Chinese (Simplified, China)" },
  { code: "ja-JP", label: "Japanese (Japan)" },
  { code: "ko-KR", label: "Korean (South Korea)" },
] as const;

export const DEFAULT_PLATFORM_DEFAULTS = {
  country: "QA",
  currency: "QAR",
  reportingCurrency: "QAR",
  timezone: "Asia/Qatar",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "12-hour",
  locale: "en-US",
} as const;

export type PlatformCountryCode = (typeof PLATFORM_COUNTRIES)[number]["code"];
export type PlatformCurrencyCode = (typeof PLATFORM_CURRENCIES)[number]["code"];
export type PlatformTimezone = (typeof PLATFORM_TIMEZONES)[number];
export type PlatformDateFormat = (typeof PLATFORM_DATE_FORMATS)[number]["value"];
export type PlatformTimeFormat = (typeof PLATFORM_TIME_FORMATS)[number]["value"];
export type PlatformLocale = (typeof PLATFORM_LOCALES)[number]["code"];

export type PlatformDefaults = {
  country: PlatformCountryCode;
  currency: PlatformCurrencyCode;
  reportingCurrency: PlatformCurrencyCode;
  timezone: PlatformTimezone;
  dateFormat: PlatformDateFormat;
  timeFormat: PlatformTimeFormat;
  locale: PlatformLocale;
};

export const PLATFORM_COUNTRY_OPTIONS = PLATFORM_COUNTRIES.map((country) => ({
  value: country.code,
  label: `${country.name} (${country.code})`,
  description: country.region,
})) satisfies PlatformOption<PlatformCountryCode>[];

export const PLATFORM_CURRENCY_OPTIONS = PLATFORM_CURRENCIES.map((currency) => ({
  value: currency.code,
  label: `${currency.code} - ${currency.name}`,
description: `${currency.symbol} · ${currency.decimals} decimal places`,
})) satisfies PlatformOption<PlatformCurrencyCode>[];

export const PLATFORM_TIMEZONE_OPTIONS = PLATFORM_TIMEZONES.map((timezone) => ({
  value: timezone,
  label: timezone,
})) satisfies PlatformOption<PlatformTimezone>[];

export const PLATFORM_LOCALE_OPTIONS = PLATFORM_LOCALES.map((locale) => ({
  value: locale.code,
  label: locale.label,
})) satisfies PlatformOption<PlatformLocale>[];

export function isPlatformCountryCode(
  value: string,
): value is PlatformCountryCode {
  return PLATFORM_COUNTRIES.some((country) => country.code === value);
}

export function isPlatformCurrencyCode(
  value: string,
): value is PlatformCurrencyCode {
  return PLATFORM_CURRENCIES.some((currency) => currency.code === value);
}

export function isPlatformTimezone(value: string): value is PlatformTimezone {
  return PLATFORM_TIMEZONES.includes(value as PlatformTimezone);
}

export function isPlatformDateFormat(
  value: string,
): value is PlatformDateFormat {
  return PLATFORM_DATE_FORMATS.some((format) => format.value === value);
}

export function isPlatformTimeFormat(
  value: string,
): value is PlatformTimeFormat {
  return PLATFORM_TIME_FORMATS.some((format) => format.value === value);
}

export function isPlatformLocale(value: string): value is PlatformLocale {
  return PLATFORM_LOCALES.some((locale) => locale.code === value);
}

export function normalizePlatformDefaults(
  defaults?: Partial<Record<keyof PlatformDefaults, string | null>>,
): PlatformDefaults {
  return {
    country:
      defaults?.country && isPlatformCountryCode(defaults.country)
        ? defaults.country
        : DEFAULT_PLATFORM_DEFAULTS.country,

    currency:
      defaults?.currency && isPlatformCurrencyCode(defaults.currency)
        ? defaults.currency
        : DEFAULT_PLATFORM_DEFAULTS.currency,

    reportingCurrency:
      defaults?.reportingCurrency &&
      isPlatformCurrencyCode(defaults.reportingCurrency)
        ? defaults.reportingCurrency
        : defaults?.currency && isPlatformCurrencyCode(defaults.currency)
          ? defaults.currency
          : DEFAULT_PLATFORM_DEFAULTS.reportingCurrency,

    timezone:
      defaults?.timezone && isPlatformTimezone(defaults.timezone)
        ? defaults.timezone
        : DEFAULT_PLATFORM_DEFAULTS.timezone,

    dateFormat:
      defaults?.dateFormat && isPlatformDateFormat(defaults.dateFormat)
        ? defaults.dateFormat
        : DEFAULT_PLATFORM_DEFAULTS.dateFormat,

    timeFormat:
      defaults?.timeFormat && isPlatformTimeFormat(defaults.timeFormat)
        ? defaults.timeFormat
        : DEFAULT_PLATFORM_DEFAULTS.timeFormat,

    locale:
      defaults?.locale && isPlatformLocale(defaults.locale)
        ? defaults.locale
        : DEFAULT_PLATFORM_DEFAULTS.locale,
  };
}

export function getPlatformCurrency(
  code: PlatformCurrencyCode,
): PlatformCurrency {
  return PLATFORM_CURRENCIES.find((currency) => currency.code === code)!;
}

export function getPlatformCountry(code: PlatformCountryCode): PlatformCountry {
  return PLATFORM_COUNTRIES.find((country) => country.code === code)!;
}
