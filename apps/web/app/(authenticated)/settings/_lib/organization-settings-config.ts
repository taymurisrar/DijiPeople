// app/settings/_lib/organization-settings-config.ts
import type { SettingsSectionConfig } from "./settings-section-types";
import {
  COMPANY_SIZE_OPTIONS,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
} from "./settings-options";

export const organizationSettingsSections: SettingsSectionConfig[] = [
  {
    title: "Company Profile",
    description:
      "Keep the tenant's core business identity aligned across employee records, communication, payroll, and workspace branding.",
    fields: [
      {
        category: "tenant",
        key: "tenantSlug",
        label: "Tenant slug",
        type: "text",
        required: true,
      },
      {
        category: "organization",
        key: "companyDisplayName",
        label: "Company display name",
        type: "text",
        required: true,
      },
      {
        category: "organization",
        key: "legalBusinessName",
        label: "Legal business name",
        type: "text",
      },
      {
        category: "organization",
        key: "industry",
        label: "Industry",
        type: "select",
        options: [
          { label: "Information Technology", value: "INFORMATION_TECHNOLOGY" },
          { label: "Software / SaaS", value: "SOFTWARE_SAAS" },
          { label: "Healthcare", value: "HEALTHCARE" },
          { label: "Banking & Finance", value: "BANKING_FINANCE" },
          { label: "Real Estate", value: "REAL_ESTATE" },
          { label: "Recruitment & Staffing", value: "RECRUITMENT_STAFFING" },
          { label: "Education", value: "EDUCATION" },
          { label: "Retail", value: "RETAIL" },
          { label: "Manufacturing", value: "MANUFACTURING" },
          { label: "Other", value: "OTHER" },
        ],
      },
      {
        category: "organization",
        key: "businessEmail",
        label: "Business email",
        type: "email",
      },
      {
        category: "organization",
        key: "businessPhone",
        label: "Business phone",
        type: "phone",
      },
      {
        category: "organization",
        key: "websiteUrl",
        label: "Company website",
        type: "url",
      },
    ],
  },
  {
    title: "Regional Preferences",
    description:
      "Control the default tenant-wide timezone, locale, currency, and display format behavior.",
    fields: [
      {
        category: "organization",
        key: "timezone",
        label: "Default timezone",
        type: "lookup",
        lookupKey: "timezones",
        placeholder: "Select a timezone",
      },
      {
        category: "organization",
        key: "currency",
        label: "Default currency",
        type: "lookup",
        lookupKey: "currencies",
        placeholder: "Select a currency",
      },
      {
        category: "organization",
        key: "country",
        label: "Default country",
        type: "lookup",
        lookupKey: "countries",
        placeholder: "Select a country",
      },
      {
        category: "organization",
        key: "dateFormat",
        label: "Date format",
        type: "select",
        options: DATE_FORMAT_OPTIONS,
      },
      {
        category: "organization",
        key: "timeFormat",
        label: "Time format",
        type: "select",
        options: TIME_FORMAT_OPTIONS,
      },
      /*
       * BUG-1976 pair 8 — "Week start day" was removed here rather than
       * repointed at `organization.weekStartsOn`.
       *
       * The precedence is decided: `system.defaultWeekStartDay` wins. Both
       * `ConfigurationResolverService.resolveAppContext` and the web
       * `ResolvedSettingsProvider` fall back to `organization.weekStartsOn`
       * only when the system value is absent, and the system value resolves
       * through a validated enum with a `MONDAY` default, so it never is.
       * Offering a second control that could never take effect is the defect;
       * the working control lives on Settings > System.
       */
      {
        category: "organization",
        key: "companySize",
        label: "Company size",
        type: "select",
        options: COMPANY_SIZE_OPTIONS,
      },
    ],
  },
];
