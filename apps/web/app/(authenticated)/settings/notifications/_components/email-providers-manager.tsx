"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  EmailProviderSetting,
  EmailProviderType,
  createEmailProvider,
  disableEmailProvider,
  setDefaultEmailProvider,
  updateEmailProvider,
  validateEmailProvider,
} from "@/lib/notifications-api";
import {
  codeInputClassName,
  ErrorBanner,
  Field,
  formatDateTime,
  inputClassName,
  parseJsonObject,
  SettingsPanel,
  stringifyJson,
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
  configuration: string;
};

const emptyProvider: ProviderForm = {
  providerType: "CONSOLE",
  providerName: "",
  enabled: true,
  isDefault: false,
  fromEmail: "",
  fromName: "",
  replyToEmail: "",
  configuration: "{}",
};

const providerTypes: EmailProviderType[] = [
  "CONSOLE",
  "DEV",
  "SMTP",
  "SES",
  "SENDGRID",
  "MAILGUN",
  "POSTMARK",
  "CUSTOM",
];

export function EmailProvidersManager({
  canManage,
  providers,
}: {
  canManage: boolean;
  providers: EmailProviderSetting[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProviderForm>(emptyProvider);
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
      configuration: stringifyJson(provider.configuration),
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
    setBusy("save");
    try {
      const configuration =
        form.providerType === "CONSOLE"
          ? {}
          : parseJsonObject(
              form.configuration,
              "Configuration must be a JSON object.",
            );
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
                {providerTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
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
          {form.providerType !== "CONSOLE" ? (
            <Field label="Configuration JSON" required>
              <textarea
                className={`${codeInputClassName} min-h-[180px]`}
                disabled={!canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    configuration: event.target.value,
                  }))
                }
                value={form.configuration}
              />
            </Field>
          ) : null}
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
