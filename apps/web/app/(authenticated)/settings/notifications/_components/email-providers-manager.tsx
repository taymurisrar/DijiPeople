"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  EffectiveEmailProvider,
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
  defaultProviderType,
  describeEmailDelivery,
  isSinkProviderType,
  providerStateLabel,
  providerTypeLabel,
  providerTypeOptions,
  selectableProviderTypes,
} from "./email-delivery-path";
import {
  ErrorBanner,
  Field,
  formatDateTime,
  inputClassName,
  SettingsPanel,
} from "./notification-ui";

type ProviderForm = {
  id?: string;
  /* The type the saved row had, so an unavailable one stays visible. */
  storedProviderType: EmailProviderType | null;
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

const PROVIDER_FORM_ID = "email-provider-form";

function newProviderForm(providerType: EmailProviderType): ProviderForm {
  return {
    storedProviderType: null,
    providerType,
    providerName: "",
    enabled: true,
    isDefault: false,
    fromEmail: "",
    fromName: "",
    replyToEmail: "",
    configuration: {},
  };
}

/**
 * What happens to this workspace's mail right now (BUG-3501, ITEM-0129).
 *
 * It states the delivery path — this workspace's provider, the platform relay,
 * or not delivered — rather than whether some provider resolved, because a
 * Console provider resolves and delivers nothing. The wording lives in
 * `email-delivery-path.ts`, where it is tested.
 */
function EffectiveProviderPanel({
  effective,
  schemas,
}: {
  effective: EffectiveEmailProvider;
  schemas: readonly ProviderSchema[];
}) {
  const summary = describeEmailDelivery(effective, schemas);

  return (
    <div
      className={
        summary.tone === "warning"
          ? "min-w-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          : "min-w-0 rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
      }
    >
      <div className="font-semibold">{summary.title}</div>
      {summary.detail ? (
        <div
          className={`mt-1 break-words ${
            summary.tone === "warning" ? "" : "text-muted"
          }`}
        >
          {summary.detail}
        </div>
      ) : null}
    </div>
  );
}

export function EmailProvidersManager({
  canManage,
  effective,
  providers,
  schemas,
  selectableProviderTypes: selectableFromServer,
}: {
  canManage: boolean;
  effective: EffectiveEmailProvider;
  providers: EmailProviderSetting[];
  schemas: ProviderSchema[];
  selectableProviderTypes?: readonly string[];
}) {
  const router = useRouter();
  /*
   * The tenant's timezone and locale, threaded through React rather than read
   * from the module default — which is installed by an effect and so is empty
   * during server rendering. See formatDateTime in notification-ui.
   */
  const formatting = useFormattingContext();
  /*
   * BUG-3501. The choosable types come from the API, which knows whether this
   * is production; the browser does not. Production leaves out Console and Dev.
   */
  const selectable = useMemo(
    () => selectableProviderTypes(selectableFromServer),
    [selectableFromServer],
  );
  const sinkProvidersRetired = Boolean(effective.sinkProvidersRetired);
  /* `null` means the dialog is closed; the form is not on the page until asked for. */
  const [form, setForm] = useState<ProviderForm | null>(null);
  const [disableTarget, setDisableTarget] =
    useState<EmailProviderSetting | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeSchema = useMemo<ProviderSchema | null>(() => {
    if (!form) return null;
    return (
      schemas.find((schema) => schema.providerType === form.providerType) ?? {
        providerType: form.providerType,
        label: form.providerType,
        description: "",
        fields: [],
      }
    );
  }, [form, schemas]);

  function openCreate() {
    setError(null);
    setMessage(null);
    setFormError(null);
    setForm(newProviderForm(defaultProviderType(selectable)));
  }

  function openEdit(provider: EmailProviderSetting) {
    setError(null);
    setMessage(null);
    setFormError(null);
    setForm({
      id: provider.id,
      storedProviderType: provider.providerType,
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

  function closeForm() {
    if (busy === "save") return;
    setForm(null);
    setFormError(null);
  }

  function updateForm(patch: Partial<ProviderForm>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !activeSchema) return;
    setFormError(null);
    setMessage(null);
    if (
      !form.providerName.trim() ||
      !form.fromEmail.trim() ||
      !form.fromName.trim()
    ) {
      setFormError("Provider name, from email, and from name are required.");
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
      setFormError(
        `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required for ${activeSchema.label}.`,
      );
      return;
    }

    setBusy("save");
    try {
      const configuration = buildConfiguration(
        activeSchema,
        form.configuration,
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
      setForm(null);
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Unable to save provider.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function providerAction(
    provider: EmailProviderSetting,
    action: "default" | "disable" | "validate",
  ) {
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
      setDisableTarget(null);
    }
  }

  const columns: DataTableColumn<EmailProviderSetting>[] = [
    {
      key: "provider",
      header: "Provider",
      render: (provider) => (
        <div className="min-w-0">
          <div className="break-words font-semibold text-foreground">
            {provider.providerName}
          </div>
          <div className="mt-1 text-xs text-muted">
            {providerTypeLabel(provider.providerType, schemas)}
          </div>
        </div>
      ),
    },
    {
      key: "sender",
      header: "Sender",
      render: (provider) => (
        <div className="min-w-0">
          <div className="break-words">{provider.fromName}</div>
          <div className="break-all text-xs text-muted">
            {provider.fromEmail}
          </div>
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (provider) =>
        providerStateLabel(provider, sinkProvidersRetired),
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (provider) => formatDateTime(provider.updatedAt, formatting),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            render: (provider: EmailProviderSetting) => {
              /*
               * Set default also enables the row, which production refuses for
               * a sink (ADR-0015) — so it is not offered there at all.
               */
              const canSetDefault =
                !provider.isDefault &&
                !(
                  sinkProvidersRetired &&
                  isSinkProviderType(provider.providerType)
                );
              return (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => openEdit(provider)}
                    size="sm"
                    variant="secondary"
                  >
                    Edit
                  </Button>
                  {canSetDefault ? (
                    <Button
                      loading={busy === `default:${provider.id}`}
                      onClick={() => providerAction(provider, "default")}
                      size="sm"
                      variant="secondary"
                    >
                      Set Default
                    </Button>
                  ) : null}
                  <Button
                    loading={busy === `validate:${provider.id}`}
                    onClick={() => providerAction(provider, "validate")}
                    size="sm"
                    variant="secondary"
                  >
                    Validate
                  </Button>
                  {provider.enabled ? (
                    <Button
                      onClick={() => setDisableTarget(provider)}
                      size="sm"
                      variant="danger"
                    >
                      Disable
                    </Button>
                  ) : null}
                </div>
              );
            },
          } satisfies DataTableColumn<EmailProviderSetting>,
        ]
      : []),
  ];

  const typeOptions = form
    ? providerTypeOptions(selectable, form.storedProviderType, schemas)
    : [];

  return (
    <div className="grid min-w-0 gap-6">
      <ErrorBanner message={error} />
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <EffectiveProviderPanel effective={effective} schemas={schemas} />

      <div className="min-w-0">
        <SettingsPanel title="Configured Providers">
          {canManage ? (
            <div className="mb-4 flex justify-end">
              <Button onClick={openCreate}>Add provider</Button>
            </div>
          ) : null}
          <div className="min-w-0">
            <DataTable
              columns={columns}
              emptyState={
                <EmptyState description="" title="No email providers configured" />
              }
              enableSearch={false}
              entityLogicalName="notification_email_providers"
              getRowKey={(provider) => provider.id}
              rows={[...providers]}
            />
          </div>
        </SettingsPanel>
      </div>

      <Dialog
        busy={busy === "save"}
        footer={
          <>
            <Button
              disabled={busy === "save"}
              onClick={closeForm}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              form={PROVIDER_FORM_ID}
              loading={busy === "save"}
              type="submit"
            >
              Save Provider
            </Button>
          </>
        }
        onClose={closeForm}
        open={form !== null}
        size="lg"
        title={form?.id ? "Edit provider" : "Add provider"}
      >
        {form && activeSchema ? (
          <form className="grid gap-4" id={PROVIDER_FORM_ID} onSubmit={save}>
            <ErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider type" required>
                <select
                  className={inputClassName}
                  onChange={(event) =>
                    updateForm({
                      providerType: event.target.value as EmailProviderType,
                    })
                  }
                  value={form.providerType}
                >
                  {typeOptions.map((option) => (
                    <option
                      disabled={option.disabled}
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Provider name" required>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateForm({ providerName: event.target.value })
                  }
                  value={form.providerName}
                />
              </Field>
              <Field label="From email" required>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateForm({ fromEmail: event.target.value })
                  }
                  type="email"
                  value={form.fromEmail}
                />
              </Field>
              <Field label="From name" required>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateForm({ fromName: event.target.value })
                  }
                  value={form.fromName}
                />
              </Field>
              <Field label="Reply-to email">
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateForm({ replyToEmail: event.target.value })
                  }
                  type="email"
                  value={form.replyToEmail}
                />
              </Field>
              <div className="flex items-center gap-5 text-sm font-medium text-foreground sm:pt-8">
                <label className="flex items-center gap-2">
                  <input
                    checked={form.enabled}
                    className="h-4 w-4 rounded border-border"
                    onChange={(event) =>
                      updateForm({ enabled: event.target.checked })
                    }
                    type="checkbox"
                  />
                  Enabled
                </label>
                <label className="flex items-center gap-2">
                  <input
                    checked={form.isDefault}
                    className="h-4 w-4 rounded border-border"
                    onChange={(event) =>
                      updateForm({ isDefault: event.target.checked })
                    }
                    type="checkbox"
                  />
                  Default
                </label>
              </div>
            </div>
            {activeSchema.fields.length ? (
              <fieldset className="grid gap-4 rounded-2xl border border-border bg-surface-muted/40 p-4 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold text-foreground">
                  {activeSchema.label} settings
                </legend>
                {activeSchema.fields.map((field) => (
                  <ProviderFieldInput
                    field={field}
                    isExisting={Boolean(form.id)}
                    key={field.key}
                    onChange={(value) =>
                      updateForm({
                        configuration: {
                          ...form.configuration,
                          [field.key]: value,
                        },
                      })
                    }
                    value={form.configuration[field.key] ?? ""}
                  />
                ))}
              </fieldset>
            ) : null}
          </form>
        ) : null}
      </Dialog>

      <ConfirmDialog
        confirmAction={{
          label: "Disable provider",
          onClick: () =>
            disableTarget
              ? providerAction(disableTarget, "disable")
              : undefined,
          variant: "danger",
        }}
        isLoading={Boolean(
          disableTarget && busy === `disable:${disableTarget.id}`,
        )}
        onClose={() => setDisableTarget(null)}
        open={disableTarget !== null}
        title={
          disableTarget
            ? `Disable ${disableTarget.providerName}?`
            : "Disable provider?"
        }
      />
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
  field,
  isExisting,
  value,
  onChange,
}: {
  field: ProviderField;
  isExisting: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-3 text-sm font-medium text-foreground sm:pt-8">
        <input
          checked={value === "true"}
          className="h-4 w-4 rounded border-border"
          onChange={(event) => onChange(String(event.target.checked))}
          type="checkbox"
        />
        {field.label}
      </label>
    );
  }

  return (
    <Field label={field.label} required={field.required}>
      <input
        autoComplete={field.secret ? "new-password" : "off"}
        className={inputClassName}
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
    </Field>
  );
}
