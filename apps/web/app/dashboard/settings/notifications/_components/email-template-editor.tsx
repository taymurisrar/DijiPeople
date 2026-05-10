"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import {
  EmailTemplate,
  RenderedTemplate,
  previewEmailTemplate,
  testSendEmailTemplate,
  updateEmailTemplate,
} from "@/lib/notifications-api";
import {
  codeInputClassName,
  ErrorBanner,
  Field,
  inputClassName,
  parseJsonObject,
  SettingsPanel,
  stringifyJson,
} from "./notification-ui";

export function EmailTemplateEditor({
  canManage,
  template,
}: {
  canManage: boolean;
  template: EmailTemplate;
}) {
  const router = useRouter();
  const readOnly = template.isSystem || !canManage;
  const [form, setForm] = useState({
    name: template.name,
    description: template.description ?? "",
    subjectTemplate: template.subjectTemplate,
    htmlTemplate: template.htmlTemplate,
    textTemplate: template.textTemplate ?? "",
    availableVariables: stringifyJson(template.availableVariables),
    status: template.status,
  });
  const [sampleVariables, setSampleVariables] = useState(() =>
    stringifyJson(buildSampleVariables(template.availableVariables)),
  );
  const [recipient, setRecipient] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [preview, setPreview] = useState<RenderedTemplate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const variables = useMemo(
    () => Object.keys(template.availableVariables ?? {}),
    [template.availableVariables],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (readOnly) return;
    if (!form.name.trim() || !form.subjectTemplate.trim() || !form.htmlTemplate.trim()) {
      setError("Name, subject, and HTML template are required.");
      return;
    }
    if (/<script[\s>]/i.test(form.htmlTemplate)) {
      setError("Script tags are not allowed in email templates.");
      return;
    }

    setBusy("save");
    try {
      const availableVariables = parseJsonObject(
        form.availableVariables,
        "Available variables must be a JSON object.",
      );
      await updateEmailTemplate(template.id, {
        name: form.name,
        description: form.description || null,
        subjectTemplate: form.subjectTemplate,
        htmlTemplate: form.htmlTemplate,
        textTemplate: form.textTemplate || null,
        availableVariables,
        status: form.status,
      });
      setMessage("Template saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save template.");
    } finally {
      setBusy(null);
    }
  }

  async function renderPreview() {
    setError(null);
    setMessage(null);
    setBusy("preview");
    try {
      const variablesPayload = parseJsonObject(
        sampleVariables,
        "Sample variables must be a JSON object.",
      );
      setPreview(await previewEmailTemplate(template.id, variablesPayload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to render preview.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setError(null);
    setMessage(null);
    if (!recipient.trim()) {
      setError("Recipient email is required.");
      return;
    }
    setBusy("test");
    try {
      const variablesPayload = parseJsonObject(
        sampleVariables,
        "Test variables must be a JSON object.",
      );
      await testSendEmailTemplate(template.id, {
        recipient,
        variables: variablesPayload,
        dryRun,
      });
      setMessage(dryRun ? "Dry run completed and logged." : "Test email sent.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to test template.");
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

      <form className="grid gap-6" onSubmit={save}>
        <SettingsPanel
          title="Template Definition"
          description={
            template.isSystem
              ? "System templates are read-only. Clone one into your tenant before editing."
              : "Edit tenant-owned template source. Rendering and delivery always happen through backend templates."
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" required>
              <input
                className={inputClassName}
                disabled={readOnly}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                value={form.name}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClassName}
                disabled={readOnly}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as typeof form.status,
                  }))
                }
                value={form.status}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </Field>
            <Field label="Description">
              <input
                className={inputClassName}
                disabled={readOnly}
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
                disabled={readOnly}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    subjectTemplate: event.target.value,
                  }))
                }
                value={form.subjectTemplate}
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="HTML Template" required>
              <textarea
                className={`${codeInputClassName} min-h-[260px]`}
                disabled={readOnly}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    htmlTemplate: event.target.value,
                  }))
                }
                value={form.htmlTemplate}
              />
            </Field>
            <Field label="Text Template">
              <textarea
                className={`${codeInputClassName} min-h-[140px]`}
                disabled={readOnly}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    textTemplate: event.target.value,
                  }))
                }
                value={form.textTemplate}
              />
            </Field>
            <Field label="Available Variables JSON">
              <textarea
                className={`${codeInputClassName} min-h-[160px]`}
                disabled={readOnly}
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
          <div className="mt-5 flex justify-end">
            <Button disabled={readOnly} loading={busy === "save"} type="submit">
              Save Template
            </Button>
          </div>
        </SettingsPanel>
      </form>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <SettingsPanel title="Variables" description="Variables are rendered as {{variableName}} placeholders.">
          {variables.length ? (
            <div className="flex flex-wrap gap-2">
              {variables.map((variable) => (
                <span
                  className="rounded-full border border-border bg-white px-3 py-1 font-mono text-xs text-foreground"
                  key={variable}
                >
                  {`{{${variable}}}`}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No variables declared.</p>
          )}
        </SettingsPanel>

        <SettingsPanel title="Preview and Test Send">
          <Field label="Sample/Test Variables JSON">
            <textarea
              className={`${codeInputClassName} min-h-[160px]`}
              onChange={(event) => setSampleVariables(event.target.value)}
              value={sampleVariables}
            />
          </Field>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              loading={busy === "preview"}
              onClick={renderPreview}
              type="button"
              variant="secondary"
            >
              Render Preview
            </Button>
          </div>
          {preview ? (
            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-border bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Subject
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {preview.renderedSubject}
                </div>
                {preview.missingVariables.length ? (
                  <div className="mt-2 text-xs text-red-600">
                    Missing: {preview.missingVariables.join(", ")}
                  </div>
                ) : null}
              </div>
              <iframe
                className="h-[420px] w-full rounded-2xl border border-border bg-white"
                sandbox=""
                srcDoc={preview.renderedHtml}
                title="Email HTML preview"
              />
              <pre className="max-h-60 overflow-auto rounded-2xl border border-border bg-white p-4 text-xs text-muted">
                {preview.renderedText ?? "No text template rendered."}
              </pre>
            </div>
          ) : null}
          <div className="mt-6 grid gap-4 rounded-2xl border border-border bg-white p-4 md:grid-cols-[1fr_auto_auto] md:items-end">
            <Field label="Recipient email">
              <input
                className={inputClassName}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="person@example.com"
                type="email"
                value={recipient}
              />
            </Field>
            <label className="flex items-center gap-2 pb-3 text-sm font-medium text-foreground">
              <input
                checked={dryRun}
                className="h-4 w-4 rounded border-border"
                onChange={(event) => setDryRun(event.target.checked)}
                type="checkbox"
              />
              Dry run
            </label>
            <Button
              disabled={!canManage}
              loading={busy === "test"}
              onClick={sendTest}
              type="button"
            >
              Test Send
            </Button>
          </div>
        </SettingsPanel>
      </div>
    </div>
  );
}

function buildSampleVariables(definitions: Record<string, unknown>) {
  const sample: Record<string, unknown> = {};
  for (const key of Object.keys(definitions ?? {})) {
    sample[key] =
      key.toLowerCase().includes("url")
        ? "https://example.com/action"
        : key.toLowerCase().includes("email")
          ? "support@example.com"
          : key.toLowerCase().includes("color")
            ? "#2563eb"
            : `Sample ${key}`;
  }
  return sample;
}
