"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckboxField,
  LookupField,
  MultiSelectField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import { BrandingLogoUploadField } from "./branding-logo-upload-field";
import { ColorPickerField } from "./color-picker-field";
import { SideToast } from "@/app/components/notifications";
import {
  SettingsMap,
  SettingsSectionConfig,
  SettingsPrimitiveValue,
} from "./types";
import { notifyTenantSettingsChanged } from "@/lib/settings-events";

type SettingsValue = SettingsPrimitiveValue | string[];

type SettingsState = Record<
  string,
  Record<string, SettingsValue | null | undefined>
>;

type SettingsUpdate = {
  category: string;
  key: string;
  value: SettingsValue | null;
};

type LookupResponse = {
  items?: unknown[];
  options?: unknown[];
  source?: "default" | "resolved";
};

type SettingsFormProps = {
  initialSettings: SettingsMap;
  lookupEndpointBase?: string;
  saveEndpoint?: string;
  saveLabel?: string;
  sections: SettingsSectionConfig[];
};

type ApiErrorResponse = {
  message?: string;
  error?: string;
};

const LOOKUP_ENDPOINTS: Record<string, string> = {
  countries: "/api/lookups/countries",
  currencies: "/api/configuration/currencies",
  states: "/api/lookups/states",
  cities: "/api/lookups/cities",
  documentCategories: "/api/lookups/document-categories",
  documentTypes: "/api/lookups/document-types",
  relationTypes: "/api/lookups/relation-types",
  timezones: "/api/configuration/timezones",
  onboardingChecklistTemplates: "/api/lookups/onboarding-checklist-templates",
  dashboardViews: "/api/lookups/dashboard-views",
  glAccounts: "/api/payroll/gl-accounts?isActive=true&postingAllowed=true",
  payrollRegions: "/api/payroll-regions?status=ACTIVE&pageSize=100",
  payrollCalendars: "/api/payroll/calendars",
  compensationPackages: "/api/salary-package-rules?pageSize=100",
  taxPolicies: "/api/tax-rules",
  postingProfiles: "/api/payroll/posting-rules",
  payComponents: "/api/pay-components?isActive=true",
  employerBankAccounts:
    "/api/payroll/employer-bank-accounts?isActive=true&pageSize=100",
  documentTemplates:
    "/api/settings-runtime/document-templates?isActive=true&pageSize=100",
};

const ACTIVE_ONLY_LOOKUPS = new Set([
  "glAccounts",
  "payrollRegions",
  "payrollCalendars",
  "compensationPackages",
  "taxPolicies",
  "postingProfiles",
  "payComponents",
  "employerBankAccounts",
  "documentTemplates",
]);

const LOOKUP_CREATE_HREFS: Readonly<Record<string, string>> = {
  glAccounts: "/settings/payroll/configuration/gl-accounts/new",
  payrollRegions: "/settings/payroll/configuration/payroll-regions/new",
  payrollCalendars: "/payroll/calendars/new",
  compensationPackages:
    "/settings/payroll/configuration/salary-package-rules/new",
  taxPolicies: "/settings/payroll/configuration/tax-rules/new",
  postingProfiles: "/settings/payroll/configuration/posting-rules/new",
  payComponents: "/settings/payroll/configuration/pay-components/new",
  employerBankAccounts: "/settings/payroll/banking/employer-bank-accounts/new",
  documentTemplates: "/settings/payroll/operations/document-templates/new",
};

const RECOVERABLE_LOOKUP_KEYS = new Set(["dashboardViews"]);
const INLINE_ERROR_HANDLING_HEADER = {
  "X-DijiPeople-Error-Handling": "inline",
};

export function SettingsForm({
  initialSettings,
  lookupEndpointBase = "/api/lookups",
  saveEndpoint = "/api/tenant-settings",
  saveLabel = "Save settings",
  sections,
}: SettingsFormProps) {
  const router = useRouter();

  const [settings, setSettings] = useState<SettingsState>(
    () => (initialSettings ?? {}) as SettingsState,
  );
  const [savedSettings, setSavedSettings] = useState<SettingsState>(
    () => (initialSettings ?? {}) as SettingsState,
  );
  const [lookupOptions, setLookupOptions] = useState<
    Record<string, LookupOption[]>
  >({});
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  const [loadedLookups, setLoadedLookups] = useState<Record<string, boolean>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const repairedLookupValues = useRef(new Set<string>());

  const fields = useMemo(
    () => sections.flatMap((section) => section.fields),
    [sections],
  );

  const lookupKeys = useMemo(() => {
    return Array.from(
      new Set(
        fields
          .filter((field) => field.type === "lookup" && field.lookupKey)
          .map((field) => field.lookupKey)
          .filter(Boolean),
      ),
    ) as string[];
  }, [fields]);

  useEffect(() => {
    if (lookupKeys.length === 0) return;

    let cancelled = false;

    async function loadLookupOptions() {
      const nextOptions: Record<string, LookupOption[]> = {};
      const nextErrors: Record<string, string> = {};

      await Promise.all(
        lookupKeys.map(async (lookupKey) => {
          try {
            const endpoint = LOOKUP_ENDPOINTS[lookupKey];

            if (!endpoint) {
              nextOptions[lookupKey] = [];
              nextErrors[lookupKey] = "Lookup not configured.";
              return;
            }

            const response = await fetch(endpoint, {
              method: "GET",
              headers: {
                Accept: "application/json",
                ...INLINE_ERROR_HANDLING_HEADER,
              },
            });

            const data = await safeReadJson<unknown>(response);

            if (!response.ok) {
              nextOptions[lookupKey] = [];
              nextErrors[lookupKey] = "Unable to load lookup options.";
              logLookupDiagnostic("lookup failed", {
                endpoint,
                lookupKey,
                status: response.status,
                fallback: "none",
              });
              return;
            }

            nextOptions[lookupKey] = normalizeLookupOptions(data, lookupKey);
            logLookupDiagnostic("lookup loaded", {
              endpoint,
              lookupKey,
              status: response.status,
              fallback: lookupSource(data),
              optionCount: nextOptions[lookupKey].length,
            });
          } catch (lookupError) {
            nextOptions[lookupKey] = [];
            nextErrors[lookupKey] = "Unable to load lookup options.";
            logLookupDiagnostic("lookup request failed", {
              endpoint: LOOKUP_ENDPOINTS[lookupKey],
              lookupKey,
              status: "network-error",
              fallback: "none",
              error:
                lookupError instanceof Error
                  ? lookupError.message
                  : "Unknown lookup error",
            });
          }
        }),
      );

      if (cancelled) return;

      setLookupOptions(nextOptions);
      setLookupErrors(nextErrors);
      setLoadedLookups(
        Object.fromEntries(lookupKeys.map((lookupKey) => [lookupKey, true])),
      );
    }

    loadLookupOptions();

    return () => {
      cancelled = true;
    };
  }, [lookupEndpointBase, lookupKeys]);

  useEffect(() => {
    for (const field of fields) {
      if (
        field.type !== "lookup" ||
        !field.lookupKey ||
        !RECOVERABLE_LOOKUP_KEYS.has(field.lookupKey) ||
        lookupErrors[field.lookupKey]
      ) {
        continue;
      }

      const options = lookupOptions[field.lookupKey];
      if (!options?.length) continue;

      const currentValue = settings[field.category]?.[field.key];
      if (
        typeof currentValue !== "string" ||
        !currentValue ||
        options.some((option) => option.id === currentValue)
      ) {
        continue;
      }

      const repairKey = `${field.category}.${field.key}:${currentValue}`;
      if (repairedLookupValues.current.has(repairKey)) continue;

      repairedLookupValues.current.add(repairKey);
      const fallback = options[0].id;

      setSettings((current) => ({
        ...current,
        [field.category]: {
          ...(current[field.category] ?? {}),
          [field.key]: fallback,
        },
      }));
      setRecoveryMessage(
        `${field.label} referenced an unavailable option. It was reset to ${options[0].name}; save to persist the repair.`,
      );
      logLookupDiagnostic("stale lookup repaired", {
        endpoint: LOOKUP_ENDPOINTS[field.lookupKey],
        lookupKey: field.lookupKey,
        staleId: currentValue,
        fallback,
      });
    }
  }, [fields, lookupErrors, lookupOptions, settings]);

  const updates = useMemo<SettingsUpdate[]>(
    () =>
      fields.map((field) => ({
        category: field.category,
        key: field.key,
        value: normalizeValue(settings[field.category]?.[field.key] ?? null),
      })),
    [fields, settings],
  );

  const changedUpdates = useMemo<SettingsUpdate[]>(
    () =>
      updates.filter((update) => {
        const original = normalizeValue(
          savedSettings[update.category]?.[update.key] ?? null,
        );

        return !areSettingsValuesEqual(original, update.value);
      }),
    [savedSettings, updates],
  );

  const isDirty = changedUpdates.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isDirty || isSubmitting) return;

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(saveEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: changedUpdates }),
      });

      const data = await safeReadJson<ApiErrorResponse>(response);

      if (!response.ok) {
        /*
         * The save is atomic on the server: a rejected key fails the whole
         * PATCH and nothing is written. Leaving the refused values on screen
         * made the page assert a state the server had just declined - a
         * checkbox stayed ticked after its save was rejected, so anyone who
         * did not read the error believed the setting had been saved
         * (BUG-1978). Reverting to what is actually persisted keeps the screen
         * honest; the message says the changes were not applied.
         */
        setSettings(savedSettings);
        setError(
          `${
            data?.message ??
            data?.error ??
            "Unable to update tenant settings. Please try again."
          } No changes were saved, and the form has been reset to the saved values.`,
        );
        return;
      }

      setSuccessMessage("Settings saved successfully.");
      setSavedSettings(settings);
      notifyTenantSettingsChanged(
        changedUpdates.map((update) => update.category),
      );
      router.refresh();
    } catch {
      setError(
        "Unable to update tenant settings. Please check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setSettings(savedSettings);
    setError(null);
    setSuccessMessage(null);
  }

  function updateField(
    category: string,
    key: string,
    value: SettingsValue | null,
  ) {
    setSettings((current) => ({
      ...current,
      [category]: {
        ...(current[category] ?? {}),
        [key]: value,
      },
    }));

    setError(null);
    setSuccessMessage(null);
  }

  if (!sections.length) {
    return (
      <section className="rounded-[24px] border border-dashed border-border bg-surface p-8 text-center">
        <h3 className="text-lg font-semibold text-foreground">
          No configurable settings
        </h3>
        <p className="mt-2 text-sm text-muted">
          This settings page does not have any configurable fields yet.
        </p>
      </section>
    );
  }

  return (
    <form className="grid gap-6 pb-24" onSubmit={handleSubmit}>
      {sections.map((section) => (
        <section
          className="grid items-start gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2"
          key={section.title}
        >
          <div className="md:col-span-2">
            <h3 className="text-2xl font-semibold text-foreground">
              {section.title}
            </h3>

            {section.description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                {section.description}
              </p>
            ) : null}
          </div>

          {section.fields.map((field) => (
            <SettingsField
              field={field}
              key={`${field.category}-${field.key}`}
              lookupError={
                field.type === "lookup" && field.lookupKey
                  ? lookupErrors[field.lookupKey]
                  : undefined
              }
              lookupOptions={
                field.type === "lookup" && field.lookupKey
                  ? (lookupOptions[field.lookupKey] ?? [])
                  : []
              }
              lookupLoaded={
                field.type === "lookup" && field.lookupKey
                  ? Boolean(loadedLookups[field.lookupKey])
                  : true
              }
              onChange={(nextValue) =>
                updateField(field.category, field.key, nextValue)
              }
              value={settings[field.category]?.[field.key] ?? null}
            />
          ))}
        </section>
      ))}

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {recoveryMessage ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {recoveryMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      <div className="fixed inset-x-4 bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-lg sm:inset-x-auto sm:right-4 sm:flex-row sm:items-center">
        <div className="text-xs text-muted sm:mr-2">
          {isDirty
            ? `${changedUpdates.length} unsaved change${
                changedUpdates.length === 1 ? "" : "s"
              }`
            : "No unsaved changes"}
        </div>

        <button
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || !isDirty}
          onClick={resetForm}
          type="button"
        >
          Reset changes
        </button>

        <button
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting || !isDirty}
          type="submit"
        >
          {isSubmitting ? "Saving..." : saveLabel}
        </button>
      </div>

      {error ? (
        <SideToast
          isOpen
          title="Settings save failed"
          description={error}
          variant="error"
          onClose={() => setError(null)}
        />
      ) : null}

      {successMessage ? (
        <SideToast
          isOpen
          title="Settings saved"
          description={successMessage}
          variant="success"
          onClose={() => setSuccessMessage(null)}
        />
      ) : null}
    </form>
  );
}

function SettingsField({
  field,
  lookupError,
  lookupLoaded,
  lookupOptions,
  onChange,
  value,
}: {
  field: SettingsSectionConfig["fields"][number];
  lookupError?: string;
  lookupLoaded: boolean;
  lookupOptions: LookupOption[];
  onChange: (value: SettingsValue | null) => void;
  value: SettingsValue | null;
}) {
  const disabled = field.disabled || field.readOnly;

  if (field.type === "checkbox") {
    return (
      <CheckboxField
        label={field.label}
        hint={field.description}
        checked={Boolean(value)}
        onChange={(checked) => onChange(checked)}
        disabled={disabled}
        className="self-end"
      />
    );
  }

  if (field.type === "number") {
    return (
      <NumberField
        label={field.label}
        hint={field.description}
        placeholder={field.placeholder}
        value={typeof value === "number" ? value : null}
        onChange={(nextValue) => onChange(nextValue)}
        disabled={disabled}
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <SelectField
        label={field.label}
        hint={field.description}
        options={field.options}
        placeholder={`Select ${field.label}`}
        value={typeof value === "string" ? value : ""}
        onChange={(nextValue) => onChange(nextValue || null)}
        disabled={disabled}
      />
    );
  }

  if (field.type === "multiselect" && field.options) {
    return (
      <MultiSelectField
        label={field.label}
        hint={field.description}
        options={field.options}
        value={toStringArray(value)}
        onChange={(nextValue) => onChange(nextValue)}
        disabled={disabled}
      />
    );
  }

  if (field.type === "lookup") {
    const hint = [field.description, lookupError].filter(Boolean).join(" ");
    const createHref =
      field.createHref ??
      (field.lookupKey ? LOOKUP_CREATE_HREFS[field.lookupKey] : undefined);

    return (
      <div className="grid gap-1.5">
        <LookupField
          hint={hint || undefined}
          label={field.label}
          noResultsText={
            lookupError ??
            (lookupLoaded
              ? "No active configuration records were found."
              : "Loading configuration records...")
          }
          onChange={(nextValue) => onChange(nextValue || null)}
          options={lookupOptions}
          placeholder={field.placeholder ?? `Search ${field.label}`}
          value={typeof value === "string" ? value : ""}
          disabled={disabled || !lookupLoaded}
        />
        {lookupLoaded &&
        !lookupError &&
        lookupOptions.length === 0 &&
        createHref ? (
          <Link
            className="w-fit text-xs font-semibold text-accent hover:underline"
            href={createHref}
          >
            Create configuration
          </Link>
        ) : null}
      </div>
    );
  }

  if (field.type === "color") {
    return (
      <ColorPickerField
        description={field.description}
        label={field.label}
        onChange={(nextValue) => onChange(nextValue || null)}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
      />
    );
  }

  if (field.type === "logo-upload") {
    return (
      <BrandingLogoUploadField
        description={field.description}
        label={field.label}
        onChange={(nextValue) => onChange(nextValue || null)}
        settingKey={field.key}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <TextAreaField
        label={field.label}
        hint={field.description}
        placeholder={field.placeholder}
        value={typeof value === "string" ? value : ""}
        onChange={(nextValue) => onChange(nextValue)}
        disabled={disabled}
        className="md:col-span-2"
      />
    );
  }

  return (
    <TextField
      label={field.label}
      hint={field.description}
      placeholder={field.placeholder}
      value={typeof value === "string" ? value : ""}
      onChange={(nextValue) => onChange(nextValue)}
      disabled={disabled}
    />
  );
}

function normalizeValue(value: SettingsValue | null | undefined) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return [...value].sort();
  if (typeof value === "string") return value.trim();
  return value;
}

function areSettingsValuesEqual(
  left: SettingsValue | null,
  right: SettingsValue | null,
) {
  const normalizedLeft = normalizeValue(left);
  const normalizedRight = normalizeValue(right);

  if (Array.isArray(normalizedLeft) || Array.isArray(normalizedRight)) {
    return (
      JSON.stringify(toStringArray(normalizedLeft)) ===
      JSON.stringify(toStringArray(normalizedRight))
    );
  }

  return normalizedLeft === normalizedRight;
}

function toStringArray(value: SettingsValue | null | undefined) {
  if (Array.isArray(value)) return value.map(String).sort();

  if (typeof value === "string" && value.length > 0) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .sort();
  }

  return [];
}

async function safeReadJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeLookupOptions(
  payload: unknown,
  lookupKey: string,
): LookupOption[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? Array.isArray((payload as LookupResponse).items)
        ? (payload as LookupResponse).items!
        : Array.isArray((payload as LookupResponse).options)
          ? (payload as LookupResponse).options!
          : []
      : [];

  return records.flatMap((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return [];
    }
    const item = record as Record<string, unknown>;
    if (
      ACTIVE_ONLY_LOOKUPS.has(lookupKey) &&
      (item.isActive === false ||
        (typeof item.status === "string" && item.status !== "ACTIVE"))
    ) {
      return [];
    }
    if (lookupKey === "glAccounts" && item.postingAllowed === false) {
      return [];
    }
    const rawId =
      lookupKey === "currencies"
        ? item.code
        : (item.id ?? item.value ?? item.code);
    const rawName =
      item.name ??
      item.label ??
      item.displayName ??
      item.accountName ??
      item.code;
    if (
      (typeof rawId !== "string" && typeof rawId !== "number") ||
      (typeof rawName !== "string" && typeof rawName !== "number")
    ) {
      return [];
    }
    const code = typeof item.code === "string" ? item.code : undefined;
    const name = String(rawName).trim();
    return [
      {
        id: String(rawId),
        name: code && code !== name ? `${name} (${code})` : name,
      },
    ];
  });
}

function lookupSource(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "resolved";
  }
  const source = (payload as LookupResponse).source;
  return source === "default" || source === "resolved" ? source : "resolved";
}

function logLookupDiagnostic(
  message: string,
  details: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(`[settings] ${message}`, details);
}
