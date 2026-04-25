"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {ArrowLeft, Save, RefreshCw } from "lucide-react";
import type { PlatformSettingsRecord } from "./platform-lifecycle-types";
import { RecordRibbonBar } from "@/app/_components/crm/record-ribbon-bar";

type SettingsSection =
  | "platformDefaults"
  | "publicPlanVisibility"
  | "billingDefaults"
  | "invoiceDefaults"
  | "emailProvider"
  | "branding"
  | "featureCatalog"
  | "leadDefinitions";

type Props = {
  settings: PlatformSettingsRecord;
  section?: SettingsSection;
};

type JsonObject = Record<string, unknown>;

export function PlatformSettingsForm({ settings, section }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const initialForm = useMemo(
    () => ({
      platformDefaults: toObject(settings.platformDefaults),
      publicPlanVisibility: toObject(settings.publicPlanVisibility),
      billingDefaults: toObject(settings.billingDefaults),
      invoiceDefaults: toObject(settings.invoiceDefaults),
      emailProvider: toObject(settings.emailProvider),
      branding: toObject(settings.branding),
      featureCatalog: toObject(settings.featureCatalog),
      leadDefinitions: toObject(settings.leadDefinitions),
    }),
    [settings],
  );

  const [form, setForm] = useState(initialForm);

  function updateSection(sectionKey: SettingsSection, next: JsonObject) {
    setForm((current) => ({
      ...current,
      [sectionKey]: {
        ...current[sectionKey],
        ...next,
      },
    }));
    setMessage(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const payload = section
      ? { [section]: form[section] }
      : form;

    startTransition(async () => {
      const response = await fetch("/api/super-admin/platform-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(body?.message ?? "Unable to save platform settings.");
        return;
      }

      setMessage("Settings saved.");
      router.refresh();
    });
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
<RecordRibbonBar
  left={
    <>
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
    </>
  }
  right={
    <>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        <RefreshCw className="h-4 w-4" />
        Refresh
      </button>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        <Save className="h-4 w-4" />
        {isPending ? "Saving..." : "Save"}
      </button>
    </>
  }
/>

      {(!section || section === "platformDefaults") && (
        <SettingsPanel
          eyebrow="Platform"
          title="Platform defaults"
          description="Define global behavior used across the admin platform, lifecycle records, and customer setup."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label="Default country"
              value={readString(form.platformDefaults.defaultCountry)}
              onChange={(value) =>
                updateSection("platformDefaults", { defaultCountry: value })
              }
            />

            <Field
              label="Default currency"
              value={readString(form.platformDefaults.defaultCurrency)}
              onChange={(value) =>
                updateSection("platformDefaults", { defaultCurrency: value })
              }
            />

            <Field
              label="Default timezone"
              value={readString(form.platformDefaults.defaultTimezone)}
              onChange={(value) =>
                updateSection("platformDefaults", { defaultTimezone: value })
              }
            />

            <Field
              label="Default locale"
              value={readString(form.platformDefaults.defaultLocale)}
              onChange={(value) =>
                updateSection("platformDefaults", { defaultLocale: value })
              }
            />

            <Select
              label="Date format"
              value={readString(form.platformDefaults.dateFormat)}
              onChange={(value) =>
                updateSection("platformDefaults", { dateFormat: value })
              }
              options={[
                { value: "dd/MM/yyyy", label: "DD/MM/YYYY" },
                { value: "MM/dd/yyyy", label: "MM/DD/YYYY" },
                { value: "yyyy-MM-dd", label: "YYYY-MM-DD" },
              ]}
            />

            <Select
              label="Time format"
              value={readString(form.platformDefaults.timeFormat)}
              onChange={(value) =>
                updateSection("platformDefaults", { timeFormat: value })
              }
              options={[
                { value: "12h", label: "12-hour" },
                { value: "24h", label: "24-hour" },
              ]}
            />
          </div>
        </SettingsPanel>
      )}

      {(!section || section === "billingDefaults") && (
        <SettingsPanel
          eyebrow="Commercial"
          title="Billing defaults"
          description="Configure default billing behavior used when customers, subscriptions, and invoices are created."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Select
              label="Default billing cycle"
              value={readString(form.billingDefaults.defaultBillingCycle)}
              onChange={(value) =>
                updateSection("billingDefaults", {
                  defaultBillingCycle: value,
                })
              }
              options={[
                { value: "Monthly", label: "Monthly" },
                { value: "Annual", label: "Annual" },
              ]}
            />

            <Field
              label="Currency"
              value={readString(form.billingDefaults.currency)}
              onChange={(value) =>
                updateSection("billingDefaults", { currency: value })
              }
            />

            <NumberField
              label="Grace period days"
              value={readNumber(form.billingDefaults.gracePeriodDays)}
              onChange={(value) =>
                updateSection("billingDefaults", { gracePeriodDays: value })
              }
            />

            <NumberField
              label="Tax rate %"
              value={readNumber(form.billingDefaults.taxRate)}
              onChange={(value) =>
                updateSection("billingDefaults", { taxRate: value })
              }
            />

            <Field
              label="Tax label"
              value={readString(form.billingDefaults.taxLabel)}
              onChange={(value) =>
                updateSection("billingDefaults", { taxLabel: value })
              }
            />

            <Toggle
              label="Enable tax by default"
              checked={readBoolean(form.billingDefaults.taxEnabled)}
              onChange={(value) =>
                updateSection("billingDefaults", { taxEnabled: value })
              }
            />
          </div>
        </SettingsPanel>
      )}

      {(!section || section === "invoiceDefaults") && (
        <SettingsPanel
          eyebrow="Commercial"
          title="Invoice defaults"
          description="Control invoice numbering, due dates, prefixes, and customer-facing invoice text."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label="Invoice prefix"
              value={readString(form.invoiceDefaults.invoicePrefix)}
              onChange={(value) =>
                updateSection("invoiceDefaults", { invoicePrefix: value })
              }
            />

            <NumberField
              label="Next invoice number"
              value={readNumber(form.invoiceDefaults.nextInvoiceNumber)}
              onChange={(value) =>
                updateSection("invoiceDefaults", {
                  nextInvoiceNumber: value,
                })
              }
            />

            <NumberField
              label="Due in days"
              value={readNumber(form.invoiceDefaults.dueInDays)}
              onChange={(value) =>
                updateSection("invoiceDefaults", { dueInDays: value })
              }
            />

            <Field
              label="Invoice footer note"
              value={readString(form.invoiceDefaults.footerNote)}
              onChange={(value) =>
                updateSection("invoiceDefaults", { footerNote: value })
              }
            />
          </div>
        </SettingsPanel>
      )}

      {(!section || section === "emailProvider") && (
        <SettingsPanel
          eyebrow="Communication"
          title="Email provider"
          description="Configure sender identity and delivery provider settings for system emails."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Select
              label="Provider"
              value={readString(form.emailProvider.provider)}
              onChange={(value) =>
                updateSection("emailProvider", { provider: value })
              }
              options={[
                { value: "smtp", label: "SMTP" },
                { value: "sendgrid", label: "SendGrid" },
                { value: "mailgun", label: "Mailgun" },
                { value: "log", label: "Log only" },
              ]}
            />

            <Field
              label="From name"
              value={readString(form.emailProvider.fromName)}
              onChange={(value) =>
                updateSection("emailProvider", { fromName: value })
              }
            />

            <Field
              label="From email"
              type="email"
              value={readString(form.emailProvider.fromEmail)}
              onChange={(value) =>
                updateSection("emailProvider", { fromEmail: value })
              }
            />

            <Field
              label="Reply-to email"
              type="email"
              value={readString(form.emailProvider.replyToEmail)}
              onChange={(value) =>
                updateSection("emailProvider", { replyToEmail: value })
              }
            />

            <Field
              label="SMTP host"
              value={readString(form.emailProvider.smtpHost)}
              onChange={(value) =>
                updateSection("emailProvider", { smtpHost: value })
              }
            />

            <NumberField
              label="SMTP port"
              value={readNumber(form.emailProvider.smtpPort)}
              onChange={(value) =>
                updateSection("emailProvider", { smtpPort: value })
              }
            />
          </div>
        </SettingsPanel>
      )}

      {(!section || section === "branding") && (
        <SettingsPanel
          eyebrow="Experience"
          title="Branding"
          description="Manage public-facing platform identity, visual theme, and brand assets."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label="Company name"
              value={readString(form.branding.companyName)}
              onChange={(value) =>
                updateSection("branding", { companyName: value })
              }
            />

            <Field
              label="Logo URL"
              value={readString(form.branding.logoUrl)}
              onChange={(value) =>
                updateSection("branding", { logoUrl: value })
              }
            />

            <Field
              label="Favicon URL"
              value={readString(form.branding.faviconUrl)}
              onChange={(value) =>
                updateSection("branding", { faviconUrl: value })
              }
            />

            <ColorField
              label="Primary color"
              value={readString(form.branding.primaryColor, "#020617")}
              onChange={(value) =>
                updateSection("branding", { primaryColor: value })
              }
            />

            <ColorField
              label="Secondary color"
              value={readString(form.branding.secondaryColor, "#475569")}
              onChange={(value) =>
                updateSection("branding", { secondaryColor: value })
              }
            />

            <ColorField
              label="Accent color"
              value={readString(form.branding.accentColor, "#2563eb")}
              onChange={(value) =>
                updateSection("branding", { accentColor: value })
              }
            />
          </div>
        </SettingsPanel>
      )}

      {(!section || section === "featureCatalog") && (
        <SettingsPanel
          eyebrow="Platform"
          title="Feature catalog"
          description="Control which core modules and platform capabilities are available."
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {[
              ["leads", "Leads"],
              ["customers", "Customers"],
              ["onboarding", "Customer onboarding"],
              ["tenants", "Tenants"],
              ["plans", "Plans"],
              ["billing", "Billing"],
              ["invoices", "Invoices"],
              ["settings", "Settings"],
            ].map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={readBoolean(form.featureCatalog[key], true)}
                onChange={(value) =>
                  updateSection("featureCatalog", { [key]: value })
                }
              />
            ))}
          </div>
        </SettingsPanel>
      )}

      {(!section || section === "leadDefinitions") && (
        <SettingsPanel
          eyebrow="Lifecycle"
          title="Lead definitions"
          description="Configure lead sources, statuses, qualification defaults, and lifecycle rules."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label="Default status"
              value={readString(form.leadDefinitions.defaultStatus)}
              onChange={(value) =>
                updateSection("leadDefinitions", { defaultStatus: value })
              }
            />

            <Field
              label="Default sub-status"
              value={readString(form.leadDefinitions.defaultSubStatus)}
              onChange={(value) =>
                updateSection("leadDefinitions", { defaultSubStatus: value })
              }
            />

            <NumberField
              label="Qualification score threshold"
              value={readNumber(form.leadDefinitions.qualificationScore)}
              onChange={(value) =>
                updateSection("leadDefinitions", {
                  qualificationScore: value,
                })
              }
            />

            <Field
              label="Default owner strategy"
              value={readString(form.leadDefinitions.defaultOwnerStrategy)}
              onChange={(value) =>
                updateSection("leadDefinitions", {
                  defaultOwnerStrategy: value,
                })
              }
            />

            <ListField
              label="Lead sources"
              value={readStringArray(form.leadDefinitions.sources)}
              onChange={(value) =>
                updateSection("leadDefinitions", { sources: value })
              }
            />

            <ListField
              label="Lead statuses"
              value={readStringArray(form.leadDefinitions.statuses)}
              onChange={(value) =>
                updateSection("leadDefinitions", { statuses: value })
              }
            />
          </div>
        </SettingsPanel>
      )}

      {(!section || section === "publicPlanVisibility") && (
        <SettingsPanel
          eyebrow="Commercial"
          title="Public plan visibility"
          description="Configure how plans and pricing are exposed on public and customer-facing surfaces."
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <Toggle
              label="Show plans publicly"
              checked={readBoolean(
                form.publicPlanVisibility.showPlansPublicly,
                true,
              )}
              onChange={(value) =>
                updateSection("publicPlanVisibility", {
                  showPlansPublicly: value,
                })
              }
            />

            <Toggle
              label="Show monthly pricing"
              checked={readBoolean(
                form.publicPlanVisibility.showMonthlyPricing,
                true,
              )}
              onChange={(value) =>
                updateSection("publicPlanVisibility", {
                  showMonthlyPricing: value,
                })
              }
            />

            <Toggle
              label="Show annual pricing"
              checked={readBoolean(
                form.publicPlanVisibility.showAnnualPricing,
                true,
              )}
              onChange={(value) =>
                updateSection("publicPlanVisibility", {
                  showAnnualPricing: value,
                })
              }
            />

            <Toggle
              label="Allow trial"
              checked={readBoolean(form.publicPlanVisibility.allowTrial)}
              onChange={(value) =>
                updateSection("publicPlanVisibility", {
                  allowTrial: value,
                })
              }
            />

            <NumberField
              label="Trial days"
              value={readNumber(form.publicPlanVisibility.trialDays)}
              onChange={(value) =>
                updateSection("publicPlanVisibility", {
                  trialDays: value,
                })
              }
            />
          </div>
        </SettingsPanel>
      )}

      <div className="sticky bottom-4 z-10 rounded-[24px] border border-slate-200 bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {message ?? "Changes apply globally across the platform."}
          </p>

          <button
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SettingsPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-slate-950">
            {title}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>

        <button
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          onClick={() => window.location.reload()}
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          Reset
        </button>
      </div>

      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-2 flex rounded-2xl border border-slate-300 bg-white p-2">
        <input
          className="h-10 w-14 rounded-xl border border-slate-200"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={value}
        />
        <input
          className="min-w-0 flex-1 px-3 text-sm outline-none"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </div>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input
        checked={checked}
        className="h-4 w-4"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
      {label}
      <textarea
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        value={value.join("\n")}
      />
      <span className="mt-1 block text-xs text-slate-500">
        Add one item per line.
      </span>
    </label>
  );
}

function toObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}