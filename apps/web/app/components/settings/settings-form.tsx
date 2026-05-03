"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  LookupField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import { BrandingLogoUploadField } from "./branding-logo-upload-field";
import { ColorPickerField } from "./color-picker-field";
import {
  SettingsMap,
  SettingsSectionConfig,
  SettingsPrimitiveValue,
} from "./types";

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
  items?: LookupOption[];
  options?: LookupOption[];
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

export function SettingsForm({
  initialSettings,
  lookupEndpointBase = "/api/lookups",
  saveEndpoint = "/api/tenant-settings",
  saveLabel = "Save settings",
  sections,
}: SettingsFormProps) {
  const router = useRouter();
const LOOKUP_ENDPOINTS: Record<string, string> = {
  countries: "/api/lookups/countries",
  states: "/api/lookups/states",
  cities: "/api/lookups/cities",
  documentCategories: "/api/lookups/document-categories",
  documentTypes: "/api/lookups/document-types",
  relationTypes: "/api/lookups/relation-types",
};
  const [settings, setSettings] = useState<SettingsState>(
    () => (initialSettings ?? {}) as SettingsState,
  );
  const [lookupOptions, setLookupOptions] = useState<
    Record<string, LookupOption[]>
  >({});
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  headers: { Accept: "application/json" },
});

            const data = await safeReadJson<LookupResponse>(response);

            if (!response.ok) {
              nextOptions[lookupKey] = [];
              nextErrors[lookupKey] = "Unable to load lookup options.";
              return;
            }

            nextOptions[lookupKey] = data?.items ?? data?.options ?? [];
          } catch {
            nextOptions[lookupKey] = [];
            nextErrors[lookupKey] = "Unable to load lookup options.";
          }
        }),
      );

      if (cancelled) return;

      setLookupOptions(nextOptions);
      setLookupErrors(nextErrors);
    }

    loadLookupOptions();

    return () => {
      cancelled = true;
    };
  }, [lookupEndpointBase, lookupKeys]);

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
          ((initialSettings ?? {}) as SettingsState)[update.category]?.[
            update.key
          ] ?? null,
        );

        return !areSettingsValuesEqual(original, update.value);
      }),
    [initialSettings, updates],
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
        setError(
          data?.message ??
            data?.error ??
            "Unable to update tenant settings. Please try again.",
        );
        return;
      }

      setSuccessMessage("Settings saved successfully.");
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
    setSettings((initialSettings ?? {}) as SettingsState);
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
          className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2"
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
                  ? lookupOptions[field.lookupKey] ?? []
                  : []
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
    </form>
  );
}

function SettingsField({
  field,
  lookupError,
  lookupOptions,
  onChange,
  value,
}: {
  field: SettingsSectionConfig["fields"][number];
  lookupError?: string;
  lookupOptions: LookupOption[];
  onChange: (value: SettingsValue | null) => void;
  value: SettingsValue | null;
}) {
  const description = field.description ? (
    <span className="block text-xs leading-5 text-muted">
      {field.description}
    </span>
  ) : null;

  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-3 rounded-2xl border border-border bg-white px-4 py-4 text-sm">
        <input
          checked={Boolean(value)}
          className="mt-1 h-4 w-4 rounded border-border"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />

        <span>
          <span className="block font-medium text-foreground">
            {field.label}
          </span>
          {description}
        </span>
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-foreground">{field.label}</span>

        <input
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => {
            const rawValue = event.target.value;
            onChange(rawValue === "" ? null : Number(rawValue));
          }}
          placeholder={field.placeholder}
          type="number"
          value={typeof value === "number" ? String(value) : ""}
        />

        {description}
      </label>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-foreground">{field.label}</span>

        <select
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => onChange(event.target.value || null)}
          value={typeof value === "string" ? value : ""}
        >
          <option value="">Select {field.label}</option>

          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {description}
      </label>
    );
  }

  if (field.type === "multiselect" && field.options) {
    const selectedValues = toStringArray(value);
    const selected = new Set(selectedValues);

    return (
      <div className="grid gap-2 text-sm">
        <span className="font-medium text-foreground">{field.label}</span>

        <div className="grid gap-2 rounded-2xl border border-border bg-white p-3">
          {field.options.map((option) => {
            const checked = selected.has(option.value);

            return (
              <label className="flex items-center gap-3" key={option.value}>
                <input
                  checked={checked}
                  className="h-4 w-4 rounded border-border"
                  onChange={() => {
                    const next = new Set(selectedValues);

                    if (checked) {
                      next.delete(option.value);
                    } else {
                      next.add(option.value);
                    }

                    onChange(Array.from(next));
                  }}
                  type="checkbox"
                />

                <span className="text-foreground">{option.label}</span>
              </label>
            );
          })}
        </div>

        {description}
      </div>
    );
  }

  if (field.type === "lookup") {
    const hint = [field.description, lookupError].filter(Boolean).join(" ");

    return (
      <LookupField
        hint={hint || undefined}
        label={field.label}
        noResultsText={
          lookupError ?? "No matching lookup options were found."
        }
        onChange={(nextValue) => onChange(nextValue || null)}
        options={lookupOptions}
        placeholder={field.placeholder ?? `Search ${field.label}`}
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  if (field.type === "color") {
    return (
      <ColorPickerField
        description={field.description}
        label={field.label}
        onChange={(nextValue) => onChange(nextValue || null)}
        value={typeof value === "string" ? value : ""}
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
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="grid gap-2 text-sm md:col-span-2">
        <span className="font-medium text-foreground">{field.label}</span>

        <textarea
          className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
        />

        {description}
      </label>
    );
  }

  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{field.label}</span>

      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        value={typeof value === "string" ? value : ""}
      />

      {description}
    </label>
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