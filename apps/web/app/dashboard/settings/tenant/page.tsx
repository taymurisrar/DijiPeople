import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../_components/config-settings-form";
import { SettingsShell } from "../_components/settings-shell";
import type { SettingsSectionConfig } from "../_components/config-settings-form";
import type { TenantSettingsResponse } from "../types";

const organizationSections: SettingsSectionConfig[] = [
  {
    title: "Company Profile",
    description:
      "Keep the tenant's core business identity aligned across employee records, communication, payroll, and workspace branding.",
    fields: [
      {
        category: "organization",
        key: "companyDisplayName",
        label: "Company display name",
        description: "Primary business name shown across the workspace.",
        type: "text",
      },
      {
        category: "organization",
        key: "legalBusinessName",
        label: "Legal business name",
        description: "Registered legal name used for official and financial references.",
        type: "text",
      },
      {
        category: "branding",
        key: "shortBrandName",
        label: "Short name",
        description: "Compact name used in tight UI spaces such as headers and cards.",
        type: "text",
      },
      {
        category: "organization",
        key: "industry",
        label: "Industry",
        description: "Primary industry classification for the organization.",
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
          { label: "Logistics & Supply Chain", value: "LOGISTICS_SUPPLY_CHAIN" },
          { label: "Telecommunications", value: "TELECOMMUNICATIONS" },
          { label: "Other", value: "OTHER" },
        ],
      },
      {
        category: "branding",
        key: "websiteUrl",
        label: "Company website",
        description: "Official website URL shown in branded and support experiences.",
        type: "url",
      },
    ],
  },
  {
    title: "Business Contact Details",
    description:
      "Keep the primary business contact channels accurate for employees, candidates, customers, and outbound communication.",
    fields: [
      {
        category: "organization",
        key: "businessEmail",
        label: "Business email",
        description: "Main company contact email address.",
        type: "email",
      },
      {
        category: "branding",
        key: "hrContactEmail",
        label: "HR email",
        description: "Primary HR contact used in onboarding and employee support flows.",
        type: "email",
      },
      {
        category: "branding",
        key: "supportEmail",
        label: "Support email",
        description: "Support contact for platform or service-related communication.",
        type: "email",
      },
      {
        category: "organization",
        key: "businessPhone",
        label: "Business phone",
        description: "Main public or company contact number.",
        type: "phone",
      },
      {
        category: "branding",
        key: "supportPhone",
        label: "Alternate phone",
        description: "Backup contact number for business operations.",
        type: "phone",
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
        description: "Used for attendance, scheduling, reminders, and timestamp rendering.",
        type: "lookup",
        lookupKey: "timezones",
        placeholder: "Select a timezone",
      },
      {
        category: "organization",
        key: "currency",
        label: "Default currency",
        description: "Primary currency used in payroll, budgets, and financial displays.",
        type: "lookup",
        lookupKey: "currencies",
        placeholder: "Select a currency",
      },
      {
        category: "system",
        key: "locale",
        label: "Locale",
        description: "Regional formatting preference used across the workspace.",
        type: "select",
        options: [
          { label: "English (United States)", value: "en-US" },
          { label: "English (United Kingdom)", value: "en-GB" },
          { label: "English (Pakistan)", value: "en-PK" },
          { label: "English (Qatar)", value: "en-QA" },
          { label: "Arabic (Qatar)", value: "ar-QA" },
          { label: "Arabic (Saudi Arabia)", value: "ar-SA" },
        ],
      },
      {
        category: "organization",
        key: "dateFormat",
        label: "Date format",
        description: "Default date format shown across forms, tables, and exports.",
        type: "select",
        options: [
          { label: "MM/dd/yyyy", value: "MM/dd/yyyy" },
          { label: "dd/MM/yyyy", value: "dd/MM/yyyy" },
          { label: "yyyy-MM-dd", value: "yyyy-MM-dd" },
          { label: "dd-MMM-yyyy", value: "dd-MMM-yyyy" },
        ],
      },
      {
        category: "system",
        key: "timeFormat",
        label: "Time format",
        description: "Default time display format used across the workspace.",
        type: "select",
        options: [
          { label: "12 hour", value: "12h" },
          { label: "24 hour", value: "24h" },
        ],
      },
      {
        category: "organization",
        key: "weekStartsOn",
        label: "Week start day",
        description: "Used in calendars, timesheets, attendance summaries, and planning views.",
        type: "select",
        options: [
          { label: "Sunday", value: "SUNDAY" },
          { label: "Monday", value: "MONDAY" },
          { label: "Saturday", value: "SATURDAY" },
        ],
      },
    ],
  },
  {
    title: "Address",
    description:
      "Define the official organization address used in profile displays, documents, and support references.",
    fields: [
      {
        category: "branding",
        key: "officeAddress",
        label: "Office address",
        description:
          "Primary office address shown in branded communication and support touchpoints.",
        type: "textarea",
      },
    ],
  },
  {
    title: "Operational Defaults",
    description:
      "Set default organization-level behavior that downstream modules can inherit without hardcoding values.",
    fields: [
      {
        category: "employees",
        key: "employeeIdPrefix",
        label: "Employee code prefix",
        description: "Default employee identifier prefix used when employee IDs are generated.",
        type: "text",
      },
      {
        category: "employees",
        key: "autoGenerateEmployeeId",
        label: "Auto-generate employee code",
        description: "Generate employee codes automatically using tenant employee settings.",
        type: "checkbox",
      },
    ],
  },
];

export default async function TenantSettingsPage() {
  const tenantSettings = await apiRequestJson<TenantSettingsResponse>(
    "/tenant-settings",
  );

  return (
    <SettingsShell
      description="Manage your organization's identity, regional preferences, business contact details, and operational defaults from one place."
      eyebrow="Organization"
      title="Company Profile"
    >
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save company profile"
        sections={organizationSections}
      />
    </SettingsShell>
  );
}
