"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SUPPORTED_EMAIL_PROVIDER_TYPES,
  isSupportedEmailProviderType,
} from "@repo/config";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  EmailProviderSetting,
  EmailProviderType,
  ProviderField,
  ProviderSchema,
  createEmailProvider,
  disableEmailProvider,
  setDefaultEmailProvider,
  updateEmailProvider,
  validateEmailProvider,
} from "@/lib/notifications-api";
import {
  ErrorBanner,
  Field,
  formatDateTime,
  inputClassName,
  SettingsPanel,
} from "./notification-ui";

type ProviderForm = {
  id?: string;
  providerType: EmailProviderType;
  providerName: string;
  enabled: boolean;
  isDefault: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  /* Keyed by the schema field, so the shape follows the provider type. */
  configuration: Record<string, string>;
};

const emptyProvider: ProviderForm = {
  providerType: "CONSOLE",
  providerName: "",
  enabled: true,
  isDefault: false,
  fromEmail: "",
  fromName: "",
  replyToEmail: "",
  configuration: {},
};

/*
 * BUG-0050 — this list used to enumerate the whole Prisma enum, including five
 * providers the backend maps to a placeholder that throws on send and on
 * connection test. A tenant administrator could configure SES, mark it default,
 * and silently receive no mail.
 *
 * It now comes from `@repo/config`, which is the same list the API factory is
 * checked against, so the offer cannot drift ahead of the implementation again.
 * An existing row may still reference an unimplemented provider — the enum keeps
 * every historical value — so `providerTypeOptions` below re-adds whatever the
 * saved setting already uses, marked unavailable rather than hidden.
 */
const providerTypes =
  SUPPORTED_EMAIL_PROVIDER_TYPES as readonly EmailProviderType[];

export function EmailProvidersManager({
  canManage,
  providers,
  schemas,
}: {
  canManage: boolean;
  providers: EmailProviderSetting[];
  schemas: ProviderSchema[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProviderForm>(emptyProvider);
  /*
   * Offer only what can actually send, plus whatever this record already uses.
   *
   * A tenant configured before BUG-0050 may hold SES. Dropping that value from
   * the list would make the select fall back to its first option, so opening the
   * row and saving anything would silently rewrite the provider type. Keeping it
   * visible-but-disabled shows the administrator what is stored and why it is
   * not working, and still refuses to let anyone newly choose it.
   */
  const providerTypeOptions = useMemo(() => {
    const stored = form.providerType;
    return providerTypes.includes(stored)
      ? providerTypes
      : [...providerTypes, stored];
  }, [form.providerType]);
  /*
   * The server describes what each provider type needs, so the form follows it
   * rather than asking a user to hand-write configuration JSON.
   */
  const activeSchema = useMemo(
    () =>
      schemas.find((schema) => schema.providerType === form.providerType) ?? {
        providerType: form.providerType,
        label: form.providerType,
        description: "",
        fields: [],
      },
    [form.providerType, schemas],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function edit(provider: EmailProviderSetting) {
    setError(null);
    setMessage(null);
    setForm({
      id: provider.id,
      providerType: provider.providerType,
      providerName: provider.providerName,
      enabled: provider.enabled,
      isDefault: provider.isDefault,
      fromEmail: provider.fromEmail,
      fromName: provider.fromName,
      replyToEmail: provider.replyToEmail ?? "",
      configuration: toFieldValues(provider.configuration),
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!form.providerName.trim() || !form.fromEmail.trim() || !form.fromName.trim()) {
      setError("Provider name, from email, and from name are required.");
      return;
    }
    const missing = activeSchema.fields
      .filter(
        (field) =>
          field.required &&
          !String(form.configuration[field.key] ?? "").trim() &&
          /* An existing secret stays set unless the user types a new one. */
          !(field.secret && form.id),
      )
      .map((field) => field.label);

    if (missing.length) {
      setError(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required for ${activeSchema.label}.`);
      return;
    }

    setBusy("save");
    try {
      const configuration = buildConfiguration(activeSchema, form.configuration);
      const body = {
        providerType: form.providerType,
        providerName: form.providerName,
        enabled: form.enabled,
        isDefault: form.isDefault,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        replyToEmail: form.replyToEmail || null,
        configuration,
      };
      if (form.id) await updateEmailProvider(form.id, body);
      else await createEmailProvider(body);
      setMessage("Provider saved.");
      setForm(emptyProvider);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save provider.");
    } finally {
      setBusy(null);
    }
  }

  async function providerAction(
    provider: EmailProviderSetting,
    action: "default" | "disable" | "validate",
  ) {
    if (action === "disable" && !confirm("Disable this email provider?")) return;
    setError(null);
    setMessage(null);
    setBusy(`${action}:${provider.id}`);
    try {
      if (action === "default") await setDefaultEmailProvider(provider.id);
      if (action === "disable") await disableEmailProvider(provider.id);
      if (action === "validate") await validateEmailProvider(provider.id);
      setMessage(
        action === "validate"
          ? "Provider configuration validated."
          : "Provider updated.",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      <ErrorBanner message={error} />
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <SettingsPanel
        title={form.id ? "Edit Email Provider" : "Create Email Provider"}
        description="Configuration JSON is sent to the backend as-is. Masked secrets remain protected by backend merge rules."
      >
        <form className="grid gap-4" onSubmit={save}>
          {form.providerType === "CONSOLE" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Console provider does not send real emails. Rendered emails are written to server logs. Use only for development, staging, or temporary production bootstrap.
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider type" required>
              <select
                className={inputClassName}
                disabled={!canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    providerType: event.target.value as EmailProviderType,
                  }))
                }
                value={form.providerType}
              >
                {providerTypeOptions.map((type) => (
                  <option
                    key={type}
                    value={type}
                    disabled={!isSupportedEmailProviderType(type)}
                  >
                    {isSupportedEmailProviderType(type)
                      ? type
                      : `${type} — not available`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Provider name" required>
              <input
                className={inputClassName}
                disabled={!canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    providerName: event.target.value,
                  }))
                }
                value={form.providerName}
              />
            </Field>
            <Field label="From email" required>
              <input
                className={inputClassName}
                disabled={!canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fromEmail: event.target.value,
                  }))
                }
                type="email"
                value={form.fromEmail}
              />
            </Field>
            <Field label="From name" required>
              <input
                className={inputClassName}
                disabled={!canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fromName: event.target.value,
                  }))
                }
                value={form.fromName}
              />
            </Field>
            <Field label="Reply-to email">
              <input
                className={inputClassName}
                disabled={!canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    replyToEmail: event.target.value,
                  }))
                }
                type="email"
                value={form.replyToEmail}
              />
            </Field>
            <div className="flex items-center gap-5 pt-8 text-sm font-medium text-foreground">
              <label className="flex items-center gap-2">
                <input
                  checked={form.enabled}
                  className="h-4 w-4 rounded border-border"
                  disabled={!canManage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Enabled
              </label>
              <label className="flex items-center gap-2">
                <input
                  checked={form.isDefault}
                  className="h-4 w-4 rounded border-border"
                  disabled={!canManage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isDefault: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Default
              </label>
            </div>
          </div>
          {activeSchema.fields.length ? (
            <div className="rounded-2xl border border-border bg-surface-muted/40 p-4">
              <div className="mb-1 text-sm font-semibold text-foreground">
                {activeSchema.label} settings
              </div>
              {activeSchema.description ? (
                <p className="mb-4 text-xs text-muted">
                  {activeSchema.description}
                </p>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {activeSchema.fields.map((field) => (
                  <ProviderFieldInput
                    disabled={!canManage}
                    field={field}
                    isExisting={Boolean(form.id)}
                    key={field.key}
                    value={form.configuration[field.key] ?? ""}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        configuration: {
                          ...current.configuration,
                          [field.key]: value,
                        },
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-border bg-surface-muted/40 px-4 py-3 text-sm text-muted">
              {activeSchema.description ||
                "This provider needs no extra configuration."}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={!canManage} loading={busy === "save"} type="submit">
              Save Provider
            </Button>
            {form.id ? (
              <Button
                onClick={() => setForm(emptyProvider)}
                type="button"
                variant="secondary"
              >
                New Provider
              </Button>
            ) : null}
          </div>
        </form>
      </SettingsPanel>

      <SettingsPanel title="Configured Providers">
        {providers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="border-b border-border px-3 py-3">Provider</th>
                  <th className="border-b border-border px-3 py-3">Sender</th>
                  <th className="border-b border-border px-3 py-3">State</th>
                  <th className="border-b border-border px-3 py-3">Updated</th>
                  <th className="border-b border-border px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id}>
                    <td className="border-b border-border px-3 py-4">
                      <div className="font-semibold text-foreground">
                        {provider.providerName}
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted">
                        {provider.providerType}
                      </div>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <div>{provider.fromName}</div>
                      <div className="text-xs text-muted">{provider.fromEmail}</div>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      {provider.enabled ? "Enabled" : "Disabled"}
                      {provider.isDefault ? " / Default" : ""}
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      {formatDateTime(provider.updatedAt)}
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={!canManage}
                          onClick={() => edit(provider)}
                          size="sm"
                          variant="secondary"
                        >
                          Edit
                        </Button>
                        <Button
                          disabled={!canManage || provider.isDefault}
                          loading={busy === `default:${provider.id}`}
                          onClick={() => providerAction(provider, "default")}
                          size="sm"
                          variant="secondary"
                        >
                          Set Default
                        </Button>
                        <Button
                          disabled={!canManage}
                          loading={busy === `validate:${provider.id}`}
                          onClick={() => providerAction(provider, "validate")}
                          size="sm"
                          variant="secondary"
                        >
                          Validate
                        </Button>
                        <Button
                          disabled={!canManage || !provider.enabled}
                          loading={busy === `disable:${provider.id}`}
                          onClick={() => providerAction(provider, "disable")}
                          size="sm"
                          variant="danger"
                        >
                          Disable
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="Create a tenant provider or rely on backend environment fallback in non-production."
            title="No email providers configured"
          />
        )}
      </SettingsPanel>
    </div>
  );
}

/*
 * A stored secret comes back masked, so an untouched field must not overwrite
 * the real value. Masked placeholders are dropped rather than resent.
 */
const MASKED = /^\*+$/;

function toFieldValues(configuration: Record<string, unknown>) {
  const values: Record<string, string> = {};

  for (const [key, value] of Object.entries(configuration ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    values[key] = String(value);
  }

  return values;
}

function buildConfiguration(
  schema: ProviderSchema,
  values: Record<string, string>,
) {
  const configuration: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const raw = values[field.key];

    if (field.type === "boolean") {
      configuration[field.key] = raw === "true";
      continue;
    }

    const text = String(raw ?? "").trim();
    if (!text) continue;
    // Leaving a masked secret untouched keeps whatever is already stored.
    if (field.secret && MASKED.test(text)) continue;

    configuration[field.key] =
      field.type === "number" && Number.isFinite(Number(text))
        ? Number(text)
        : text;
  }

  return configuration;
}

function ProviderFieldInput({
  disabled,
  field,
  isExisting,
  value,
  onChange,
}: {
  disabled: boolean;
  field: ProviderField;
  isExisting: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-start gap-3 pt-6 text-sm text-foreground">
        <input
          checked={value === "true"}
          className="mt-0.5 h-4 w-4 rounded border-border"
          disabled={disabled}
          onChange={(event) => onChange(String(event.target.checked))}
          type="checkbox"
        />
        <span>
          <span className="block font-medium">{field.label}</span>
          {field.helpText ? (
            <span className="mt-0.5 block text-xs text-muted">
              {field.helpText}
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <Field label={field.label} required={field.required}>
      <input
        autoComplete={field.secret ? "new-password" : "off"}
        className={inputClassName}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          field.secret && isExisting
            ? "Leave blank to keep the stored value"
            : field.placeholder
        }
        type={
          field.type === "password"
            ? "password"
            : field.type === "number"
              ? "number"
              : "text"
        }
        value={value}
      />
      {field.helpText ? (
        <span className="mt-1 block text-xs text-muted">{field.helpText}</span>
      ) : null}
    </Field>
  );
}
