// app/dashboard/settings/_lib/settings-options.ts
import type { SettingsOption } from "./settings-section-types";

export const DATE_FORMAT_OPTIONS: SettingsOption[] = [
  { label: "MM/dd/yyyy", value: "MM/dd/yyyy" },
  { label: "dd/MM/yyyy", value: "dd/MM/yyyy" },
  { label: "yyyy-MM-dd", value: "yyyy-MM-dd" },
  { label: "dd-MMM-yyyy", value: "dd-MMM-yyyy" },
];

export const TIME_FORMAT_OPTIONS: SettingsOption[] = [
  { label: "12 hour", value: "12h" },
  { label: "24 hour", value: "24h" },
];

export const WEEK_START_DAY_OPTIONS: SettingsOption[] = [
  { label: "Sunday", value: "SUNDAY" },
  { label: "Monday", value: "MONDAY" },
  { label: "Saturday", value: "SATURDAY" },
];

export const COMPANY_SIZE_OPTIONS: SettingsOption[] = [
  { label: "1 - 10", value: "SIZE_1_10" },
  { label: "11 - 50", value: "SIZE_11_50" },
  { label: "51 - 200", value: "SIZE_51_200" },
  { label: "201 - 500", value: "SIZE_201_500" },
  { label: "501 - 1000", value: "SIZE_501_1000" },
  { label: "1000+", value: "SIZE_1000_PLUS" },
];