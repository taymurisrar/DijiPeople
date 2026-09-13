"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { SelectField, TextField } from "@/app/components/ui/form-control";
import type {
  EmailTemplateScopeLevel,
  RenderedTemplate,
  TemplateScopeOptions,
} from "@/lib/notifications-api";
import {
  ScopePicker,
  type ScopeValue,
  validateScope,
} from "../../_components/scope-picker";
import {
  activateTemplate,
  createTemplate,
  previewDraftTemplate,
  previewSavedTemplate,
  sendTestTemplate,
  updateTemplate,
  type EditableEmailTemplate,
  type EmailTemplateAuthoringEvent,
} from "../templates/_lib/email-template-client";
import {
  buildCreatePayload,
  buildDraftPreviewPayload,
  buildSavedPreviewPayload,
  buildTestSendPayload,
  buildUpdatePayload,
  describeTestSendResult,
  formatToken,
  insertTokenAt,
  isBodyEmpty,
  unknownTokens,
} from "../templates/_lib/email-template-editing";
import {
  EmailTemplateRichTextEditor,
  type RichTextEditorHandle,
} from "./email-template-rich-text-editor";
import { EmailTemplatePreview } from "./email-template-preview";
import { EmailTemplateVariableMenu } from "./email-template-variable-menu";
import {
  ErrorBanner,
  inputClassName,
  SettingsPanel,
  StatusBadge,
} from "./notification-ui";

/*
 * ITEM-0181. One editor for creating and editing a tenant email template.
 *
 * There is no HTML or JSON for the administrator to type. The event decides
 * which variables exist (the API reads them from its catalog) and where a new
 * template starts from (the system default copy for that event); the key is
 * derived on the server. The preview re-renders through the API a moment after
 * each change, so it shows exactly what the sanitiser keeps and what a
 * recipient would read.
 */

type ComposerProps =
  | {
      mode: "create";
      canManage: boolean;
      events: EmailTemplateAuthoringEvent[];
      scopeOptions: TemplateScopeOptions | null;
    }
  | {
      mode: "edit";
      canManage: boolean;
      scopeOptions: TemplateScopeOptions | null;
      template: EditableEmailTemplate;
    };

const PREVIEW_DELAY_MS = 400;

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function EmailTemplateComposer(props: ComposerProps) {
  const router = useRouter();
  const subjectId = useId();
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const previewSequence = useRef(0);

  const template = props.mode === "edit" ? props.template : null;
  const events = props.mode === "create" ? props.events : [];
  const firstEvent = events[0] ?? null;

  const [eventCode, setEventCode] = useState(firstEvent?.code ?? "");
  const [name, setName] = useState(template?.name ?? firstEvent?.name ?? "");
  const [subject, setSubject] = useState(
    template?.subjectTemplate ?? firstEvent?.defaultContent.subjectTemplate ?? "",
  );
  const [html, setHtml] = useState(
    template?.htmlTemplate ?? firstEvent?.defaultContent.htmlTemplate ?? "",
  );
  const [scope, setScope] = useState<ScopeValue>({
    scopeLevel:
      template && template.scopeLevel !== "SYSTEM"
        ? (template.scopeLevel as EmailTemplateScopeLevel)
        : "TENANT",
    scopeId: template?.scopeId ?? null,
    moduleKey: template?.moduleKey ?? null,
  });
  const [nameTouched, setNameTouched] = useState(false);
  const [contentTouched, setContentTouched] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [rendered, setRendered] = useState<RenderedTemplate | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [busy, setBusy] = useState<"save" | "activate" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [testResult, setTestResult] = useState<ReturnType<
    typeof describeTestSendResult
  > | null>(null);

  const selectedEvent = events.find((event) => event.code === eventCode) ?? null;
  const variables = template?.variables ?? selectedEvent?.variables ?? [];
  const unknown = unknownTokens(
    { subjectTemplate: subject, htmlTemplate: html },
    variables,
  );
  const templateId = template?.id ?? null;
  const canPreview =
    subject.trim().length > 0 &&
    !isBodyEmpty(html) &&
    (templateId !== null || eventCode.length > 0);

  useEffect(() => {
    if (!canPreview) return;
    const sequence = ++previewSequence.current;
    const handle = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const content = { subjectTemplate: subject, htmlTemplate: html };
        const result = templateId
          ? await previewSavedTemplate(templateId, buildSavedPreviewPayload(content))
          : await previewDraftTemplate(buildDraftPreviewPayload(eventCode, content));
        if (sequence !== previewSequence.current) return;
        setRendered(result);
        setPreviewError(null);
      } catch (err) {
        if (sequence !== previewSequence.current) return;
        setPreviewError(messageOf(err, "The preview could not be rendered."));
      } finally {
        if (sequence === previewSequence.current) setPreviewLoading(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [canPreview, eventCode, html, subject, templateId]);

  function changeContent() {
    setContentTouched(true);
    setDirty(true);
  }

  function selectEvent(code: string) {
    setEventCode(code);
    setDirty(true);
    const next = events.find((event) => event.code === code);
    if (!next) return;
    if (!contentTouched) {
      setSubject(next.defaultContent.subjectTemplate);
      setHtml(next.defaultContent.htmlTemplate);
    }
    if (!nameTouched) setName(next.name);
  }

  function insertIntoSubject(key: string) {
    const input = subjectRef.current;
    const next = insertTokenAt(
      subject,
      input?.selectionStart ?? null,
      input?.selectionEnd ?? null,
      key,
    );
    setSubject(next.value);
    changeContent();
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(next.caret, next.caret);
    });
  }

  async function save(activate: boolean) {
    setError(null);
    setMessage(null);
    if (!name.trim()) return setError("Name is required.");
    if (props.mode === "create" && !eventCode) return setError("Select an event.");
    if (!subject.trim()) return setError("Subject is required.");
    if (isBodyEmpty(html)) return setError("Message is required.");
    if (unknown.length) {
      return setError(`Not supplied by this event: ${unknown.join(", ")}.`);
    }
    const scopeError = validateScope(scope);
    if (scopeError) return setError(scopeError);

    setBusy(activate ? "activate" : "save");
    try {
      if (props.mode === "create") {
        const created = await createTemplate(
          buildCreatePayload(
            {
              name,
              eventCode,
              subjectTemplate: subject,
              htmlTemplate: html,
              status: activate ? "ACTIVE" : "DRAFT",
            },
            scope,
          ),
        );
        /*
         * The destination is a server component that fetches the template it
         * renders, so it is already current. Calling refresh() here would race
         * the navigation and leave the user on the create form.
         */
        router.push(`/settings/notifications/templates/${created.id}`);
        return;
      }

      await updateTemplate(
        props.template.id,
        buildUpdatePayload(
          { name, subjectTemplate: subject, htmlTemplate: html },
          scope,
        ),
      );
      if (activate) await activateTemplate(props.template.id);
      setDirty(false);
      setMessage(activate ? "Saved and activated." : "Saved.");
      router.refresh();
    } catch (err) {
      setError(messageOf(err, "The template could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!templateId) return;
    setError(null);
    setTestResult(null);
    if (dirty) return setError("Save your changes before sending a test.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
      return setError("Enter a valid recipient email.");
    }

    setBusy("test");
    try {
      const result = await sendTestTemplate(
        templateId,
        buildTestSendPayload(recipient),
      );
      setTestResult(describeTestSendResult(result.status));
    } catch (err) {
      setError(messageOf(err, "The test email could not be sent."));
    } finally {
      setBusy(null);
    }
  }

  const readOnly = !props.canManage;

  return (
    <div className="grid gap-6">
      <ErrorBanner message={error} />
      {message ? (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <div className="grid min-w-0 gap-6">
          <SettingsPanel title="Template">
            <fieldset className="grid gap-4" disabled={readOnly}>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Name"
                  maxLength={160}
                  onChange={(next) => {
                    setName(next);
                    setNameTouched(true);
                    setDirty(true);
                  }}
                  required
                  value={name}
                />
                {props.mode === "create" ? (
                  <SelectField
                    label="Event"
                    onChange={selectEvent}
                    options={events.map((event) => ({
                      value: event.code,
                      label: event.name,
                    }))}
                    required
                    value={eventCode}
                  />
                ) : (
                  <div className="space-y-2 text-sm">
                    <span className="block font-medium text-foreground">Status</span>
                    <StatusBadge status={props.template.status} />
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-end justify-between gap-3">
                  <label className="font-medium text-foreground" htmlFor={subjectId}>
                    Subject
                    <span className="ml-1 text-danger">*</span>
                  </label>
                  <EmailTemplateVariableMenu
                    onPick={insertIntoSubject}
                    variables={variables}
                  />
                </div>
                <input
                  className={inputClassName}
                  id={subjectId}
                  maxLength={300}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    changeContent();
                  }}
                  ref={subjectRef}
                  value={subject}
                />
              </div>

              <EmailTemplateRichTextEditor
                label="Message"
                onChange={(next) => {
                  setHtml(next);
                  changeContent();
                }}
                ref={editorRef}
                toolbarEnd={
                  <EmailTemplateVariableMenu
                    onPick={(key) => editorRef.current?.insertText(formatToken(key))}
                    variables={variables}
                  />
                }
                value={html}
              />
            </fieldset>
          </SettingsPanel>

          <SettingsPanel title="Applies to">
            <ScopePicker
              disabled={readOnly}
              onChange={(next) => {
                setScope(next);
                setDirty(true);
              }}
              options={props.scopeOptions}
              value={scope}
            />
          </SettingsPanel>

          {props.canManage ? (
            <div className="flex flex-wrap justify-end gap-3">
              {props.mode === "create" ? (
                <Button
                  href="/settings/notifications/templates"
                  variant="secondary"
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                disabled={busy !== null && busy !== "save"}
                loading={busy === "save"}
                onClick={() => save(false)}
                type="button"
                variant="secondary"
              >
                {props.mode === "create" ? "Save as draft" : "Save"}
              </Button>
              {props.mode === "create" || props.template.status !== "ACTIVE" ? (
                <Button
                  disabled={busy !== null && busy !== "activate"}
                  loading={busy === "activate"}
                  onClick={() => save(true)}
                  type="button"
                >
                  Save and activate
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-6 xl:sticky xl:top-6">
          <EmailTemplatePreview
            error={previewError}
            loading={previewLoading}
            rendered={canPreview ? rendered : null}
            unknownVariables={unknown}
          />

          {templateId && props.canManage ? (
            <SettingsPanel title="Send a test">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <TextField
                  autoComplete="email"
                  label="Recipient email"
                  onChange={setRecipient}
                  type="email"
                  value={recipient}
                />
                <Button
                  loading={busy === "test"}
                  onClick={sendTest}
                  type="button"
                  variant="secondary"
                >
                  Send test
                </Button>
              </div>
              {testResult ? (
                <p
                  className={`mt-3 text-sm ${
                    testResult.tone === "success" ? "text-emerald-700" : "text-red-700"
                  }`}
                  role="status"
                >
                  {testResult.message}
                </p>
              ) : null}
            </SettingsPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
