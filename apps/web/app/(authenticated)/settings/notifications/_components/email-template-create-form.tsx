"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import {
  NotificationEvent,
  TemplateScopeOptions,
  createEmailTemplate,
} from "@/lib/notifications-api";
import {
  ScopePicker,
  ScopeValue,
  validateScope,
} from "../../_components/scope-picker";
import {
  codeInputClassName,
  ErrorBanner,
  Field,
  inputClassName,
  parseJsonObject,
  SettingsPanel,
} from "./notification-ui";

const DEFAULT_HTML = `<p>Hello {{recipientName}},</p>
<p>Write your message here.</p>
<p>Thanks,<br />{{tenantName}}</p>`;

const KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function EmailTemplateCreateForm({
  events,
  scopeOptions,
}: {
  events: NotificationEvent[];
  scopeOptions: TemplateScopeOptions | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    templateKey: "",
    eventCode: events[0]?.code ?? "",
    description: "",
    subjectTemplate: "",
    htmlTemplate: DEFAULT_HTML,
    availableVariables: '{\n  "recipientName": "Recipient name",\n  "tenantName": "Company name"\n}',
    status: "DRAFT" as "DRAFT" | "ACTIVE",
  });
  const [scope, setScope] = useState<ScopeValue>({
    scopeLevel: "TENANT",
    scopeId: null,
    moduleKey: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * The key is what resolution matches on, so it is derived from the name for
   * convenience but stays editable: two templates at different scopes must be
   * able to share a key, and a template replacing a system default must match
   * the system key exactly.
   */
  const suggestedKey = useMemo(
    () =>
      form.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    [form.name],
  );

  const effectiveKey = form.templateKey.trim() || suggestedKey;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError("Name is required.");
    if (!form.eventCode) return setError("Select the event this template answers.");
    if (!effectiveKey) return setError("Template key is required.");
    if (!KEY_PATTERN.test(effectiveKey)) {
      return setError(
        "Template key may contain lowercase letters, numbers, dots, dashes and underscores only.",
      );
    }
    if (!form.subjectTemplate.trim()) return setError("Subject is required.");
    if (!form.htmlTemplate.trim()) return setError("HTML body is required.");
    if (/<script[\s>]/i.test(form.htmlTemplate)) {
      return setError("Script tags are not allowed in email templates.");
    }

    const scopeError = validateScope(scope);
    if (scopeError) return setError(scopeError);

    setBusy(true);
    try {
      const availableVariables = parseJsonObject(
        form.availableVariables,
        "Available variables must be a JSON object.",
      );
      const created = await createEmailTemplate({
        name: form.name.trim(),
        templateKey: effectiveKey,
        eventCode: form.eventCode,
        description: form.description.trim() || null,
        subjectTemplate: form.subjectTemplate.trim(),
        htmlTemplate: form.htmlTemplate,
        availableVariables,
        status: form.status,
        scopeLevel: scope.scopeLevel,
        scopeId: scope.scopeId,
        moduleKey: scope.moduleKey,
      });
      /*
       * The destination is a server component that fetches the template it
       * renders, so it is already current. Calling refresh() here would race
       * the navigation and leave the user on the create form.
       */
      router.push(`/settings/notifications/templates/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create template.");
      setBusy(false);
    }
  }

  const selectedEvent = events.find((entry) => entry.code === form.eventCode);

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <ErrorBanner message={error} />

      <SettingsPanel
        title="Template Definition"
        description="A template answers one notification event. When the event fires, the most specific template for the record's placement is the one that gets sent."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" required>
            <input
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Leave approved - engineering"
              value={form.name}
            />
          </Field>
          <Field label="Event" required>
            <select
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  eventCode: event.target.value,
                }))
              }
              value={form.eventCode}
            >
              {events.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </select>
            {selectedEvent?.description ? (
              <span className="mt-1 block text-xs text-muted">
                {selectedEvent.description}
              </span>
            ) : null}
          </Field>
          <Field label="Template key">
            <input
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  templateKey: event.target.value,
                }))
              }
              placeholder={suggestedKey || "leave-approved"}
              value={form.templateKey}
            />
            <span className="mt-1 block text-xs text-muted">
              {form.templateKey.trim()
                ? "Used to match this template during resolution."
                : suggestedKey
                  ? `Will be saved as "${suggestedKey}".`
                  : "Derived from the name if left blank."}
            </span>
          </Field>
          <Field label="Status">
            <select
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as "DRAFT" | "ACTIVE",
                }))
              }
              value={form.status}
            >
              <option value="DRAFT">Draft - not used for sending yet</option>
              <option value="ACTIVE">Active - start using immediately</option>
            </select>
          </Field>
          <Field label="Description">
            <input
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              value={form.description}
            />
          </Field>
          <Field label="Subject" required>
            <input
              className={inputClassName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  subjectTemplate: event.target.value,
                }))
              }
              placeholder="Your leave request was approved"
              value={form.subjectTemplate}
            />
          </Field>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Where this template applies"
        description="The most specific match wins: a team template beats a department one, which beats a business unit, an organization, and finally the tenant default."
      >
        <ScopePicker
          onChange={setScope}
          options={scopeOptions}
          value={scope}
        />
      </SettingsPanel>

      <SettingsPanel
        title="Content"
        description="Variables are written as {{variableName}} and are replaced when the email is rendered."
      >
        <div className="grid gap-4">
          <Field label="HTML body" required>
            <textarea
              className={`${codeInputClassName} min-h-[240px]`}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  htmlTemplate: event.target.value,
                }))
              }
              value={form.htmlTemplate}
            />
          </Field>
          <Field label="Available variables JSON">
            <textarea
              className={`${codeInputClassName} min-h-[140px]`}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  availableVariables: event.target.value,
                }))
              }
              value={form.availableVariables}
            />
          </Field>
        </div>
      </SettingsPanel>

      <div className="flex justify-end gap-3">
        <Button
          href="/settings/notifications/templates"
          type="button"
          variant="secondary"
        >
          Cancel
        </Button>
        <Button loading={busy} type="submit">
          Create Template
        </Button>
      </div>
    </form>
  );
}
