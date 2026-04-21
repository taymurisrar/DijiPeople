"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { BrandingLogoUploadField } from "./branding-logo-upload-field";
import { ColorPickerField } from "./color-picker-field";
import { SettingsMap, SettingsSectionConfig, SettingsPrimitiveValue } from "./types";

type SettingsFormProps = {
  initialSettings: SettingsMap;
  saveEndpoint?: string;
  saveLabel?: string;
  sections: SettingsSectionConfig[];
};

export function SettingsForm({
  initialSettings,
  saveEndpoint = "/api/tenant-settings",
  saveLabel = "Save settings",
  sections,
}: SettingsFormProps) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updates = useMemo(
    () =>
      sections.flatMap((section) =>
        section.fields.map((field) => ({
          category: field.category,
          key: field.key,
          value: settings[field.category]?.[field.key] ?? null,
        })),
      ),
    [sections, settings],
  );

  const isDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initialSettings),
    [initialSettings, settings],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const response = await fetch(saveEndpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });

    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to update tenant settings.");
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Settings saved successfully.");
    setIsSubmitting(false);
    router.refresh();
  }

  function resetForm() {
    setSettings(initialSettings);
    setError(null);
    setSuccessMessage(null);
  }

  return (
    <form className="grid gap-6 pb-20" onSubmit={handleSubmit}>
      {sections.map((section) => (
        <section
          className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2"
          key={section.title}
        >
          <div className="md:col-span-2">
            <h3 className="text-2xl font-semibold text-foreground">{section.title}</h3>
            {section.description ? (
              <p className="mt-2 max-w-3xl text-sm text-muted">
                {section.description}
              </p>
            ) : null}
          </div>

          {section.fields.map((field) => (
            <SettingsField
              field={field}
              key={`${field.category}-${field.key}`}
              onChange={(nextValue) =>
                setSettings((current) => ({
                  ...current,
                  [field.category]: {
                    ...current[field.category],
                    [field.key]: nextValue,
                  },
                }))
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

      <div className="fixed bottom-4 right-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-lg">
        <button
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || !isDirty}
          onClick={resetForm}
          type="button"
        >
          Reset changes
        </button>
        <button
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
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
  onChange,
  value,
}: {
  field: SettingsSectionConfig["fields"][number];
  onChange: (value: SettingsPrimitiveValue) => void;
  value: SettingsPrimitiveValue;
}) {
  const description = field.description ? (
    <span className="block text-xs text-muted">{field.description}</span>
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
          <span className="block font-medium text-foreground">{field.label}</span>
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
          onChange={(event) => onChange(Number(event.target.value || 0))}
          type="number"
          value={typeof value === "number" ? value : 0}
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
          onChange={(event) => onChange(event.target.value)}
          value={typeof value === "string" ? value : ""}
        >
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
    const selected = new Set(
      typeof value === "string" && value.length > 0
        ? value.split(",").map((entry) => entry.trim())
        : [],
    );

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
                  onChange={() => {
                    const next = new Set(selected);

                    if (checked) {
                      next.delete(option.value);
                    } else {
                      next.add(option.value);
                    }

                    onChange(Array.from(next).join(","));
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

  if (field.type === "color") {
    return (
      <ColorPickerField
        description={field.description}
        label={field.label}
        onChange={(nextValue) => onChange(nextValue)}
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  if (field.type === "logo-upload") {
    return (
      <BrandingLogoUploadField
        description={field.description}
        label={field.label}
        onChange={(nextValue) => onChange(nextValue)}
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
