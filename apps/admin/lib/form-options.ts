export const SUPPORTED_CURRENCIES = [
  "USD",
  "SAR",
  "AED",
  "EUR",
  "GBP",
] as const;

export const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
] as const;

export const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
] as const;

export const TIMEZONE_OPTIONS = Intl.supportedValuesOf("timeZone").map((value) => ({
  value,
  label: value.replaceAll("_", " "),
}));
